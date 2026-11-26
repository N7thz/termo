import type { IDecoration, IDisposable, IMarker, Terminal } from '@xterm/xterm'
import { blocksToMarkdown, type ExportBlock } from './blockExport'
import { type BlockKeyAction, extendFocus, stepSelection } from './blockNav'
import { decodeCommand, findImagePaths, formatDuration, joinRows, stickyIndex, tail } from './blocks'
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
  /** Abre o filtro da saída de um bloco (BlockFilter.tsx). */
  filter?: (block: { command: string; output: string }) => void
  /** Reabre o comando na linha do shell (sem executar). */
  reopen?: (command: string) => void
  /** Salvar o comando como workflow (a tela dos workflows escuta o evento; veja SAVE_WORKFLOW_EVENT). */
  saveWorkflow?: (command: string) => void
  /** Manda os blocos ao Claude Code como contexto (sem Enter). */
  sendToClaude?: (blocks: ExportBlock[]) => void
  /** Abre o menu de exportar os blocos (junto do botão clicado, ou no canto com `null`). */
  exportBlocks?: (blocks: ExportBlock[], anchor: HTMLElement | null) => void
}

/** O que o cabeçalho fixo do comando mostra (veja `stickyAt`). */
export interface StickyBlock {
  command: string
  exitCode: number | null
  running: boolean
  startedAt: number
  endedAt: number | null
  /** Linha do prompt no buffer: o clique no cabeçalho rola até ela. */
  promptLine: number
}

/** Evento de `window` disparado por "Salvar como workflow"; `detail` é `{ command: string }`. */
export const SAVE_WORKFLOW_EVENT = 'termo:save-workflow'

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
  filter:
    '<svg viewBox="0 0 16 16" width="12" height="12" aria-hidden="true"><path d="M2.5 3.5h11L9.5 8.5v4l-3 1.5v-5.5z" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round"/></svg>',
  claude:
    '<svg viewBox="0 0 16 16" width="12" height="12" aria-hidden="true"><path d="M2.5 3.5h11v7h-6l-3 2.5v-2.5h-2z" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round"/><path d="M5.5 7h5" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/></svg>',
  export:
    '<svg viewBox="0 0 16 16" width="12" height="12" aria-hidden="true"><path d="M8 2.5v7M5 6.5l3 3 3-3M3 11.5v1.5h10v-1.5" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  workflow:
    '<svg viewBox="0 0 16 16" width="12" height="12" aria-hidden="true"><path d="M3 2.5h10v11l-5-3-5 3z" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round"/></svg>',
  image:
    '<svg viewBox="0 0 16 16" width="12" height="12" aria-hidden="true"><rect x="2" y="2.5" width="12" height="11" rx="1.8" fill="none" stroke="currentColor" stroke-width="1.4"/><circle cx="6" cy="6.3" r="1.2" fill="currentColor"/><path d="M2.8 12l3.6-3.4 2.4 2.2 1.8-1.6 2.6 2.6" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round"/></svg>',
}

export class CommandBlocks implements IDisposable {
  private blocks: CommandBlock[] = []
  private decorations = new Map<CommandBlock, IDecoration[]>()
  private promptStart: IMarker | null = null
  private pendingCommand = ''
  private running: CommandBlock | null = null
  private selected: CommandBlock | null = null
  /** Outra ponta da seleção de vários blocos (Shift+↑/↓); igual a `selected` com um bloco só. */
  private focus: CommandBlock | null = null
  private selection: IDecoration | null = null
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

