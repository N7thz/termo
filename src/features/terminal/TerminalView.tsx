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
import type { GitInfo, PathSuggestion, SessionKind, Settings } from '../../shared/types'
import type { AgentState } from '../agent-status/agentState'
import { AiPanel, type AiPanelState } from '../ai/AiPanel'
import { PathSuggestions, type SuggestionsPosition } from '../autocomplete/PathSuggestions'
import { extractQuery } from '../autocomplete/query'
import { ShellIntegration } from '../autocomplete/shellIntegration'
import { CommandBlocks } from '../blocks/commandBlocks'
import { openLink } from '../browser/links'
import type { TerminalActions } from '../context-menu/types'
import type { Severity } from '../highlights/matchers'
import { SearchBar } from '../highlights/SearchBar'
import { TerminalHighlights } from '../highlights/terminalHighlights'
import { InputEditor } from '../input/InputEditor'
import type { NodeInfo } from '../node-version/types'
import { terminalFontSize } from '../settings/interfaceSize'
import { isAppShortcut } from '../tabs/shortcuts'
import { ContextBar } from './ContextBar'

interface Props {
  kind: SessionKind
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
  /** Git da pasta da aba, para a linha de contexto (`null` fora de repositório). */
  git?: GitInfo | null
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
  active,
  visible = active,
  onFocus,
  settings,
  terminalTheme,
  cwd,
  onTitle,
  onKind,
  onClose,
  onSeverity,
  onActions,
  onCwd,
  onPrompt,
  onAgent,
  git = null,
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
  const aiSeq = useRef(0)
  const [altBuffer, setAltBuffer] = useState(false)
  const [dead, setDead] = useState(false)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const historyRef = useRef<string[]>([])
  const submitRef = useRef<(text: string) => void>(() => {})
  const clearRef = useRef<() => void>(() => {})
  // Linha de contexto (Node, pasta, branch): pasta e node vêm do prompt.
  const [shellCwd, setShellCwd] = useState<string | null>(null)
  const [node, setNode] = useState<NodeInfo | null>(null)
  const runRef = useRef<(command: string) => void>(() => {})
  const showEditor = settings.inputEditor && kind === 'shell' && idle && !altBuffer && !dead
  const showEditorRef = useRef(showEditor)
  showEditorRef.current = showEditor
  const openSearchRef = useRef<() => void>(() => {})
  // Callbacks mudam a cada render; a ref evita recriar o terminal.
  const cbRef = useRef({ onTitle, onKind, onClose, onSeverity, onActions, onCwd, onPrompt, onAgent })
  cbRef.current = { onTitle, onKind, onClose, onSeverity, onActions, onCwd, onPrompt, onAgent }

  // biome-ignore lint/correctness/useExhaustiveDependencies: o terminal é criado uma vez por aba; a fonte é tratada no efeito abaixo
  useEffect(() => {
    const host = hostRef.current
    const wrap = wrapRef.current
    if (!host || !wrap) return
    let sessionId: number | null = null
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
      // Régua da direita: marcas de erro/aviso e resultados da busca.
      overviewRuler: { width: 8 },
    })
    termRef.current = term

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
      setIdle,
    )
    // Blocos por comando: barra de status na margem, duração e copiar/explicar na linha do prompt.
    const blocks = new CommandBlocks(term, {
      copy: (text) => void ipc.writeClipboard(text),
      failColor: () => term.options.theme?.red ?? term.options.theme?.foreground ?? 'red',
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

    const send = (data: string) => {
      if (sessionId != null) void ipc.write(sessionId, data)
    }

    // Copiar e colar compartilhados pelo teclado (Ctrl+C/Ctrl+V) e pelo menu do botão direito.
    const copySelection = () => {
      void ipc.writeClipboard(term.getSelection())
      term.clearSelection()
    }
    const pasteClipboard = () => {
      ipc
        .readClipboard()
        .then(({ text, hasImage }) => {
          if (text) term.paste(text)
          // Imagem copiada: repassa o Ctrl+V para o Claude Code colar a imagem.
          else if (hasImage) send('\x16')
        })
        .catch((err) => console.warn('[termo] falha ao ler a área de transferência', err))
    }

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

    // Copiar/colar pela área de transferência do sistema (via Rust); atalhos do app não vão ao shell.
    term.attachCustomKeyEventHandler((e) => {
      if (e.type !== 'keydown') return true
      if (isAppShortcut(e)) return false
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
      }
      send(data)
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
      try {
        const res = await ipc.createSession({ kind, cols: term.cols, rows: term.rows, cwd }, (ev) => {
          if (ev.kind === 'data') {
            // Confirma só depois de desenhar: é o que segura o backend quando a saída é enorme.
            term.write(ev.data, () => {
              if (sessionId != null) void ipc.ack(sessionId, ev.bytes)
            })
          } else if (ev.kind === 'agent') {
            cbRef.current.onAgent?.(ev.state)
          } else {
            exited = true
            setDead(true)
            hide()
            const code = ev.code == null ? '' : ` (código ${ev.code})`
            term.write(`\r\n${dim(`[processo encerrado${code}: pressione qualquer tecla para fechar a aba]`)}\r\n`)
          }
        })
        if (disposed) return void ipc.kill(res.id)
        sessionId = res.id
        for (const w of res.warnings) term.write(warn(w))
        if (res.kind !== kind) cbRef.current.onKind(res.kind)
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
      if (sessionId != null) void ipc.kill(sessionId)
      highlights.dispose()
      highlightsRef.current = null
      cbRef.current.onActions?.(null)
      blocks.dispose()
      shell.dispose()
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
    if (termRef.current) termRef.current.options.theme = withRuler(terminalTheme)
  }, [terminalTheme])

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
      className={`absolute inset-0 flex flex-col pt-3 pr-2 pb-3 pl-5 ${visible ? 'visible' : 'invisible'}`}
      data-terminal-active={active || undefined}
      ref={wrapRef}
    >
      <div className="min-h-0 w-full flex-1" ref={hostRef} />
      <PathSuggestions
        items={suggestions}
        position={position}
        onPick={(item) => pickRef.current(item)}
        onDismiss={() => dismissRef.current()}
      />
      {kind === 'shell' && !altBuffer && !dead && (
        <ContextBar
          cwd={shellCwd}
          git={git}
          node={node}
          theme={terminalTheme}
          fontFamily={settings.fontFamily}
          fontSize={terminalFontSize(settings.fontSize, settings.interfaceSize)}
          idle={idle}
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
          onSubmit={(text) => submitRef.current(text)}
          onEscape={() => termRef.current?.focus()}
          onClear={() => clearRef.current()}
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
