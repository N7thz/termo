import type { IDecoration, IDisposable, IMarker, Terminal } from '@xterm/xterm'
import { decodeCommand, findImagePaths, formatDuration, joinRows, tail } from './blocks'
import './commandBlocks.css'

/**
 * Blocos por comando, no estilo do Warp: cada comando que roda no PowerShell vira um bloco com uma barra
 * na margem (verde ou vermelha pelo código de saída) e, na linha do prompt, a duração e os botões de
 * copiar o comando, copiar a saída e (quando falhou) explicar o erro.
 *
 * Lê as marcas do shell (src-tauri/src/shell.rs): `133;A` início do prompt, `633;E` o comando digitado,
 * `133;C` o comando começou, `133;D;<código>` terminou. Os handlers devolvem `false` para que a
 * ShellIntegration (registrada antes) também receba as mesmas marcas.
 */

export interface CommandBlock {
  command: string
  exitCode: number | null
  startedAt: number
  endedAt: number | null
  /** Linha do prompt (onde o bloco começa). */
  prompt: IMarker
  /** Primeira linha da saída. */
  output: IMarker
  /** Linha logo depois da saída (o próximo prompt). */
  end: IMarker | null
  /** Pasta em que o comando rodou (para achar as imagens citadas com caminho relativo). */
  cwd: string | null
  /** Imagens citadas no comando ou na saída que existem (caminhos absolutos). */
  images: string[]
}

export interface BlockCallbacks {
  copy: (text: string) => void
  /** Pede à IA para explicar a falha de um bloco. */
  explain?: (block: { command: string; output: string; exitCode: number }) => void
  /** Cor real (não variável CSS) para a régua: o vermelho do tema do terminal. */
  failColor: () => string
  /** Pasta atual do shell (vem do prompt). */
  cwd?: () => string | null
  /** Dos nomes citados, as imagens que existem (o backend confere). */
  findImages?: (cwd: string | null, candidates: string[]) => Promise<string[]>
  /** Abre a prévia das imagens do bloco junto do botão que foi clicado. */
  showImages?: (paths: string[], anchor: HTMLElement) => void
}

/** Quantos blocos guardar com decorações (os mais antigos perdem os botões, a saída fica). */
const MAX_BLOCKS = 300

const ICON = {
  ok: '<svg viewBox="0 0 16 16" width="12" height="12" aria-hidden="true"><path d="M3.5 8.5l3 3 6-7" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  fail: '<svg viewBox="0 0 16 16" width="12" height="12" aria-hidden="true"><path d="M4.5 4.5l7 7M11.5 4.5l-7 7" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>',
  copy: '<svg viewBox="0 0 16 16" width="12" height="12" aria-hidden="true"><rect x="5.5" y="5.5" width="8" height="8" rx="1.5" fill="none" stroke="currentColor" stroke-width="1.4"/><path d="M10.5 3.5v-.5a1 1 0 0 0-1-1h-6a1 1 0 0 0-1 1v6a1 1 0 0 0 1 1h.5" fill="none" stroke="currentColor" stroke-width="1.4"/></svg>',
  output:
    '<svg viewBox="0 0 16 16" width="12" height="12" aria-hidden="true"><path d="M3 4h10M3 8h10M3 12h6" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/></svg>',
  spark:
    '<svg viewBox="0 0 16 16" width="12" height="12" aria-hidden="true"><path d="M8 1.5l1.6 4.9 4.9 1.6-4.9 1.6L8 14.5l-1.6-4.9L1.5 8l4.9-1.6z" fill="currentColor"/></svg>',
  image:
    '<svg viewBox="0 0 16 16" width="12" height="12" aria-hidden="true"><rect x="2" y="2.5" width="12" height="11" rx="1.8" fill="none" stroke="currentColor" stroke-width="1.4"/><circle cx="6" cy="6.3" r="1.2" fill="currentColor"/><path d="M2.8 12l3.6-3.4 2.4 2.2 1.8-1.6 2.6 2.6" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round"/></svg>',
}

