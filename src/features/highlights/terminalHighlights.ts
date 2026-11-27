import type { IDecoration, IDisposable, ILink, IMarker, Terminal } from '@xterm/xterm'
import { ipc } from '../../lib/ipc'
import type { HighlightSettings } from '../../shared/types'
import { openLink } from '../browser/links'
import {
  type CompiledRule,
  classifyLine,
  compileRules,
  diffLine,
  findCustom,
  findLinks,
  findTokens,
  findTriggers,
  type Severity,
  type TextMatch,
  type TokenKind,
  type TriggerHit,
  triggerGate,
} from './matchers'

export interface HighlightColors {
  error: string
  warning: string
}

interface Options {
  settings: HighlightSettings
  colors: HighlightColors
  /** Pasta atual da aba (para resolver caminhos relativos). */
  cwd: () => string | null
  /** Linha de erro/aviso nova (para o contador da aba). */
  onSeverity: (severity: Severity) => void
  /** Uma regra com avisar/marcar casou com uma linha nova (já limitado a um por regra a cada 5 s). */
  onTrigger?: (hit: TriggerHit) => void
}

/** Quantas linhas para trás olhar depois de uma saída grande (o resto fica sem marca). */
const MAX_SCAN = 2000
/** Intervalo da varredura: com saída contínua ela roda a cada SCAN_MS, sem esperar a saída parar. */
const SCAN_MS = 80

const hexAlpha = (hex: string, alpha: number) => {
  const n = Number.parseInt(hex.slice(1), 16)
  return `rgb(${(n >> 16) & 255} ${(n >> 8) & 255} ${n & 255} / ${alpha * 100}%)`
}

/**
 * Destaques na saída do terminal:
 * - links: `arquivo:linha:coluna` (abre no VS Code), `localhost:porta` (abre no navegador),
 *   IPs e hashes do git (copiam);
 * - linhas de erro/aviso: fundo tingido, barra à esquerda e marca na régua da direita;
 * - níveis de log (INFO, WARN...), datas/horas e UUIDs coloridos;
 * - linhas de diff (+/-) tingidas de verde/vermelho, só dentro de um diff;
 * - regras próprias: trechos coloridos.
 *
 * As cores novas vêm da paleta ANSI do tema do terminal (term.options.theme), então seguem o tema.
 *
 * Só linhas que já passaram (acima do cursor) são marcadas, uma vez cada; o buffer alternativo
 * (vim, less, htop) é ignorado.
 */
export class TerminalHighlights implements IDisposable {
  private opts: Options
  private rules: CompiledRule[]
  /**
   * Até onde já foi varrido. É um marcador (e não um número de linha) porque, com o histórico de rolagem
   * cheio, cada linha nova descarta uma antiga e os índices absolutos param de crescer; o marcador acompanha.
   */
  private scanned: IMarker | undefined
  /** A saída está dentro de um diff (para não tingir "- item" de listas comuns). */
  private inDiff = false
  private timer: ReturnType<typeof setTimeout> | undefined
  /** Set: com o histórico cheio cada linha nova descarta decorações, e tirar de um array custaria O(n) cada. */
  private decorations = new Set<IDecoration>()
  private disposables: IDisposable[] = []
  private gate = triggerGate()

  constructor(
    private term: Terminal,
    opts: Options,
  ) {
    this.opts = opts
    this.rules = compileRules(opts.settings.rules)
    this.disposables.push(
      term.registerLinkProvider({ provideLinks: (y, cb) => cb(this.linksAt(y)) }),
      term.onWriteParsed(() => this.schedule()),
    )
  }

  /** Troca configurações/cores; regras novas e marcas valem para a saída daqui em diante. */
  update(opts: Partial<Options>) {
    this.opts = { ...this.opts, ...opts }
    if (opts.settings) this.rules = compileRules(opts.settings.rules)
  }

