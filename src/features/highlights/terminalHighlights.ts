import type { IDecoration, IDisposable, ILink, Terminal } from '@xterm/xterm'
import { ipc } from '../../lib/ipc'
import type { HighlightSettings } from '../../shared/types'
import {
  type CompiledRule,
  classifyLine,
  compileRules,
  findCustom,
  findLinks,
  type Severity,
  type TextMatch,
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
}

/** Quantas linhas para trás olhar depois de uma saída grande (o resto fica sem marca). */
const MAX_SCAN = 2000

const hexAlpha = (hex: string, alpha: number) => {
  const n = Number.parseInt(hex.slice(1), 16)
  return `rgb(${(n >> 16) & 255} ${(n >> 8) & 255} ${n & 255} / ${alpha * 100}%)`
}

/**
 * Destaques na saída do terminal:
 * - links: `arquivo:linha:coluna` (abre no VS Code), `localhost:porta` (abre no navegador),
 *   IPs e hashes do git (copiam);
 * - linhas de erro/aviso: fundo tingido, barra à esquerda e marca na régua da direita;
 * - regras próprias: trechos coloridos.
 *
 * Só linhas que já passaram (acima do cursor) são marcadas, uma vez cada; o buffer alternativo
 * (vim, less, htop) é ignorado.
 */
export class TerminalHighlights implements IDisposable {
  private opts: Options
  private rules: CompiledRule[]
  private scannedTo = 0
  private timer: ReturnType<typeof setTimeout> | undefined
  private decorations: IDecoration[] = []
  private disposables: IDisposable[] = []

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
        activate: () => this.activate(m),
      }))
    return links.length ? links : undefined
  }

  private activate(m: TextMatch) {
    switch (m.kind) {
      case 'file':
        void ipc
          .openInEditor(m.path ?? m.text, m.line, m.column, this.opts.cwd())
          .catch((err) => this.term.write(`\r\n\x1b[33m⚠ ${String(err)}\x1b[0m\r\n`))
        return
      case 'address':
        void ipc.openUrl(`http://${m.text.replace('0.0.0.0', 'localhost')}`)
        return
      case 'hash':
      case 'ip':
        void ipc.writeClipboard(m.text)
        return
    }
  }

  private schedule() {
    clearTimeout(this.timer)
    this.timer = setTimeout(() => this.scan(), 80)
  }

  private scan() {
    const { settings, colors, onSeverity } = this.opts
    const buf = this.term.buffer.active
    if (buf.type === 'alternate') return
    const cursorRow = buf.baseY + buf.cursorY
    // Depois de um `clear` o buffer encolhe: volta o ponteiro.
    if (this.scannedTo > cursorRow) this.scannedTo = 0
    const from = Math.max(this.scannedTo, cursorRow - MAX_SCAN)
    if (!settings.severity && this.rules.length === 0) {
      this.scannedTo = cursorRow
      return
    }

    for (let row = from; row < cursorRow; row++) {
      const line = buf.getLine(row)
      // Linha quebrada continua a anterior: já foi tratada junto.
      if (!line || line.isWrapped) continue
      const text = line.translateToString(true)
      if (!text.trim()) continue
      const offset = row - cursorRow

      if (settings.severity) {
        const severity = classifyLine(text)
        if (severity) {
          this.markLine(offset, severity === 'error' ? colors.error : colors.warning)
          onSeverity(severity)
        }
      }
      for (const hit of findCustom(text, this.rules)) {
        const marker = this.term.registerMarker(offset)
        if (!marker) continue
        const deco = this.term.registerDecoration({
          marker,
          x: hit.start,
          width: Math.max(1, hit.end - hit.start),
          foregroundColor: hit.color,
          layer: 'top',
        })
        if (deco) this.track(deco)
      }
    }
    this.scannedTo = cursorRow
  }

  private markLine(offset: number, color: string) {
    const marker = this.term.registerMarker(offset)
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
    this.decorations.push(deco)
    deco.onDispose(() => {
      const i = this.decorations.indexOf(deco)
      if (i >= 0) this.decorations.splice(i, 1)
    })
  }

  dispose() {
    clearTimeout(this.timer)
    for (const d of [...this.decorations]) d.dispose()
    for (const d of this.disposables) d.dispose()
  }
}