export class CommandBlocks implements IDisposable {
  private blocks: CommandBlock[] = []
  private decorations = new Map<CommandBlock, IDecoration[]>()
  private promptStart: IMarker | null = null
  private pendingCommand = ''
  private running: CommandBlock | null = null
  private disposables: IDisposable[] = []

  constructor(
    private term: Terminal,
    private cb: BlockCallbacks,
  ) {
    this.disposables.push(
      term.parser.registerOscHandler(633, (data) => {
        if (data.startsWith('E;')) this.pendingCommand = decodeCommand(data.slice(2))
        return false
      }),
      term.parser.registerOscHandler(133, (data) => {
        if (data.startsWith('A')) this.onPromptStart()
        else if (data.startsWith('C')) this.onCommandStart()
        else if (data.startsWith('D')) this.onCommandEnd(data)
        return false
      }),
      // A largura dos blocos segue a do terminal.
      term.onResize(() => {
        for (const b of this.blocks) if (b.end) this.render(b)
      }),
    )
  }

  /** O último bloco que terminou com erro (para o "explicar erro" do menu e da paleta). */
  lastFailed(): { command: string; output: string; exitCode: number } | null {
    for (let i = this.blocks.length - 1; i >= 0; i--) {
      const b = this.blocks[i]
      if (b.end && b.exitCode && !b.prompt.isDisposed)
        return { command: b.command, output: this.outputOf(b), exitCode: b.exitCode }
    }
    return null
  }

  private onPromptStart() {
    this.promptStart?.dispose()
    this.promptStart = this.term.registerMarker(0) ?? null
  }

  private onCommandStart() {
    const prompt = this.promptStart
    const output = this.term.registerMarker(0)
    this.promptStart = null
    if (!prompt || !output) return
    this.running = {
      command: this.pendingCommand.trim(),
      exitCode: null,
      startedAt: Date.now(),
      endedAt: null,
      prompt,
      output,
      end: null,
      cwd: this.cb.cwd?.() ?? null,
      images: [],
    }
    this.pendingCommand = ''
  }

  /** Imagens citadas no comando ou na saída: se alguma existir, o bloco ganha o botão da prévia. */
  private lookForImages(b: CommandBlock) {
    const find = this.cb.findImages
    if (!find || !this.cb.showImages) return
    const candidates = findImagePaths(`${b.command}\n${this.outputOf(b)}`)
    if (candidates.length === 0) return
    void find(b.cwd, candidates)
      .then((paths) => {
        if (paths.length === 0 || !this.blocks.includes(b)) return
        b.images = paths
        this.render(b)
      })
      .catch(() => undefined)
  }

  private onCommandEnd(data: string) {
    const block = this.running
    this.running = null
    if (!block) return
    const code = Number.parseInt(data.split(';')[1] ?? '', 10)
    block.exitCode = Number.isFinite(code) ? code : null
    block.endedAt = Date.now()
    block.end = this.term.registerMarker(0) ?? null
    // Enter numa linha vazia não vira bloco.
    if (!block.command) {
      this.disposeBlock(block)
      return
    }
    this.blocks.push(block)
    while (this.blocks.length > MAX_BLOCKS) {
      const old = this.blocks.shift()
      if (old) this.disposeBlock(old)
    }
    this.render(block)
    this.lookForImages(block)
  }

  private outputOf(b: CommandBlock): string {
    const buf = this.term.buffer.normal
    const from = b.output.line
    const to = b.end?.line ?? buf.length
    if (from < 0 || to < from) return ''
    const rows = []
    for (let y = from; y < to; y++) {
      const line = buf.getLine(y)
      if (line) rows.push({ text: line.translateToString(true), wrapped: line.isWrapped })
    }
    return joinRows(rows)
  }