  private linksAt(y: number): ILink[] | undefined {
    const { settings } = this.opts
    const text = this.term.buffer.active.getLine(y - 1)?.translateToString(true)
    if (!text) return undefined
    const allowed = (m: TextMatch) =>
      (m.kind === 'file' && settings.fileLinks) ||
      (m.kind === 'hash' && settings.gitHashes) ||
      ((m.kind === 'address' || m.kind === 'ip') && settings.network)
    const links = findLinks(text)
      .filter(allowed)
      .map<ILink>((m) => ({
        range: { start: { x: m.start + 1, y }, end: { x: m.end, y } },
        text: m.text,
        decorations: { underline: true, pointerCursor: true },
        activate: (event: MouseEvent) => this.activate(m, event),
      }))
    return links.length ? links : undefined
  }

  private activate(m: TextMatch, event?: MouseEvent) {
    switch (m.kind) {
      case 'file':
        void ipc
          .openInEditor(m.path ?? m.text, m.line, m.column, this.opts.cwd())
          .catch((err) => this.term.write(`\r\n\x1b[33m⚠ ${String(err)}\x1b[0m\r\n`))
        return
      case 'address':
        openLink(`http://${m.text.replace('0.0.0.0', 'localhost')}`, event?.ctrlKey || event?.metaKey)
        return
      case 'hash':
      case 'ip':
        void ipc.writeClipboard(m.text)
        return
    }
  }

  /** Limita a frequência sem adiar: saída contínua (build, `tail -f`) é varrida a cada SCAN_MS. */
  private schedule() {
    if (this.timer !== undefined) return
    this.timer = setTimeout(() => {
      this.timer = undefined
      this.scan()
    }, SCAN_MS)
  }

  /**
   * Pula o que já está no buffer (o texto da sessão anterior, restaurado ao reabrir): ele fica sem
   * contador de erros e sem gatilhos, que são para saída nova.
   */
  skipExisting() {
    clearTimeout(this.timer)
    this.timer = undefined
    this.markScanned()
  }

  private markScanned() {
    this.scanned?.dispose()
    this.scanned = this.term.registerMarker(0)
  }

  private scan() {
    const { settings, colors, onSeverity } = this.opts
    const buf = this.term.buffer.active
    if (buf.type === 'alternate') return
    const cursorRow = buf.baseY + buf.cursorY
    // Marcador descartado: a linha saiu do histórico (saída maior que ele) ou houve um `clear`.
    const last = this.scanned && !this.scanned.isDisposed ? this.scanned.line : -1
    const from =
      last >= 0 && last <= cursorRow ? Math.max(last, cursorRow - MAX_SCAN) : Math.max(0, cursorRow - MAX_SCAN)
    const tokens = { logLevels: settings.logLevels, timestamps: settings.timestamps, uuids: settings.uuids }
    const anyToken = tokens.logLevels || tokens.timestamps || tokens.uuids
    if (!settings.severity && !settings.diffs && !anyToken && this.rules.length === 0) {
      this.markScanned()
      return
    }

    for (let row = from; row < cursorRow; row++) {
      const line = buf.getLine(row)
      // Linha quebrada continua a anterior: já foi tratada junto.
      if (!line || line.isWrapped) continue
      const text = line.translateToString(true)
      // Um marcador por linha, criado só se algo for marcado nela, e dividido entre as decorações.
      let rowMarker: IMarker | undefined
      const marker = () => {
        rowMarker ??= this.term.registerMarker(row - cursorRow)
        return rowMarker
      }
      if (settings.diffs) {
        const diff = diffLine(text, this.inDiff)
        this.inDiff = diff.inDiff
        if (diff.kind === 'added' || diff.kind === 'removed') {
          this.tintLine(marker(), this.ansi(diff.kind === 'added' ? 'green' : 'red'))
          continue
        }
        if (diff.kind === 'hunk') {
          this.paint(marker(), 0, text.length, this.ansi('cyan'))
          continue
        }
      }
      if (!text.trim()) continue
      // A linha lógica inteira (com as continuações quebradas) para classificar e para os gatilhos: um
      // "error" que caiu na segunda linha física também conta. As cores ficam na primeira linha física.
      const full = logicalText(buf, row, cursorRow, text)

      if (settings.severity) {
        const severity = classifyLine(full)
        if (severity) {
          this.markLine(marker(), severity === 'error' ? colors.error : colors.warning)
          onSeverity(severity)
        }
      }
      if (anyToken) {
        for (const t of findTokens(text, tokens))
          this.paint(marker(), t.start, t.end - t.start, this.tokenColor(t.kind))
      }
      if (this.opts.onTrigger) {
        for (const t of findTriggers(full, this.rules)) if (this.gate(t.pattern)) this.opts.onTrigger(t)
      }
      for (const hit of findCustom(text, this.rules)) {
        this.paint(marker(), hit.start, Math.max(1, hit.end - hit.start), hit.color)
      }
    }
    this.markScanned()
  }

