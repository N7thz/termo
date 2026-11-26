import { getCurrentWebview } from '@tauri-apps/api/webview'
import { FitAddon } from '@xterm/addon-fit'
import { ImageAddon } from '@xterm/addon-image'
import { LigaturesAddon } from '@xterm/addon-ligatures'
import { SearchAddon } from '@xterm/addon-search'
import { Unicode11Addon } from '@xterm/addon-unicode11'
import { WebLinksAddon } from '@xterm/addon-web-links'
import { WebglAddon } from '@xterm/addon-webgl'
import { type ITheme, Terminal } from '@xterm/xterm'
import { useEffect, useRef, useState } from 'react'
import { ipc } from '../../lib/ipc'
import type { GitInfo, PathSuggestion, SessionKind, Settings, TabLaunch } from '../../shared/types'
import type { AgentState } from '../agent-status/agentState'
import { AiPanel, type AiPanelState } from '../ai/AiPanel'
import { AttachmentStrip } from '../attachments/AttachmentStrip'
import { type Attachment, addAttachments, type PathTarget, pathsText } from '../attachments/attachments'
import { PathSuggestions, type SuggestionsPosition } from '../autocomplete/PathSuggestions'
import { extractQuery } from '../autocomplete/query'
import { ShellIntegration } from '../autocomplete/shellIntegration'
import { isTranslucent } from '../background/background'
import { type BlockExportAnchor, BlockExportMenu } from '../blocks/BlockExportMenu'
import { BlockFilter } from '../blocks/BlockFilter'
import { blocksForClaude, type ExportBlock } from '../blocks/blockExport'
import { blockKeyAction } from '../blocks/blockNav'
import { CommandBlocks, SAVE_WORKFLOW_EVENT } from '../blocks/commandBlocks'
import { ImagePreview, type ImagePreviewAnchor } from '../blocks/ImagePreview'
import { openLink } from '../browser/links'
import { ClaudeBar } from '../claude-bar/ClaudeBar'
import type { TerminalActions } from '../context-menu/types'
import type { Severity, TriggerHit } from '../highlights/matchers'
import { SearchBar } from '../highlights/SearchBar'
import { TerminalHighlights } from '../highlights/terminalHighlights'
import { HistorySearch } from '../history-search/HistorySearch'
import { CommandLog, type LoggedCommand } from '../history-search/history'
import { InputEditor, type InputEditorApi } from '../input/InputEditor'
import type { NodeInfo } from '../node-version/types'
import { type FinishedCommand, watchCommands } from '../notifications/notifications'
import { attachScrollback } from '../scrollback/scrollback'
import { terminalFontSize } from '../settings/interfaceSize'
import { MODE_TONE, modeOf } from '../shell-profiles/modes'
import { isAppShortcut } from '../tabs/shortcuts'
import { ContextBar } from './ContextBar'
import { CopyModeOverlay } from './CopyModeOverlay'
import { attachProgramOsc, type Progress } from './programOsc'
import { type CellGeometry, QuickSelectOverlay } from './QuickSelectOverlay'
import { findTargets, readScreen, type Target } from './quickSelect'

interface Props {
  kind: SessionKind
  /** Perfil de shell da aba (`pwsh`, `cmd`, `wsl:Ubuntu`...). Sem ele, vale `defaultShell`. Só vale na abertura. */
  shell?: string
  /** O backend abriu este shell: a aba guarda para a restauração reabrir igual. */
  onShell?: (shell: string) => void
  /** Aba com o foco (recebe o teclado). */
  active: boolean
  /** Aparece na tela; na tela dividida, a outra metade aparece sem ser a ativa. Padrão: `active`. */
  visible?: boolean
  /** O terminal recebeu o foco (clique na metade da tela dividida). */
  onFocus?: () => void
  settings: Settings
  /** Cores do terminal do tema ativo; trocam ao vivo. */
  terminalTheme: ITheme
  cwd?: string
  onTitle: (title: string) => void
  /** O backend pode trocar o tipo (ex.: Claude não instalado vira shell). */
  onKind: (kind: SessionKind) => void
  onClose: () => void
  /** Linha de erro/aviso nova na saída (para o contador da aba). */
  onSeverity?: (severity: Severity) => void
  /** Entrega as ações do xterm para o menu do botão direito; `null` quando o terminal some. */
  onActions?: (actions: TerminalActions | null) => void
  /** Pasta atual da aba (a cada mudança). */
  onCwd?: (cwd: string) => void
  /** Prompt novo: um comando terminou (bom momento para atualizar o git). */
  onPrompt?: () => void
  /** Estado do Claude Code da aba, vindo dos hooks (pensando, trabalhando, esperando...). */
  onAgent?: (state: AgentState) => void
  /** Um comando terminou (texto, código e duração), para o aviso de comando longo. */
  onCommandEnd?: (cmd: FinishedCommand) => void
  /** Id onde guardar o fim da saída (`undefined` = não guarda). Lido só ao abrir o terminal. */
  outputId?: string
  /** Escreve o texto guardado em `outputId` antes de abrir o shell (aba restaurada). */
  restoreOutput?: boolean
  /** Git da pasta da aba, para a linha de contexto (`null` fora de repositório). */
  git?: GitInfo | null
  /** Comando rodado no primeiro prompt da aba (ex.: `claude --resume <id>`, vindo da página de Sessões). */
  initialCommand?: string
  /** Aba do Claude aberta pela linha de comando (`termo.exe --claude ... -- <args>`): repassada ao claude. */
  launch?: TabLaunch
  /** O que a pessoa digitou nesta aba (para digitar em vários painéis). */
  onInput?: (data: string) => void
  /** Manda texto (os blocos selecionados) para uma aba do Claude Code, sem Enter. */
  onSendToClaude?: (text: string) => void
  /** Progresso mandado pelo programa (OSC 9;4); `null` quando acaba ou o processo sai. */
  onProgress?: (progress: Progress | null) => void
  /** Aviso mandado pelo programa (OSC 9 / OSC 777), já com a opção conferida e limitado no tempo. */
  onProgramNotice?: (title: string, body: string) => void
  /** Uma regra própria com avisar/marcar casou com uma linha nova da saída (gatilho). */
  onTrigger?: (hit: TriggerHit) => void
}