  /**
   * O bloco que o cabeçalho fixo mostra quando a primeira linha visível é `top` (linha do buffer): o
   * comando já saiu da tela por cima e a saída dele ainda está lá. `null` se nenhum.
   */
  stickyAt(top: number): StickyBlock | null {
    const list = this.running ? [...this.blocks, this.running] : this.blocks
    const i = stickyIndex(
      list.map((b) => ({ promptLine: b.prompt.line, outputLine: b.output.line, endLine: b.end ? b.end.line : null })),
      top,
    )
    const b = list[i]
    if (!b?.command) return null
    return {
      command: b.command,
      exitCode: b.exitCode,
      running: b === this.running,
      startedAt: b.startedAt,
      endedAt: b.endedAt,
      promptLine: b.prompt.line,
    }
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

  /** Blocos que ainda têm a saída no buffer (os que rolaram para fora do histórico não entram). */
  private live(): CommandBlock[] {
    return this.blocks.filter((b) => b.end && !b.prompt.isDisposed && !b.end.isDisposed)
  }

  hasSelection(): boolean {
    return this.selected != null
  }

  /** Seleciona o bloco anterior ou o próximo, rola até ele e o destaca. */
  select(dir: 'prev' | 'next') {
    const list = this.live()
    const cur = this.selected ? list.indexOf(this.selected) : null
    const next = stepSelection(list.length, cur != null && cur >= 0 ? cur : null, dir)
    if (next == null) {
      this.clearSelection()
      if (dir === 'next') this.term.scrollToBottom()
      return
    }
    this.setSelected(list[next])
  }

  clearSelection() {
    this.selection?.dispose()
    this.selection = null
    this.selected = null
    this.focus = null
  }

  /** Estende a seleção para o bloco de cima ou de baixo (sem seleção, começa pelo último). */
  extend(dir: 'prev' | 'next') {
    const list = this.live()
    const anchor = this.selected ? list.indexOf(this.selected) : -1
    const focus = this.focus ? list.indexOf(this.focus) : -1
    if (anchor < 0 || focus < 0) return this.select('prev')
    this.setSelected(list[anchor], list[extendFocus(list.length, focus, dir)])
  }

  /** Blocos selecionados, em ordem (vazio sem seleção). */
  private selectedBlocks(): CommandBlock[] {
    const list = this.live()
    const a = this.selected ? list.indexOf(this.selected) : -1
    const b = this.focus ? list.indexOf(this.focus) : a
    if (a < 0) return []
    return list.slice(Math.min(a, b < 0 ? a : b), Math.max(a, b < 0 ? a : b) + 1)
  }

  private toExport(b: CommandBlock): ExportBlock {
    return {
      command: b.command,
      output: this.outputOf(b),
      exitCode: b.exitCode,
      cwd: b.cwd,
      durationMs: (b.endedAt ?? b.startedAt) - b.startedAt,
    }
  }

  private setSelected(anchor: CommandBlock, focus: CommandBlock = anchor) {
    this.selection?.dispose()
    this.selected = anchor
    this.focus = focus
    const first = anchor.prompt.line <= focus.prompt.line ? anchor : focus
    const last = first === anchor ? focus : anchor
    const top = first.prompt.line
    const bottom = last.end?.line ?? last.prompt.line + 1
    const height = Math.max(1, bottom - top)
    const dec = this.term.registerDecoration({
      marker: first.prompt,
      x: 0,
      width: this.term.cols,
      height,
      layer: 'top',
    })
    dec?.onRender((el) => {
      el.className = 'xterm-decoration termo-block-selected'
    })
    this.selection = dec ?? null
    // Deixa a seleção inteira à vista quando cabe; senão mostra a ponta que está se movendo.
    const rows = this.term.rows
    const view = this.term.buffer.active.viewportY
    if (height < rows) {
      if (top < view || bottom > view + rows) this.term.scrollToLine(Math.max(0, top - 1))
    } else if (focus === first) this.term.scrollToLine(top)
    else this.term.scrollToLine(Math.max(0, bottom - rows))
  }

  /** Ação de teclado sobre o bloco selecionado (BlockKeyAction vem de blockNav.ts). */
  perform(action: BlockKeyAction) {
    if (action === 'prev' || action === 'next') return this.select(action)
    if (action === 'extend-prev') return this.extend('prev')
    if (action === 'extend-next') return this.extend('next')
    const b = this.selected
    if (!b) return
    if (action === 'clear') return this.clearSelection()
    const many = () => this.selectedBlocks().map((x) => this.toExport(x))
    if (action === 'send-claude') {
      const blocks = many()
      this.clearSelection()
      return this.cb.sendToClaude?.(blocks)
    }
    if (action === 'copy-markdown') return this.cb.copy(blocksToMarkdown(many()))
    if (action === 'export') return this.cb.exportBlocks?.(many(), null)
    if (action === 'copy-output') return this.cb.copy(this.outputOf(b))
    if (action === 'copy-command') return this.cb.copy(b.command)
    if (action === 'reopen') {
      this.clearSelection()
      this.cb.reopen?.(b.command)
      return
    }
    if (action === 'filter') this.cb.filter?.({ command: b.command, output: this.outputOf(b) })
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
    const width = Math.min(
      this.term.cols,
      (failed && this.cb.explain ? 30 : 20) +
        images +
        (this.cb.filter ? 3 : 0) +
        (this.cb.saveWorkflow ? 3 : 0) +
        (this.cb.sendToClaude ? 3 : 0) +
        (this.cb.exportBlocks ? 3 : 0),
    )
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
    const filter = this.cb.filter
    if (filter)
      button(ICON.filter, 'Filtrar a saída (/)', () => filter({ command: b.command, output: this.outputOf(b) }))
    const save = this.cb.saveWorkflow
    if (save) button(ICON.workflow, 'Salvar como workflow', () => save(b.command))
    const send = this.cb.sendToClaude
    if (send) button(ICON.claude, 'Enviar ao Claude Code (Ctrl+Enter)', () => send([this.toExport(b)]))
    const exportBlocks = this.cb.exportBlocks
    if (exportBlocks) {
      const el = document.createElement('button')
      el.type = 'button'
      el.className = 'termo-block-button'
      el.innerHTML = ICON.export
      el.title = 'Exportar: Markdown, .txt ou imagem (E)'
      el.setAttribute('aria-label', 'Exportar o bloco')
      el.addEventListener('click', (e) => {
        e.stopPropagation()
        exportBlocks([this.toExport(b)], el)
      })
      box.append(el)
    }
    if (failed && this.cb.explain) {
      const explain = this.cb.explain
      button(ICON.spark, 'Explicar o erro com o Claude', () =>
        explain({ command: b.command, output: tail(this.outputOf(b), 6000), exitCode: b.exitCode ?? 1 }),
      )
    }
    return box
  }

  private disposeBlock(b: CommandBlock) {
    if (this.selected === b || this.focus === b) this.clearSelection()
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