  /** Cor da paleta ANSI do tema atual do terminal (com uma reserva neutra se o tema não tiver). */
  private ansi(name: 'red' | 'green' | 'yellow' | 'blue' | 'cyan' | 'magenta' | 'brightBlack'): string {
    const theme = this.term.options.theme ?? {}
    const value = theme[name]
    return typeof value === 'string' && /^#[0-9a-f]{6}$/i.test(value) ? value : (theme.foreground ?? '#888888')
  }

  private tokenColor(kind: TokenKind): string {
    switch (kind) {
      case 'level-error':
        return this.opts.colors.error
      case 'level-warning':
        return this.opts.colors.warning
      case 'level-info':
        return this.ansi('blue')
      case 'level-debug':
      case 'timestamp':
        return this.ansi('brightBlack')
      case 'uuid':
        return this.ansi('magenta')
    }
  }

  /** Pinta o texto de um trecho da linha (por cima das cores que o programa já mandou). */
  private paint(marker: IMarker | undefined, x: number, width: number, color: string) {
    if (width <= 0 || !marker) return
    const deco = this.term.registerDecoration({ marker, x, width, foregroundColor: color, layer: 'top' })
    if (deco) this.track(deco)
  }

  /** Fundo levemente tingido na linha inteira, sem barra nem régua (linhas de diff). */
  private tintLine(marker: IMarker | undefined, color: string) {
    if (!marker) return
    const deco = this.term.registerDecoration({ marker, x: 0, width: this.term.cols, layer: 'bottom' })
    if (!deco) return
    deco.onRender((el) => {
      el.style.background = hexAlpha(color, 0.14)
      el.style.pointerEvents = 'none'
    })
    this.track(deco)
  }

  private markLine(marker: IMarker | undefined, color: string) {
    if (!marker) return
    const deco = this.term.registerDecoration({
      marker,
      x: 0,
      width: this.term.cols,
      layer: 'bottom',
      overviewRulerOptions: { color, position: 'right' },
    })
    if (!deco) return
    deco.onRender((el) => {
      el.style.background = hexAlpha(color, 0.12)
      el.style.boxShadow = `inset 3px 0 0 ${color}`
      el.style.pointerEvents = 'none'
    })
    this.track(deco)
  }

  private track(deco: IDecoration) {
    this.decorations.add(deco)
    deco.onDispose(() => this.decorations.delete(deco))
  }

  dispose() {
    clearTimeout(this.timer)
    this.scanned?.dispose()
    for (const d of [...this.decorations]) d.dispose()
    for (const d of this.disposables) d.dispose()
  }
}

/** Limite de linhas físicas juntadas numa linha lógica (uma linha gigante não vira uma string gigante). */
const MAX_WRAPPED = 8

/** A linha `row` com as continuações quebradas que já passaram (antes de `end`). */
function logicalText(buf: Terminal['buffer']['active'], row: number, end: number, first: string): string {
  let text = first
  for (let r = row + 1; r < end && r <= row + MAX_WRAPPED; r++) {
    const next = buf.getLine(r)
    if (!next?.isWrapped) break
    text += next.translateToString(true)
  }
  return text
}