const highlightColors = (t: ITheme) => ({
  error: (t.red as string) ?? '#f7768e',
  warning: (t.yellow as string) ?? '#e0af68',
})

const dim = (s: string) => `\x1b[2m${s}\x1b[0m`
// A régua da direita (marcas e busca) vem com uma borda branca de 1px por padrão; sem ela, some a linha vertical.
const withRuler = (theme: ITheme): ITheme => {
  // Barra de rolagem discreta, na cor do texto do tema (o padrão do xterm é um branco forte).
  const fg = typeof theme.foreground === 'string' && /^#[0-9a-f]{6}$/i.test(theme.foreground) ? theme.foreground : null
  return {
    ...theme,
    overviewRulerBorder: 'transparent',
    ...(fg && {
      scrollbarSliderBackground: `${fg}26`,
      scrollbarSliderHoverBackground: `${fg}40`,
      scrollbarSliderActiveBackground: `${fg}59`,
    }),
  }
}

const warn = (s: string) => `\x1b[33m⚠ ${s}\x1b[0m\r\n`
/** Espaço mínimo acima do cursor para a lista abrir para cima. */
const ROOM_ABOVE = 140

export function TerminalView({
  kind,
  shell: shellProfile,
  active,
  visible = active,
  onFocus,
  settings,
  terminalTheme,
  cwd,
  onTitle,
  onKind,
  onShell,
  onClose,
  onSeverity,
  onActions,
  onCwd,
  onPrompt,
  onAgent,
  onCommandEnd,
  outputId,
  restoreOutput,
  git = null,
  initialCommand,
  launch,
  onInput,
  onSendToClaude,
  onProgress,
  onProgramNotice,
  onTrigger,
}: Props) {
  const wrapRef = useRef<HTMLDivElement>(null)
  const hostRef = useRef<HTMLDivElement>(null)
  const termRef = useRef<Terminal | null>(null)
  const fitRef = useRef<FitAddon | null>(null)
  const pickRef = useRef<(item: PathSuggestion) => void>(() => {})
  const dismissRef = useRef<() => void>(() => {})
  const [suggestions, setSuggestions] = useState<PathSuggestion[]>([])
  const [position, setPosition] = useState<SuggestionsPosition>({ left: 0, bottom: 0 })
  const suggestionsRef = useRef(suggestions)
  suggestionsRef.current = suggestions
  const cwdRef = useRef<string | null>(null)
  const highlightsRef = useRef<TerminalHighlights | null>(null)
  const [search, setSearch] = useState<SearchAddon | null>(null)
  // Editor de entrada: prompt ocioso (depois do 133;B), buffer alternativo (vim, less) e processo encerrado escondem a caixa.
  const [idle, setIdle] = useState(false)
  /** Explicação de erro pedida ao Claude pelo botão do bloco (null: painel fechado). */
  const [ai, setAi] = useState<AiPanelState | null>(null)
  /** Prévia das imagens citadas por um bloco (botão da imagem na barra do bloco). */
  const [images, setImages] = useState<{ paths: string[]; anchor: ImagePreviewAnchor } | null>(null)
  /** Menu de exportar os blocos (botão do bloco ou E com blocos selecionados). */
  const [exporting, setExporting] = useState<{ blocks: ExportBlock[]; anchor: BlockExportAnchor } | null>(null)
  const aiSeq = useRef(0)
  /** Busca no histórico (Ctrl+R): aberta com a busca inicial, ou null. */
  const [historySearch, setHistorySearch] = useState<{ query: string } | null>(null)
  const commandLog = useRef<LoggedCommand[]>([])
  const editorApi = useRef<InputEditorApi | null>(null)
  /** Põe o comando na linha do shell (ou na caixa do editor), rodando ou não. */
  const putCommandRef = useRef<(command: string, run: boolean) => void>(() => {})
  const openHistoryRef = useRef<() => void>(() => {})
  /** O Ctrl+R pode abrir a busca agora: shell no prompt, fora do buffer alternativo (vim, less). */
  const historyReadyRef = useRef(false)
  /** Filtro da saída de um bloco (botão do bloco ou `/` com o bloco selecionado). */
  const [blockFilter, setBlockFilter] = useState<{ command: string; output: string } | null>(null)
  const [altBuffer, setAltBuffer] = useState(false)
  const [dead, setDead] = useState(false)
  /** Id do pty e estado do Claude da aba, para a barra do Claude. */
  const [ptyId, setPtyId] = useState<number | null>(null)
  const [agentState, setAgentState] = useState<AgentState | null>(null)
  /** Manda bytes ao pty (definido quando a sessão abre). */
  const sendRef = useRef<(data: string) => void>(() => {})
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const historyRef = useRef<string[]>([])
  const submitRef = useRef<(text: string) => void>(() => {})
  const clearRef = useRef<() => void>(() => {})
  // Linha de contexto (Node, pasta, branch): pasta e node vêm do prompt.
  const [shellCwd, setShellCwd] = useState<string | null>(null)
  const [shellFamily, setShellFamily] = useState<'pwsh' | 'powershell' | 'cmd' | 'bash' | 'wsl'>('pwsh')
  const [node, setNode] = useState<NodeInfo | null>(null)
  const runRef = useRef<(command: string) => void>(() => {})
  const showEditor = settings.inputEditor && kind === 'shell' && idle && !altBuffer && !dead
  const showEditorRef = useRef(showEditor)
  showEditorRef.current = showEditor
  historyReadyRef.current = settings.historySearch && kind === 'shell' && idle && !altBuffer && !dead
  const openSearchRef = useRef<() => void>(() => {})
  /** Seleção rápida (Ctrl+Shift+Espaço): alvos da tela com rótulo e onde fica a grade de células. */
  const [quick, setQuick] = useState<{ targets: Target[]; geometry: CellGeometry } | null>(null)
  const [quickNote, setQuickNote] = useState<string | null>(null)
  const openQuickRef = useRef<() => void>(() => {})
  /** Modo de cópia (Ctrl+Shift+X): a grade de células enquanto está aberto. */
  const [copyMode, setCopyMode] = useState<CellGeometry | null>(null)
  const openCopyModeRef = useRef<() => void>(() => {})
  const insertTextRef = useRef<(text: string) => void>(() => {})
  // Arquivos que entraram na linha (imagem colada, arquivos arrastados): faixa de miniaturas.
  const [attachments, setAttachments] = useState<Attachment[]>([])
  const [attachError, setAttachError] = useState<string | null>(null)
  const [dropping, setDropping] = useState(false)
  const insertPathsRef = useRef<(paths: string[]) => void>(() => {})
  const pasteImageRef = useRef<() => void>(() => {})
  const clearAttachments = () => {
    setAttachments((l) => (l.length ? [] : l))
    setAttachError(null)
  }
  const activeRef = useRef(active)
  activeRef.current = active
  const kindRef = useRef(kind)
  kindRef.current = kind
  const shellFamilyRef = useRef(shellFamily)
  shellFamilyRef.current = shellFamily
  // Callbacks mudam a cada render; a ref evita recriar o terminal.
  const cbRef = useRef({
    onTitle,
    onKind,
    onShell,
    onClose,
    onSeverity,
    onActions,
    onCwd,
    onPrompt,
    onAgent,
    onCommandEnd,
    onInput,
    onSendToClaude,
    onProgress,
    onProgramNotice,
    onTrigger,
  })
  // Opções lidas pelos handlers do xterm, que vivem enquanto o terminal vive.
  const settingsRef = useRef(settings)
  settingsRef.current = settings
  cbRef.current = {
    onProgress,
    onProgramNotice,
    onTrigger,
    onTitle,
    onKind,
    onShell,
    onClose,
    onSeverity,
    onActions,
    onCwd,
    onPrompt,
    onAgent,
    onCommandEnd,
    onInput,
    onSendToClaude,
  }

  // biome-ignore lint/correctness/useExhaustiveDependencies: o terminal é criado uma vez por aba; a fonte é tratada no efeito abaixo
  useEffect(() => {
    const host = hostRef.current
    const wrap = wrapRef.current
    if (!host || !wrap) return
    let sessionId: number | null = null
    let pendingCommand = initialCommand ?? null
    let disposed = false
    let exited = false

    const term = new Terminal({
      fontFamily: settings.fontFamily,
      fontSize: terminalFontSize(settings.fontSize, settings.interfaceSize),
      lineHeight: 1.2,
      cursorBlink: true,
      cursorStyle: 'bar',
      allowProposedApi: true,
      scrollback: 10000,
      theme: withRuler(terminalTheme),
      // Fundo transparente quando há imagem de fundo atrás do terminal (features/background).
      allowTransparency: isTranslucent(terminalTheme.background),
      // Régua da direita: marcas de erro/aviso e resultados da busca.
      overviewRuler: { width: 8 },
      minimumContrastRatio: settings.minimumContrast,
    })
    termRef.current = term
    // Progresso, avisos e copiar mandados pelos programas (OSC 9;4, 9, 777 e 52).
    const programOsc = attachProgramOsc(term, {
      onProgress: (p) => cbRef.current.onProgress?.(p),
      onNotice: (title, body) => cbRef.current.onProgramNotice?.(title, body),
      onCopy: (text) => void ipc.writeClipboard(text).catch(() => undefined),
      allow: () => ({
        clipboard: settingsRef.current.oscClipboard,
        notifications: settingsRef.current.oscNotifications,
      }),
    })

    const fit = new FitAddon()
    fitRef.current = fit
    term.loadAddon(fit)
    term.loadAddon(new Unicode11Addon())
    term.unicode.activeVersion = '11'
    // Clique abre no painel ao lado ou no navegador, conforme a configuração; Ctrl+clique faz o contrário.
    term.loadAddon(new WebLinksAddon((e, uri) => openLink(uri, e.ctrlKey || e.metaKey)))
    // Imagens: Sixel (chafa, img2sixel) e protocolo inline do iTerm2 (imgcat).
    term.loadAddon(new ImageAddon({ sixelSupport: true, iipSupport: true, enableSizeReports: true }))

    const searchAddon = new SearchAddon()
    term.loadAddon(searchAddon)

    term.open(host)
    const shell = new ShellIntegration(
      term,
      (dir) => {
        cwdRef.current = dir
        setShellCwd(dir)
        void ipc.recordDir(dir).catch(() => undefined)
        cbRef.current.onCwd?.(dir)
      },
      () => {
        cbRef.current.onPrompt?.()
        // A cada prompt: a versão pode ter mudado (fnm use, cd com --use-on-cd) sem o caminho mudar.
        void ipc
          .nodeInfo(shell.node || null, shell.cwd)
          .then((info) => !disposed && setNode((cur) => (JSON.stringify(cur) === JSON.stringify(info) ? cur : info)))
          .catch(() => undefined)
      },
      (idle) => {
        setIdle(idle)
        // Primeiro prompt: roda o comando pedido na abertura da aba (uma vez só).
        if (idle && pendingCommand) {
          const command = pendingCommand
          pendingCommand = null
          window.setTimeout(() => runRef.current(command), 50)
        }
      },
    )
    // Comandos desta aba com a pasta em que rodaram: alimentam a busca no histórico (Ctrl+R).
    const log = new CommandLog(term, () => shell.cwd)
    commandLog.current = log.commands
    // Duração de cada comando, para o aviso do Windows de comando longo.
    const timer = watchCommands(term, (cmd) => cbRef.current.onCommandEnd?.(cmd))
    // Guarda o fim da saída para a próxima abertura (só abas de shell, com a opção ligada).
    const scroll = outputId ? attachScrollback(term, outputId) : null
    // Blocos por comando: barra de status na margem, duração e copiar/explicar na linha do prompt.
    const blocks = new CommandBlocks(term, {
      copy: (text) => void ipc.writeClipboard(text),
      failColor: () => term.options.theme?.red ?? term.options.theme?.foreground ?? 'red',
      cwd: () => shell.cwd,
      filter: (b) => setBlockFilter(b),
      reopen: (command) => {
        term.paste(command)
        term.focus()
      },
      saveWorkflow: (command) => window.dispatchEvent(new CustomEvent(SAVE_WORKFLOW_EVENT, { detail: { command } })),
      findImages: (dir, candidates) => ipc.imageExisting(dir, candidates),
      sendToClaude: (list) => cbRef.current.onSendToClaude?.(blocksForClaude(list)),
      exportBlocks: (list, button) => {
        const w = wrap.getBoundingClientRect()
        const b = button?.getBoundingClientRect()
        setExporting({
          blocks: list,
          anchor: b ? { right: Math.max(8, w.right - b.right), top: b.bottom - w.top + 6 } : { right: 12, top: 12 },
        })
      },
      showImages: (paths, button) => {
        const b = button.getBoundingClientRect()
        const w = wrap.getBoundingClientRect()
        setImages({ paths, anchor: { right: Math.max(8, w.right - b.right), top: b.bottom - w.top + 6 } })
      },
      explain: ({ command, output, exitCode }) => {
        const seq = ++aiSeq.current
        setAi({ command, status: 'loading', text: '' })
        const input = [`Comando: ${command}`, `Código de saída: ${exitCode}`, 'Saída:', output].join('\n')
        ipc
          .aiAsk('explain', input, shell.cwd)
          .then((text) => seq === aiSeq.current && setAi({ command, status: 'done', text }))
          .catch((err) => seq === aiSeq.current && setAi({ command, status: 'error', text: String(err) }))
      },
    })
    term.buffer.onBufferChange((b) => setAltBuffer(b.type === 'alternate'))
    const highlights = new TerminalHighlights(term, {
      settings: settings.highlights,
      colors: highlightColors(terminalTheme),
      cwd: () => shell.cwd ?? cwd ?? null,
      onSeverity: (s) => cbRef.current.onSeverity?.(s),
      // Só a saída do processo desta aba: o texto restaurado da última vez não dispara gatilho.
      onTrigger: (hit) => sessionId != null && cbRef.current.onTrigger?.(hit),
    })
    highlightsRef.current = highlights
    openSearchRef.current = () => setSearch(searchAddon)

    // Ligaduras antes do WebGL (o WebGL precisa vir depois para aplicar o font-feature-settings).
    // Com a fonte embutida (webfont), o addon usa o conjunto padrão de ligaduras comuns.
    try {
      term.loadAddon(new LigaturesAddon())
    } catch (err) {
      console.warn('[termo] ligaduras indisponíveis', err)
    }
    try {
      const webgl = new WebglAddon()
      webgl.onContextLoss(() => webgl.dispose())
      term.loadAddon(webgl)
    } catch (err) {
      console.warn('[termo] WebGL indisponível, usando renderizador DOM', err)
    }

    sendRef.current = (data) => send(data)
    const send = (data: string) => {
      if (sessionId != null) void ipc.write(sessionId, data)
    }

    // Copiar e colar compartilhados pelo teclado (Ctrl+C/Ctrl+V) e pelo menu do botão direito.
    const copySelection = () => {
      void ipc.writeClipboard(term.getSelection())
      term.clearSelection()
    }
    // Caminhos (imagem colada ou arquivos arrastados) entram na linha do shell ou na caixa estilo Warp.
    const insertText = (text: string) => {
      const editor = editorApi.current
      if (showEditorRef.current && editor) {
        const cur = editor.get()
        editor.set(`${cur.replace(/\s+$/, '')}${cur.trim() ? ' ' : ''}${text.trim()} `)
        inputRef.current?.focus()
      } else {
        term.paste(text)
        term.focus()
      }
    }
    insertTextRef.current = (text) => {
      if (!exited) insertText(text)
    }
    /** Onde fica a grade de células do xterm dentro do painel (para as camadas por cima dela). */
    const cellGeometry = (): CellGeometry | null => {
      const screen = term.element?.querySelector<HTMLElement>('.xterm-screen')
      if (!screen || term.rows === 0 || term.cols === 0) return null
      const s = screen.getBoundingClientRect()
      const w = wrap.getBoundingClientRect()
      return { left: s.left - w.left, top: s.top - w.top, cellW: s.width / term.cols, cellH: s.height / term.rows }
    }
    openQuickRef.current = () => {
      const geometry = cellGeometry()
      if (!geometry) return
      const targets = findTargets(readScreen(term))
      if (targets.length === 0) {
        setQuickNote('Nada para selecionar na tela')
        return
      }
      setQuickNote(null)
      setCopyMode(null)
      setQuick({ targets, geometry })
    }
    openCopyModeRef.current = () => {
      const geometry = cellGeometry()
      if (!geometry) return
      setQuick(null)
      setQuickNote(null)
      setCopyMode(geometry)
    }
    // A tela mudou de lugar: os rótulos ficariam sobre o texto errado.
    term.onScroll(() => setQuick(null))
    term.onResize(() => {
      setQuick(null)
      setCopyMode(null)
    })
    insertPathsRef.current = (paths) => {
      if (exited || paths.length === 0) return
      const target: PathTarget = kindRef.current === 'claude' ? 'claude' : shellFamilyRef.current
      insertText(pathsText(paths, target))
      setAttachError(null)
      setAttachments((list) => addAttachments(list, paths))
    }
    /** Imagem copiada (print): vira um PNG temporário. No Claude o Ctrl+V já anexou; aqui só a miniatura. */
    pasteImageRef.current = () => {
      if (kindRef.current === 'claude') send('\x16')
      ipc
        .clipboardSaveImage()
        .then((path) => {
          if (!path) return
          if (kindRef.current === 'claude') setAttachments((list) => addAttachments(list, [path]))
          else insertPathsRef.current([path])
        })
        .catch((err) => setAttachError(`Não deu para salvar a imagem colada: ${String(err)}`))
    }
    const pasteClipboard = () => {
      ipc
        .readClipboard()
        .then(({ text, hasImage }) => {
          if (text) term.paste(text)
          else if (hasImage) pasteImageRef.current()
        })
        .catch((err) => console.warn('[termo] falha ao ler a área de transferência', err))
    }
    // Ctrl+V de imagem na caixa estilo Warp (um textarea): o navegador não cola nada; vira o caminho.
    const onEditorPaste = (e: ClipboardEvent) => {
      if (e.target !== inputRef.current || !e.clipboardData || e.clipboardData.getData('text/plain')) return
      if ([...e.clipboardData.items].some((i) => i.kind === 'file' && i.type.startsWith('image/'))) {
        e.preventDefault()
        pasteImageRef.current()
      }
    }
    wrap.addEventListener('paste', onEditorPaste, true)
    // Arrastar arquivos para a janela: entram na aba com foco (na tela dividida, a metade ativa).
    let unlistenDrop: (() => void) | undefined
    let dropDisposed = false
    void getCurrentWebview()
      .onDragDropEvent(({ payload }) => {
        if (!activeRef.current || exited) return
        if (payload.type === 'enter' || payload.type === 'over') setDropping(true)
        else if (payload.type === 'leave') setDropping(false)
        else if (payload.type === 'drop') {
          setDropping(false)
          insertPathsRef.current(payload.paths)
        }
      })
      .then((fn) => {
        if (dropDisposed) fn()
        else unlistenDrop = fn
      })
      .catch(() => undefined)

    cbRef.current.onActions?.({
      hasSelection: () => term.hasSelection(),
      copy: () => {
        copySelection()
        term.focus()
      },
      paste: () => {
        pasteClipboard()
        term.focus()
      },
      selectAll: () => term.selectAll(),
      clear: () => {
        term.clear()
        term.focus()
      },
      find: () => openSearchRef.current(),
      quickSelect: () => openQuickRef.current(),
      copyMode: () => openCopyModeRef.current(),
      command: (text, run) => putCommandRef.current(text, run),
      pasteText: (text) => {
        term.focus()
        term.paste(text)
      },
      sendText: (text) => {
        term.focus()
        term.paste(text)
        // O Enter separado da colagem: dentro dela o Claude Code trataria como quebra de linha.
        window.setTimeout(() => send('\r'), 120)
      },
      ptyId: () => sessionId,
      write: (data) => {
        if (exited) return
        if (data.includes('\r')) {
          shell.commandSubmitted()
          hide()
          clearAttachments()
        }
        send(data)
      },
    })

    // ---- Sugestões de pasta: lê a linha digitada depois do prompt e lista `cd` clicáveis ----
    let refreshTimer: ReturnType<typeof setTimeout> | undefined
    let requestSeq = 0
    /** Linha em que a pessoa apertou Esc: não mostra de novo até ela digitar outra coisa. */
    let dismissedInput: string | null = null

    const hide = () => {
      requestSeq++
      setSuggestions([])
    }

    /** Posição da lista: alinhada ao começo da linha digitada, abrindo para cima do cursor. */
    const computePosition = (): SuggestionsPosition => {
      const screen = term.element?.querySelector('.xterm-screen')
      if (!screen) return { left: 0, bottom: 0 }
      const s = screen.getBoundingClientRect()
      const w = wrap.getBoundingClientRect()
      const cellW = s.width / term.cols
      const cellH = s.height / term.rows
      const cursorTop = s.top - w.top + term.buffer.active.cursorY * cellH
      const left = Math.max(4, Math.min(s.left - w.left + shell.inputColumn * cellW, w.width - 280))
      return cursorTop >= ROOM_ABOVE ? { left, bottom: w.height - cursorTop + 4 } : { left, top: cursorTop + cellH + 4 }
    }

    const refresh = () => {
      clearTimeout(refreshTimer)
      refreshTimer = setTimeout(async () => {
        const input = shell.readInput()
        const query = extractQuery(input)
        const dir = shell.cwd
        if (query == null || !dir || input === dismissedInput) return hide()
        dismissedInput = null
        const seq = ++requestSeq
        const items = await ipc.suggestPaths(dir, query).catch(() => [])
        if (disposed || seq !== requestSeq) return
        setPosition(computePosition())
        setSuggestions(items)
      }, 60)
    }

    /** Apaga o que foi digitado e executa o `cd` escolhido. */
    pickRef.current = (item) => {
      const typed = shell.readInput() ?? ''
      // End (vai para o fim da linha) + um Backspace por caractere digitado.
      send(`\x1b[F${'\x7f'.repeat(typed.length)}${item.command}\r`)
      shell.commandSubmitted()
      hide()
      term.focus()
    }

    /** Esc: fecha a lista e não reabre até a linha digitada mudar. */
    dismissRef.current = () => {
      dismissedInput = shell.readInput()
      hide()
      term.focus()
    }

    // Editor de entrada: manda a caixa para o pty pelo mesmo caminho do teclado do xterm.
    // Várias linhas vão uma por vez, cada uma com Enter: o PSReadLine continua sozinho blocos e strings abertas.
    submitRef.current = (text) => {
      send(`${text.split(/\r?\n/).join('\r')}\r`)
      shell.commandSubmitted()
      hide()
      term.focus()
    }
    clearRef.current = () => send('\x0c')
    // Comando vindo da linha de contexto (trocar o Node): apaga o que estiver digitado no prompt e executa.
    runRef.current = (command) => {
      const typed = shell.readInput() ?? ''
      send(`\x1b[F${'\x7f'.repeat(typed.length)}${command}\r`)
      shell.commandSubmitted()
      hide()
      if (showEditorRef.current) inputRef.current?.focus()
      else term.focus()
    }
    // Histórico e workflows: põe o comando na linha sem rodar (apagando o que estava digitado) ou roda.
    putCommandRef.current = (command, run) => {
      if (showEditorRef.current && editorApi.current) {
        if (run) submitRef.current(command)
        else {
          editorApi.current.set(command)
          inputRef.current?.focus()
        }
        return
      }
      const typed = shell.readInput() ?? ''
      // End (vai para o fim da linha) + um Backspace por caractere digitado.
      const clear = `\x1b[F${'\x7f'.repeat(typed.length)}`
      if (!command.includes('\n')) {
        send(`${clear}${command}${run ? '\r' : ''}`)
        if (run) {
          shell.commandSubmitted()
          hide()
        }
      } else {
        // Várias linhas: como colagem, para o shell não rodar cada linha ao receber o Enter.
        send(clear)
        term.paste(command)
        if (run) {
          window.setTimeout(() => {
            send('\r')
            shell.commandSubmitted()
            hide()
          }, 120)
        }
      }
      term.focus()
    }
    openHistoryRef.current = () => {
      if (!historyReadyRef.current) return
      hide()
      setHistorySearch({ query: showEditorRef.current ? (editorApi.current?.get() ?? '') : (shell.readInput() ?? '') })
    }

    // Copiar/colar pela área de transferência do sistema (via Rust); atalhos do app não vão ao shell.
    term.attachCustomKeyEventHandler((e) => {
      if (e.type !== 'keydown') return true
      if (isAppShortcut(e)) return false
      // Ctrl+R: busca no histórico do Termo (com a opção desligada, ou fora do prompt, vai para o shell).
      if (
        e.ctrlKey &&
        !e.shiftKey &&
        !e.altKey &&
        !e.metaKey &&
        e.key.toLowerCase() === 'r' &&
        historyReadyRef.current
      ) {
        e.preventDefault()
        openHistoryRef.current()
        return false
      }
      // Blocos: Ctrl+↑/↓ seleciona, e com um bloco selecionado Ctrl+C, Ctrl+Shift+C, Enter, / e Esc agem nele.
      if (kind === 'shell' && !term.buffer.active.type.startsWith('alt')) {
        const action = blockKeyAction(e, blocks.hasSelection(), term.hasSelection())
        if (action) {
          e.preventDefault()
          blocks.perform(action)
          return false
        }
        // Qualquer outra tecla de texto sai do modo de seleção e segue para o shell.
        if (blocks.hasSelection() && e.key.length === 1 && !e.ctrlKey && !e.altKey) blocks.clearSelection()
      }
      // Ctrl+Shift+F: busca na saída.
      if (e.ctrlKey && e.shiftKey && !e.altKey && e.key.toLowerCase() === 'f') {
        e.preventDefault()
        openSearchRef.current()
        return false
      }
      const items = suggestionsRef.current
      if (items.length > 0) {
        // Alt+1..9 executa a sugestão; Esc só fecha a lista.
        if (e.altKey && !e.ctrlKey && /^[1-9]$/.test(e.key)) {
          const item = items[Number(e.key) - 1]
          if (item) {
            e.preventDefault()
            pickRef.current(item)
            return false
          }
        }
        // Alt+↑/↓ leva o foco para a lista (setas navegam, Enter executa, Esc volta).
        if (e.altKey && !e.ctrlKey && (e.key === 'ArrowUp' || e.key === 'ArrowDown')) {
          e.preventDefault()
          wrap.querySelector<HTMLElement>('[data-slot="listbox-item"]')?.focus()
          return false
        }
        if (e.key === 'Escape') {
          dismissRef.current()
          return false
        }
      }
      const ctrl = e.ctrlKey && !e.altKey
      const key = e.key.toLowerCase()
      if (ctrl && key === 'c' && (e.shiftKey || term.hasSelection())) {
        copySelection()
        return false
      }
      if (ctrl && key === 'v') {
        e.preventDefault()
        pasteClipboard()
        return false
      }
      return true
    })

    term.onData((data) => {
      if (exited) return cbRef.current.onClose()
      if (data.includes('\r')) {
        shell.commandSubmitted()
        hide()
        clearAttachments()
      }
      send(data)
      cbRef.current.onInput?.(data)
    })
    term.onWriteParsed(refresh)
    term.onResize(({ cols, rows }) => {
      if (sessionId != null) void ipc.resize(sessionId, cols, rows)
    })
    term.onTitleChange((t) => cbRef.current.onTitle(t))

    const ro = new ResizeObserver(() => {
      if (host.offsetWidth > 0) fit.fit()
    })
    ro.observe(host)

    const start = async () => {
      // Espera a fonte para medir as células certo antes de abrir o processo.
      await document.fonts.load(`${settings.fontSize}px 'JetBrains Mono'`).catch(() => undefined)
      if (disposed) return
      fit.fit()
      // Texto da última vez (sessão restaurada), antes do shell novo.
      if (restoreOutput) await scroll?.restore()
      if (disposed) return
      try {
        const res = await ipc.createSession(
          { kind, cols: term.cols, rows: term.rows, cwd, shell: shellProfile, launch },
          (ev) => {
            if (ev.kind === 'data') {
              // Confirma só depois de desenhar: é o que segura o backend quando a saída é enorme.
              term.write(ev.data, () => {
                if (sessionId != null) void ipc.ack(sessionId, ev.bytes)
              })
            } else if (ev.kind === 'agent') {
              cbRef.current.onAgent?.(ev.state)
              setAgentState(ev.state)
            } else {
              exited = true
              setDead(true)
              hide()
              cbRef.current.onProgress?.(null)
              // Sessão aberta pelo coord: a aba some junto com o claude (ou com o fechar-sessao.ps1).
              if (launch?.closeOnExit) return cbRef.current.onClose()
              const code = ev.code == null ? '' : ` (código ${ev.code})`
              term.write(`\r\n${dim(`[processo encerrado${code}: pressione qualquer tecla para fechar a aba]`)}\r\n`)
            }
          },
        )
        if (disposed) return void ipc.kill(res.id)
        sessionId = res.id
        setPtyId(res.id)
        for (const w of res.warnings) term.write(warn(w))
        if (res.kind !== kind) cbRef.current.onKind(res.kind)
        setShellFamily(
          res.shell.startsWith('wsl')
            ? 'wsl'
            : res.shell.startsWith('ssh:')
              ? 'bash'
              : (res.shell as 'pwsh' | 'powershell' | 'cmd' | 'bash'),
        )
        cbRef.current.onShell?.(res.shell)
        term.focus()
      } catch (err) {
        exited = true
        term.write(`\x1b[31m✖ Não foi possível abrir o terminal: ${String(err)}\x1b[0m\r\n`)
        term.write(dim('[pressione qualquer tecla para fechar a aba]'))
      }
    }
    void start()

    return () => {
      disposed = true
      clearTimeout(refreshTimer)
      ro.disconnect()
      wrap.removeEventListener('paste', onEditorPaste, true)
      if (sessionId != null) void ipc.kill(sessionId)
      highlights.dispose()
      highlightsRef.current = null
      cbRef.current.onActions?.(null)
      blocks.dispose()
      log.dispose()
      timer.dispose()
      scroll?.dispose()
      shell.dispose()
      dropDisposed = true
      unlistenDrop?.()
      programOsc.dispose()
      cbRef.current.onProgress?.(null)
      term.dispose()
    }
  }, [])

  // Configurações e cores dos destaques valem para a saída daqui em diante.
  useEffect(() => {
    highlightsRef.current?.update({ settings: settings.highlights, colors: highlightColors(terminalTheme) })
  }, [settings.highlights, terminalTheme])

  useEffect(() => {
    const term = termRef.current
    if (!term) return
    term.options.fontFamily = settings.fontFamily
    term.options.fontSize = terminalFontSize(settings.fontSize, settings.interfaceSize)
    fitRef.current?.fit()
  }, [settings.fontFamily, settings.fontSize, settings.interfaceSize])

  useEffect(() => {
    const term = termRef.current
    if (!term) return
    term.options.allowTransparency = isTranslucent(terminalTheme.background)
    term.options.theme = withRuler(terminalTheme)
  }, [terminalTheme])

  useEffect(() => {
    if (termRef.current) termRef.current.options.minimumContrastRatio = settings.minimumContrast
  }, [settings.minimumContrast])

  // Ctrl+Shift+Espaço abre a seleção rápida e Ctrl+Shift+X o modo de cópia, do xterm ou do editor de
  // entrada (captura antes deles).
  useEffect(() => {
    const wrap = wrapRef.current
    if (!wrap) return
    const onKey = (e: KeyboardEvent) => {
      if (!e.ctrlKey || !e.shiftKey || e.altKey || e.metaKey) return
      const open = e.code === 'Space' ? openQuickRef : e.code === 'KeyX' ? openCopyModeRef : null
      if (!open) return
      e.preventDefault()
      e.stopPropagation()
      open.current()
    }
    wrap.addEventListener('keydown', onKey, true)
    return () => wrap.removeEventListener('keydown', onKey, true)
  }, [])

  // "Copiado" e "nada para selecionar" somem sozinhos.
  useEffect(() => {
    if (!quickNote) return
    const t = window.setTimeout(() => setQuickNote(null), 1600)
    return () => window.clearTimeout(t)
  }, [quickNote])

  const closeQuick = () => {
    setQuick(null)
    requestAnimationFrame(() => {
      if (showEditorRef.current) inputRef.current?.focus()
      else termRef.current?.focus()
    })
  }

  // Foco vindo de dentro do xterm (clique na metade da tela dividida): avisa quem controla a aba ativa.
  const onFocusRef = useRef(onFocus)
  onFocusRef.current = onFocus
  useEffect(() => {
    const wrap = wrapRef.current
    if (!wrap) return
    const handler = () => onFocusRef.current?.()
    wrap.addEventListener('focusin', handler)
    return () => wrap.removeEventListener('focusin', handler)
  }, [])

  useEffect(() => {
    if (!active) return
    requestAnimationFrame(() => {
      fitRef.current?.fit()
      if (showEditorRef.current) inputRef.current?.focus()
      else termRef.current?.focus()
    })
  }, [active])

  // A caixa aparece (prompt ocioso): ela recebe o teclado. Quando some, o foco já foi para o xterm no Enter.
  useEffect(() => {
    if (showEditor && active) inputRef.current?.focus()
  }, [showEditor, active])

  return (
    <div
      // `pointer-events-auto`: a área do menu de contexto (TerminalMenu) em volta não pega cliques; só a aba visível pega.
      className={`pointer-events-auto absolute inset-0 flex flex-col pt-3 pr-2 pb-3 pl-5 ${visible ? 'visible' : 'invisible'}`}
      data-terminal-active={active || undefined}
      ref={wrapRef}
    >
      {/* Faixa fina no tom do modo (PowerShell, cmd, WSL, Claude): distingue as abas de relance. */}
      <div
        aria-hidden
        className="pointer-events-none absolute top-1 right-2 left-5 h-0.5 rounded-full opacity-60 [transition:background-color_200ms_ease-out]"
        style={{ background: MODE_TONE[modeOf(kind, shellProfile)] }}
      />
      <div className="min-h-0 w-full flex-1" ref={hostRef} />
      {copyMode && termRef.current && (
        <CopyModeOverlay
          term={termRef.current}
          geometry={copyMode}
          onDone={(text) => {
            setCopyMode(null)
            if (text) {
              void ipc.writeClipboard(text).then(
                () => {
                  const lines = text.split('\n').length
                  setQuickNote(
                    lines > 1
                      ? `Copiadas ${lines} linhas`
                      : `Copiado: ${text.length > 60 ? `${text.slice(0, 59)}…` : text}`,
                  )
                },
                () => setQuickNote('Não deu para copiar'),
              )
            }
            requestAnimationFrame(() => {
              if (showEditorRef.current) inputRef.current?.focus()
              else termRef.current?.focus()
            })
          }}
        />
      )}
      {quick && (
        <QuickSelectOverlay
          targets={quick.targets}
          geometry={quick.geometry}
          onClose={closeQuick}
          onPick={(target, insert) => {
            closeQuick()
            if (insert) {
              insertTextRef.current(target.text)
              return
            }
            void ipc.writeClipboard(target.text).then(
              () => setQuickNote(`Copiado: ${target.text.length > 60 ? `${target.text.slice(0, 59)}…` : target.text}`),
              () => setQuickNote('Não deu para copiar'),
            )
          }}
        />
      )}
      {quickNote && (
        <div
          role="status"
          className="pointer-events-none absolute top-3 left-1/2 z-20 max-w-[80%] -translate-x-1/2 animate-pop-in truncate rounded-md border border-hairline bg-surface px-2.5 py-1 font-mono text-[12px] text-text shadow-tip motion-reduce:animate-none"
        >
          {quickNote}
        </div>
      )}
      {/* Tela dividida: o painel sem o foco fica apagado; o clique passa e o foca. */}
      <div
        aria-hidden
        className={`pointer-events-none absolute inset-0 bg-bg [transition:opacity_180ms_ease-out] motion-reduce:transition-none ${
          settings.dimInactivePane && visible && !active ? 'opacity-40' : 'opacity-0'
        }`}
      />
      <PathSuggestions
        items={suggestions}
        position={position}
        onPick={(item) => pickRef.current(item)}
        onDismiss={() => dismissRef.current()}
      />
      {!dead && (
        <AttachmentStrip
          items={attachments}
          error={attachError}
          onDismiss={(path) => setAttachments((l) => l.filter((a) => a.path !== path))}
          onDismissError={() => setAttachError(null)}
        />
      )}
      {dropping && active && !dead && (
        <div
          aria-hidden
          className="pointer-events-none absolute inset-2 grid place-items-center rounded-[12px] border-2 border-dashed border-accent bg-[color-mix(in_srgb,var(--accent)_8%,transparent)] text-[13px] text-text"
        >
          <span className="rounded-md bg-surface px-2.5 py-1 shadow-tip">Solte para inserir o caminho</span>
        </div>
      )}
      {kind === 'claude' && !dead && (
        <ClaudeBar
          ptyId={ptyId}
          agentState={agentState === 'off' ? null : agentState}
          cwd={cwd ?? null}
          git={git}
          theme={terminalTheme}
          fontFamily={settings.fontFamily}
          fontSize={terminalFontSize(settings.fontSize, settings.interfaceSize)}
          visible={visible}
          onKeys={(data) => {
            sendRef.current(data)
            termRef.current?.focus()
          }}
          onCommand={(command) => {
            // O texto e o Enter separados: o Enter junto do texto o Claude Code trataria como colagem.
            sendRef.current(command)
            window.setTimeout(() => sendRef.current('\r'), 80)
            termRef.current?.focus()
          }}
        />
      )}
      {kind === 'shell' && !altBuffer && !dead && (
        <ContextBar
          cwd={shellCwd}
          git={git}
          node={node}
          theme={terminalTheme}
          fontFamily={settings.fontFamily}
          fontSize={terminalFontSize(settings.fontSize, settings.interfaceSize)}
          idle={idle}
          family={shellFamily}
          onRun={(command) => runRef.current(command)}
        />
      )}
      {settings.inputEditor && kind === 'shell' && (
        <InputEditor
          open={showEditor}
          theme={terminalTheme}
          fontFamily={settings.fontFamily}
          fontSize={terminalFontSize(settings.fontSize, settings.interfaceSize)}
          inputRef={inputRef}
          history={historyRef}
          cwd={() => cwdRef.current}
          onSubmit={(text) => {
            clearAttachments()
            submitRef.current(text)
            onInput?.(`${text.split(/\r?\n/).join('\r')}\r`)
          }}
          onEscape={() => termRef.current?.focus()}
          onClear={() => clearRef.current()}
          onSearchHistory={settings.historySearch ? () => openHistoryRef.current() : undefined}
          api={editorApi}
        />
      )}
      {historySearch && (
        <HistorySearch
          fontFamily={settings.fontFamily}
          fontSize={terminalFontSize(settings.fontSize, settings.interfaceSize)}
          initialQuery={historySearch.query}
          cwd={shellCwd}
          session={() => commandLog.current}
          onPick={(command, run) => {
            setHistorySearch(null)
            putCommandRef.current(command, run)
          }}
          onClose={() => {
            setHistorySearch(null)
            if (showEditorRef.current) inputRef.current?.focus()
            else termRef.current?.focus()
          }}
        />
      )}
      {ai && (
        <AiPanel
          state={ai}
          fontFamily={settings.fontFamily}
          onClose={() => {
            aiSeq.current++
            setAi(null)
            termRef.current?.focus()
          }}
          onCopy={(text) => void ipc.writeClipboard(text)}
          onRun={(command) => {
            setAi(null)
            runRef.current(command)
          }}
        />
      )}
      {blockFilter && (
        <BlockFilter
          command={blockFilter.command}
          output={blockFilter.output}
          onCopy={(text) => void ipc.writeClipboard(text)}
          onClose={() => {
            setBlockFilter(null)
            termRef.current?.focus()
          }}
        />
      )}
      {exporting && (
        <BlockExportMenu
          blocks={exporting.blocks}
          anchor={exporting.anchor}
          theme={terminalTheme}
          fontFamily={settings.fontFamily}
          onClose={() => {
            setExporting(null)
            termRef.current?.focus()
          }}
        />
      )}
      {images && (
        <ImagePreview
          paths={images.paths}
          anchor={images.anchor}
          onClose={() => {
            setImages(null)
            termRef.current?.focus()
          }}
        />
      )}
      {search && active && (
        <SearchBar
          search={search}
          theme={terminalTheme}
          onClose={() => {
            setSearch(null)
            termRef.current?.focus()
          }}
        />
      )}
    </div>
  )
}