  private render(b: CommandBlock) {
    for (const d of this.decorations.get(b) ?? []) d.dispose()
    this.decorations.delete(b)
    if (b.prompt.isDisposed || !b.end || b.end.isDisposed) return
    const height = Math.max(1, b.end.line - b.prompt.line)
    const failed = b.exitCode != null && b.exitCode !== 0
    const list: IDecoration[] = []

    // Barra na margem esquerda, do prompt até o fim da saída.
    const bar = this.term.registerDecoration({
      marker: b.prompt,
      x: 0,
      width: 1,
      height,
      layer: 'top',
      overviewRulerOptions: failed ? { color: this.cb.failColor(), position: 'left' } : undefined,
    })
    bar?.onRender((el) => {
      el.className = `xterm-decoration termo-block-bar ${failed ? 'is-failed' : 'is-ok'}`
      el.style.width = '3px'
    })
    if (bar) list.push(bar)

    // Status, duração e botões, à direita da linha do prompt.
    const images = b.images.length > 0 && this.cb.showImages ? 6 : 0
    const width = Math.min(this.term.cols, (failed && this.cb.explain ? 30 : 20) + images)
    const tools = this.term.registerDecoration({
      marker: b.prompt,
      anchor: 'right',
      x: 0,
      width,
      height: 1,
      layer: 'top',
    })
    tools?.onRender((el) => {
      if (el.dataset.ready) return
      el.dataset.ready = '1'
      el.className = 'xterm-decoration termo-block-tools'
      el.append(this.toolbar(b, failed))
    })
    if (tools) list.push(tools)
    this.decorations.set(b, list)
  }

  private toolbar(b: CommandBlock, failed: boolean): HTMLElement {
    const box = document.createElement('div')
    box.className = 'termo-block-toolbar'
    // O mouse nos botões não pode começar uma seleção no terminal.
    box.addEventListener('mousedown', (e) => e.stopPropagation())

    const status = document.createElement('span')
    status.className = `termo-block-status ${failed ? 'is-failed' : 'is-ok'}`
    const duration = formatDuration((b.endedAt ?? b.startedAt) - b.startedAt)
    status.innerHTML = failed ? ICON.fail : ICON.ok
    const label = document.createElement('span')
    label.textContent = failed ? `${b.exitCode} · ${duration}` : duration
    status.append(label)
    status.title = failed ? `Saiu com o código ${b.exitCode} em ${duration}` : `Concluído em ${duration}`

    // Imagens citadas: o botão fica sempre à vista (os outros só aparecem com o mouse em cima).
    const show = this.cb.showImages
    if (b.images.length > 0 && show) {
      const el = document.createElement('button')
      el.type = 'button'
      el.className = 'termo-block-button termo-block-images'
      el.innerHTML = ICON.image
      const count = document.createElement('span')
      count.textContent = String(b.images.length)
      el.append(count)
      const label =
        b.images.length === 1 ? 'Ver a imagem deste comando' : `Ver as ${b.images.length} imagens deste comando`
      el.title = label
      el.setAttribute('aria-label', label)
      el.addEventListener('click', (e) => {
        e.stopPropagation()
        show(b.images, el)
      })
      box.append(el)
    }
    box.append(status)

    const button = (icon: string, label: string, run: () => void) => {
      const el = document.createElement('button')
      el.type = 'button'
      el.className = 'termo-block-button'
      el.innerHTML = icon
      el.title = label
      el.setAttribute('aria-label', label)
      el.addEventListener('click', (e) => {
        e.stopPropagation()
        run()
      })
      box.append(el)
    }
    button(ICON.copy, 'Copiar o comando', () => this.cb.copy(b.command))
    button(ICON.output, 'Copiar a saída', () => this.cb.copy(this.outputOf(b)))
    if (failed && this.cb.explain) {
      const explain = this.cb.explain
      button(ICON.spark, 'Explicar o erro com o Claude', () =>
        explain({ command: b.command, output: tail(this.outputOf(b), 6000), exitCode: b.exitCode ?? 1 }),
      )
    }
    return box
  }

  private disposeBlock(b: CommandBlock) {
    for (const d of this.decorations.get(b) ?? []) d.dispose()
    this.decorations.delete(b)
    b.prompt.dispose()
    b.output.dispose()
    b.end?.dispose()
  }

  dispose() {
    for (const b of this.blocks) this.disposeBlock(b)
    if (this.running) this.disposeBlock(this.running)
    this.promptStart?.dispose()
    this.blocks = []
    for (const d of this.disposables) d.dispose()
  }
}
