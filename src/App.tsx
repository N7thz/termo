import { listen } from '@tauri-apps/api/event'
import { getCurrentWindow } from '@tauri-apps/api/window'
import { Button } from '@ui-sdk/react/button'
import { Tabs, TabsList, TabsTab, TabsTabIcon } from '@ui-sdk/react/tabs'
import { Tooltip, TooltipContent, TooltipShortcut, TooltipTrigger } from '@ui-sdk/react/tooltip'
import { Plus, Radio, X } from 'lucide-react'
import { type CSSProperties, useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react'
import { type AgentState, withAgentState } from './features/agent-status/agentState'
import { BackgroundLayer, requestNextBackground } from './features/background/BackgroundLayer'
import { isBackgroundActive, transparentTheme, wantsTransparentTerminal } from './features/background/background'
import { GlowLayer } from './features/background/GlowLayer'
import { SAVE_WORKFLOW_EVENT } from './features/blocks/commandBlocks'
import { bootDone } from './features/boot/boot'
import { broadcastTargets, isTyped } from './features/broadcast/broadcast'
import { BrowserPanel } from './features/browser/BrowserPanel'
import { installCliOnPath, useCliActions } from './features/cli/useCliActions'
import { CodeReviewPanel } from './features/code-review/CodeReviewPanel'
import { TabMenu } from './features/context-menu/TabMenu'
import { TerminalMenu } from './features/context-menu/TerminalMenu'
import type { TabMenuAction, TerminalActions, TerminalMenuAction } from './features/context-menu/types'
import type { Severity } from './features/highlights/matchers'
import { ResizeEdge, useStoredWidth } from './features/layout/ResizeEdge'
import { LayoutManager } from './features/layouts/LayoutManager'
import { LayoutsContext } from './features/layouts/LayoutsContext'
import { captureLayout, layoutCommands, openLayoutAction } from './features/layouts/layouts'
import { useBackgroundMemory } from './features/memory/useBackgroundMemory'
import { NoteDialog } from './features/notes/NoteDialog'
import { InboxPanel } from './features/notifications/InboxPanel'
import { type FinishedCommand, tabFinished } from './features/notifications/notifications'
import { TabAlert, type TabAlertState } from './features/notifications/TabAlert'
import { useInbox } from './features/notifications/useInbox'
import { useNotifier } from './features/notifications/useNotifier'
import { CommandPalette } from './features/palette/CommandPalette'
import { createProfile, PROFILE_COLORS, pinFolder, profileColorCss } from './features/profiles/profiles'
import { type AgentDef, RolesContext } from './features/roles/RolesContext'
import { SessionsIndicator } from './features/sessions/SessionsIndicator'
import { SessionsPage } from './features/sessions/SessionsPage'
import { useInterfaceZoom } from './features/settings/interfaceSize'
import { SettingsButton, SettingsPage } from './features/settings/SettingsPage'
import { ModeChoices } from './features/shell-profiles/ModeChoices'
import { NewShellMenu } from './features/shell-profiles/NewShellMenu'
import { useShells } from './features/shell-profiles/useShells'
import { useSshHosts } from './features/shell-profiles/useSshHosts'
import { ShortcutsDialog } from './features/shortcuts/ShortcutsDialog'
import { ClaudeIcon } from './features/tabs/ClaudeIcon'
import { PaneNotice } from './features/tabs/PaneNotice'
import { SplitDivider } from './features/tabs/SplitDivider'
import { actionFor, keysFor, setKeybindings } from './features/tabs/shortcuts'
import { type Direction, layoutRects, neighbor, type SplitDir } from './features/tabs/splitTree'
import { TabKindIcon } from './features/tabs/TabKindIcon'
import {
  initialTabs,
  outputIdFor,
  paneMates,
  restore,
  type SessionSnapshot,
  snapshot,
  splitOf,
  type Tab,
  tabsReducer,
  tabsToClose,
  visibleGroups,
  visibleTabs,
} from './features/tabs/tabs'
import { type Progress, taskbarProgress } from './features/terminal/programOsc'
import { TerminalView } from './features/terminal/TerminalView'
import { ThemesPage } from './features/theme/ThemesPage'
import { setCustomThemes } from './features/theme/themes'
import { useTheme } from './features/theme/useTheme'
import { useTrayActions } from './features/tray/useTrayActions'
import { UpdateButton } from './features/updater/UpdateButton'
import { UsageBattery } from './features/usage-battery/UsageBattery'
import { WindowControls } from './features/window/WindowControls'
import { WorkflowDialog } from './features/workflows/WorkflowDialog'
import { WorkflowManager } from './features/workflows/WorkflowManager'
import { tabLabel } from './features/workspace/format'
import { GitDiff } from './features/workspace/GitDiff'
import { StatusBar } from './features/workspace/StatusBar'
import { TabSidebar } from './features/workspace/TabSidebar'
import { useWorkspace } from './features/workspace/useWorkspace'
import { WorktreeContext } from './features/worktree/WorktreeContext'
import { WorktreeDialog } from './features/worktree/WorktreeDialog'
import { isInside } from './features/worktree/worktree'
import { ipc } from './lib/ipc'
import { actionButton, tooltip, tooltipKbd } from './lib/ui'
import { clampFontSize, DEFAULT_SETTINGS } from './shared/settings'
import type { ClaudeLaunch, Profile, SavedLayout, SessionKind, Settings, Workflow } from './shared/types'

// Feedback no pointer-down (active:), sem esperar o click. Ao fechar, a aba encolhe até sumir.
const TAB =
  'group/tab flex h-7 min-w-27.5 max-w-50 animate-tab-in cursor-default items-center gap-1.5 rounded-lg pr-1.5 pl-2.5 text-[12.5px] tracking-[0.005em] text-muted [transition:background-color_160ms_ease-out,color_160ms_ease-out,box-shadow_200ms_ease-out,scale_400ms_var(--spring)] hover:bg-surface-hover hover:text-text active:scale-[0.97] active:duration-60 has-focus-visible:outline-2 has-focus-visible:outline-offset-1 has-focus-visible:outline-accent data-active:bg-surface data-active:font-[560] data-active:text-text data-active:shadow-tab data-closing:pointer-events-none data-closing:-mx-px data-closing:max-w-0 data-closing:min-w-0 data-closing:overflow-hidden data-closing:px-0 data-closing:opacity-0 data-closing:[transition:max-width_180ms_var(--spring-soft),padding_180ms_var(--spring-soft),opacity_120ms_ease-out] motion-reduce:animate-none motion-reduce:[transition:background-color_120ms,color_120ms,opacity_120ms] motion-reduce:active:scale-100'

const TAB_CLOSE =
  'grid size-5 place-items-center rounded-[5px] text-[15px] leading-none opacity-0 [transition:opacity_120ms_ease-out,background-color_120ms_ease-out,scale_300ms_var(--spring)] group-hover/tab:opacity-70 group-data-active/tab:opacity-70 hover:bg-border hover:opacity-100 active:scale-[0.88] active:duration-50 motion-reduce:active:scale-100'

/** Título de uma aba SSH (`ssh:<host>` → `<host>`). */
const sshTitle = (shellId?: string) => (shellId?.startsWith('ssh:') ? shellId.slice(4) : undefined)

async function toggleFullscreen() {
  const win = getCurrentWindow()
  try {
    await win.setFullscreen(!(await win.isFullscreen()))
  } catch (err) {
    console.error('[termo] falha ao alternar a tela cheia', err)
  }
}

/** A janela principal (`main`) salva e reabre a sessão; as de "Nova janela" (`termo-<n>`) não. */
const IS_MAIN_WINDOW = getCurrentWindow().label === 'main'
// Lateral das abas: largura arrastável (padrão = o antigo w-56).
const SIDEBAR_DEFAULT = 224
const SIDEBAR_MIN = 180
const SIDEBAR_MAX = 420
/** Pasta pedida para a primeira aba de uma janela nova (`?cwd=`, src-tauri/src/window.rs). */
const WINDOW_CWD = new URLSearchParams(window.location.search).get('cwd')

export function App() {
  const [state, dispatch] = useReducer(tabsReducer, initialTabs)
  const workspace = useWorkspace(state.active)
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS)
  const [shellName, setShellName] = useState('shell')
  const [cwd, setCwd] = useState<string>()
  const [showSettings, setShowSettings] = useState(false)
  const [ready, setReady] = useState(false)
  /** Aba do Claude pedida na linha de comando da primeira abertura, esperando o app ficar pronto. */
  const pendingLaunch = useRef<ClaudeLaunch | null>(null)
  const [closing, setClosing] = useState<ReadonlySet<number>>(new Set())
  const settingsRef = useRef(settings)
  settingsRef.current = settings
  // Aplica as cores do tema no :root e devolve o tema ativo (com as cores do terminal).
  // Prévia ao passar pela lista de temas; null = tema salvo.
  const [previewTheme, setPreviewTheme] = useState<string | null>(null)
  // Temas importados de outros terminais entram no registro antes de resolver o tema.
  setCustomThemes(settings.customThemes)
  const theme = useTheme(previewTheme ?? settings.theme)
  // Com imagem atrás do terminal, o fundo do xterm fica transparente para ela aparecer.
  const transparentTerminal = wantsTransparentTerminal(settings.background)
  const terminalTheme = useMemo(
    () => (transparentTerminal ? transparentTheme(theme.terminal) : theme.terminal),
    [theme.terminal, transparentTerminal],
  )
  const [showThemes, setShowThemes] = useState(false)
  const [showSessions, setShowSessions] = useState(false)
  // Erros/avisos novos em abas em segundo plano; some ao abrir a aba.
  const [alerts, setAlerts] = useState<ReadonlyMap<number, TabAlertState>>(new Map())
  /** Progresso mandado pelo programa de cada aba (OSC 9;4). */
  const [progress, setProgress] = useState<ReadonlyMap<number, Progress>>(new Map())
  const activeRef = useRef(state.active)
  activeRef.current = state.active

  const onSeverity = useCallback((key: number, severity: Severity) => {
    if (activeRef.current === key) return
    setAlerts((prev) => {
      const cur = prev.get(key) ?? { errors: 0, warnings: 0 }
      const next = new Map(prev)
      next.set(key, severity === 'error' ? { ...cur, errors: cur.errors + 1 } : { ...cur, warnings: cur.warnings + 1 })
      return next
    })
  }, [])
  /** Comando demorado terminou numa aba que não está à vista: marca a aba até ela ser aberta. */
  const onTabCommandEnd = (key: number, visible: boolean, cmd: FinishedCommand) => {
    const finished = tabFinished(cmd, visible)
    if (!finished) return
    setAlerts((prev) => {
      const next = new Map(prev)
      next.set(key, { ...(prev.get(key) ?? { errors: 0, warnings: 0 }), finished })
      return next
    })
  }

  // Estado do Claude Code de cada aba (avatar). "Terminou" vira "pronto" quando a pessoa abre a aba.
  const [agents, setAgents] = useState<ReadonlyMap<number, AgentState>>(new Map())
  const notifier = useNotifier(settings.notifications)
  useBackgroundMemory()
  const inbox = useInbox({ persist: IS_MAIN_WINDOW, commandSecs: settings.notifications.commandSecs })
  const installedShells = useShells()
  const sshHosts = useSshHosts()
  /** Id da saída guardada de cada aba nova (as restauradas já trazem o seu em `tab.outputId`). */
  const outputIds = useRef(new Map<number, string>())
  useEffect(() => {
    const key = state.active
    if (key == null) return
    setAgents((m) => (m.get(key) === 'done' ? withAgentState(m, key, 'idle') : m))
  }, [state.active])
  // Aba fechada: o estado dela sai do mapa.
  useEffect(() => {
    setAgents((m) => {
      const keys = new Set(state.tabs.map((t) => t.key))
      let next: ReadonlyMap<number, AgentState> = m
      for (const key of m.keys()) if (!keys.has(key)) next = withAgentState(next, key, 'off')
      return next
    })
  }, [state.tabs])

  useEffect(() => {
    const key = state.active
    if (key == null) return
    setAlerts((prev) => {
      if (!prev.has(key)) return prev
      const next = new Map(prev)
      next.delete(key)
      return next
    })
  }, [state.active])

  const closeThemes = useCallback(() => {
    setShowThemes(false)
    // Devolve o foco ao terminal da aba ativa.
    requestAnimationFrame(() =>
      document.querySelector<HTMLElement>('[data-terminal-active] .xterm-helper-textarea')?.focus(),
    )
  }, [])

  // Sem `profile`, abre no perfil atual; `cwd` é a pasta (fixada ou da aba duplicada).
  const openTab = useCallback(
    (
      kind: SessionKind,
      opts: {
        shell?: string
        shellId?: string
        cwd?: string
        profile?: string
        after?: number
        group?: string
        splitWith?: number
        /** Com `splitWith`: `col` abre embaixo; o padrão é ao lado. */
        splitDir?: SplitDir
        title?: string
      } = {},
    ) =>
      dispatch({
        type: 'open',
        kind,
        title: opts.title ?? (kind === 'claude' ? 'Claude Code' : (opts.shell ?? sshTitle(opts.shellId) ?? shellName)),
        cwd: opts.cwd,
        shell: opts.shellId,
        profile: opts.profile,
        after: opts.after,
        group: opts.group,
        splitWith: opts.splitWith,
        splitDir: opts.splitDir,
      }),
    [shellName],
  )

  // Abertura: reabre as abas da última vez (se a configuração pedir e houver o que reabrir);
  // senão, a primeira aba é o Claude se veio --claude ou a configuração pede, ou o shell.
  // biome-ignore lint/correctness/useExhaustiveDependencies: roda só na abertura
  useEffect(() => {
    // Só a janela principal reabre a sessão; as outras (Nova janela) começam com uma aba na pasta pedida.
    const extra = !IS_MAIN_WINDOW
    Promise.all([ipc.getSettings(), ipc.launchInfo(), extra ? null : ipc.loadSession().catch(() => null)])
      .then(([s, info, saved]) => {
        setSettings(s)
        setShellName(info.shellName)
        setCwd((extra ? WINDOW_CWD : info.cwd) ?? undefined)
        const ids = (s.profiles?.length ? s.profiles : DEFAULT_SETTINGS.profiles).map((p) => p.id)
        // Aba pedida na linha de comando (termo.exe --claude --title ...): abre quando o app estiver pronto.
        if (!extra && info.launch) pendingLaunch.current = info.launch
        if (!extra && s.restoreSession && restore(saved, initialTabs, new Set(ids)).tabs.length > 0) {
          dispatch({ type: 'restore', snapshot: saved, profiles: ids })
          return
        }
        if (pendingLaunch.current) return
        const first = s.profiles?.[0]?.id
        if (first) dispatch({ type: 'switch-profile', profile: first })
        openTab(!extra && info.openClaudeFirst ? 'claude' : 'shell', {
          shell: info.shellName,
          cwd: extra ? (WINDOW_CWD ?? undefined) : undefined,
        })
      })
      .catch((err) => {
        console.error('[termo] falha ao iniciar', err)
        openTab('shell')
      })
      .finally(() => {
        setReady(true)
        bootDone()
      })
  }, [])

  // Perfis: o atual (ou o primeiro, se o atual sumiu da lista) e as abas dele.
  const profiles = settings.profiles?.length ? settings.profiles : DEFAULT_SETTINGS.profiles
  const profile = profiles.find((p) => p.id === state.profile) ?? profiles[0]
  const tabs = visibleTabs(state)
  const profileOf = (tab: Tab) => profiles.find((p) => p.id === tab.profile)

  useEffect(() => {
    if (ready && profile.id !== state.profile) dispatch({ type: 'switch-profile', profile: profile.id })
  }, [ready, profile.id, state.profile])

  // Os tons dos perfis vêm do tema ativo (--tone-green... a partir das ANSI do terminal).
  useEffect(() => {
    const root = document.documentElement.style
    const ansi = theme.terminal as Record<string, string | undefined>
    for (const tone of PROFILE_COLORS) {
      const value = ansi[tone]
      if (value) root.setProperty(`--tone-${tone}`, value)
    }
  }, [theme])

  const saveProfiles = useCallback(
    (next: Profile[]) =>
      ipc
        .setSettings({ profiles: next })
        .then(setSettings)
        .catch((err) => console.error('[termo] falha ao salvar os perfis', err)),
    [],
  )
  const editProfile = (patch: Partial<Profile>) =>
    void saveProfiles(profiles.map((p) => (p.id === profile.id ? { ...p, ...patch } : p)))

  // Perfil sem abas abre uma de cara, como o Dia abre uma aba nova.
  const switchProfile = (id: string) => {
    if (id === state.profile) return
    dispatch({ type: 'switch-profile', profile: id })
    if (!state.tabs.some((t) => t.profile === id)) openTab('shell', { profile: id })
  }
  const addProfile = () => {
    const created = createProfile(profiles)
    void saveProfiles([...profiles, created]).then(() => openTab('shell', { profile: created.id }))
  }
  const deleteProfile = () => {
    const to = profiles.find((p) => p.id !== profile.id)
    if (!to) return
    dispatch({ type: 'remove-profile', profile: profile.id, to: to.id })
    void saveProfiles(profiles.filter((p) => p.id !== profile.id))
  }

  // Salva abas, grupos e divisões (com a pasta atual de cada aba) logo depois de cada mudança.
  // Com "reabrir com o texto", cada aba de shell da janela principal guarda o fim da saída num id próprio.
  const keepOutput = IS_MAIN_WINDOW && settings.restoreSession && settings.restoreOutput
  const outputIdOf = (tab: { key: number; kind: SessionKind; outputId?: string }) =>
    keepOutput && tab.kind === 'shell' ? outputIdFor(outputIds.current, tab) : undefined
  const session = ready ? JSON.stringify(snapshot(state, (t) => workspace.info(t.key).cwd ?? t.cwd, outputIdOf)) : ''
  // No máximo um salvamento a cada 400 ms, sempre com a foto mais nova. Não é um debounce: mudanças
  // seguidas (um título que muda sem parar) não adiam o salvamento para sempre.
  const pendingSession = useRef('')
  const saveTimer = useRef<number | undefined>(undefined)
  useEffect(() => {
    if (!session || !settings.restoreSession || !IS_MAIN_WINDOW) return
    pendingSession.current = session
    if (saveTimer.current !== undefined) return
    saveTimer.current = window.setTimeout(() => {
      saveTimer.current = undefined
      const snap = JSON.parse(pendingSession.current) as SessionSnapshot
      ipc
        .saveSession(snap)
        // O texto das abas fechadas (ou de todas, com a opção desligada) sai do disco.
        .then(() => ipc.pruneScrollback(snap.tabs.flatMap((t) => (t.output ? [t.output] : []))))
        .catch((err) => console.error('[termo] falha ao salvar a sessão', err))
    }, 400)
  }, [session, settings.restoreSession])

  // Sem abas a janela continua aberta, na tela vazia com "Nova aba" e "Claude Code". A sessão vazia
  // é salva pelo efeito acima, então a próxima abertura não reabre o que foi fechado de propósito.

  // Fecha com uma saída curta (a aba encolhe); sem movimento reduzido, fecha direto.
  const closeTab = useCallback((key: number) => {
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    if (reduce) return dispatch({ type: 'close', key })
    setClosing((prev) => (prev.has(key) ? prev : new Set(prev).add(key)))
    window.setTimeout(() => {
      dispatch({ type: 'close', key })
      setClosing((prev) => {
        const next = new Set(prev)
        next.delete(key)
        return next
      })
    }, 180)
  }, [])

  const [showShortcuts, setShowShortcuts] = useState(false)
  const [showPalette, setShowPalette] = useState(false)
  const activeInfo = workspace.info(state.active)
  const diffColors = { added: theme.terminal.green as string, removed: theme.terminal.red as string }
  const layout = settings.layout ?? DEFAULT_SETTINGS.layout
  const [sidebarWidth, setSidebarWidth, commitSidebarWidth] = useStoredWidth(
    'termo.sidebarWidth',
    SIDEBAR_DEFAULT,
    SIDEBAR_MIN,
  )
  const [sidebarDragging, setSidebarDragging] = useState(false)

  // Tela dividida: os painéis da árvore da aba ativa (splitTree.ts) dividem o cartão; as outras abas ficam escondidas.
  const split = splitOf(state, state.active)
  const splitRects = useMemo(() => (split ? layoutRects(split.root) : null), [split])
  /** Um dos outros painéis da tela dividida da aba (a lateral só precisa saber se há). */
  const partnerOf = (key: number) => paneMates(state, key)[0]
  // Zoom: a aba ativa ocupa o cartão; os outros painéis ficam escondidos, com o tamanho de antes (o pty não é redimensionado).
  const zoomed = split?.zoomed === true
  const hiddenByZoom = (key: number) => zoomed && key !== state.active && splitRects?.panes.has(key) === true
  const paneStyle = (key: number): CSSProperties | undefined => {
    if (!splitRects) return undefined
    if (zoomed && key === state.active) return undefined
    const r = splitRects.panes.get(key)
    if (!r) return undefined
    return { left: `${r.x * 100}%`, top: `${r.y * 100}%`, width: `${r.w * 100}%`, height: `${r.h * 100}%` }
  }
  /** Alt+setas: o foco vai para o painel vizinho naquela direção. */
  const focusPane = (dir: Direction) => {
    if (!split || zoomed || state.active == null) return
    const next = neighbor(split.root, state.active, dir)
    if (next != null) dispatch({ type: 'activate', key: next })
  }

  // Ações do xterm de cada aba, para o menu do botão direito.
  const terminalActions = useRef(new Map<number, TerminalActions>())

  // Digitar em vários painéis: o que é digitado na aba ativa vai também para as outras abas do grupo dela
  // (ou para o par da tela dividida). Fica ligado até desligar; não é salvo.
  const [broadcast, setBroadcast] = useState(false)
  const isClaudeTab = (t: Tab) => t.kind === 'claude' || (agents.get(t.key) ?? 'off') !== 'off'
  const broadcastTo = broadcast ? broadcastTargets(state, state.active, isClaudeTab) : []
  const receiving = new Set(broadcastTo)
  // Quem transmite (a aba ativa) e quem recebe ganham a indicação; sem destino, ninguém.
  const broadcasting = useMemo(
    () => new Set(broadcastTo.length > 0 && state.active != null ? [state.active, ...broadcastTo] : []),
    [broadcastTo, state.active],
  )
  const forwardInput = (key: number, data: string) => {
    if (!broadcast || key !== state.active || !isTyped(data)) return
    for (const target of broadcastTo) terminalActions.current.get(target)?.write?.(data)
  }

  // ---- Workflows: comandos salvos com {{parâmetros}} (paleta, Ctrl+Shift+R e "salvar como workflow" dos blocos) ----
  const [workflowDialog, setWorkflowDialog] = useState<{ open: boolean; initial: Workflow | null }>({
    open: false,
    initial: null,
  })
  const [workflowManager, setWorkflowManager] = useState<{ open: boolean; draft: string | null }>({
    open: false,
    draft: null,
  })
  /** Põe o comando na linha do shell da aba ativa (`run`: também executa). */
  const sendWorkflow = (command: string, run: boolean) => {
    if (state.active != null) terminalActions.current.get(state.active)?.command?.(command, run)
  }
  const saveWorkflows = (workflows: Workflow[]) => {
    // Na hora na tela (vários cliques seguidos partem da lista nova); o Rust valida e devolve a versão final.
    setSettings((s) => ({ ...s, workflows }))
    updateSettings({ workflows })
  }
  useEffect(() => {
    const onSave = (e: Event) => {
      const command = (e as CustomEvent<{ command?: unknown }>).detail?.command
      if (typeof command === 'string' && command.trim()) setWorkflowManager({ open: true, draft: command })
    }
    window.addEventListener(SAVE_WORKFLOW_EVENT, onSave)
    return () => window.removeEventListener(SAVE_WORKFLOW_EVENT, onSave)
  }, [])
  /** Comando que a aba nova roda no primeiro prompt (pela chave da aba; vem da página de Sessões). */
  const initialCommands = useRef(new Map<number, string>())
  // ---- Abas do Claude pedidas pela linha de comando (termo.exe --claude ...; o coord abre as sessões assim) ----
  /** Pedido de cada aba aberta assim (pela chave da aba). Não entra na sessão salva. */
  const launches = useRef(new Map<number, ClaudeLaunch>())
  const openLaunch = (l: ClaudeLaunch) => {
    launches.current.set(state.nextKey, l)
    setShowSessions(false)
    openTab('claude', { cwd: l.cwd ?? undefined, title: l.title ?? undefined })
  }
  const openLaunchRef = useRef(openLaunch)
  openLaunchRef.current = openLaunch
  useEffect(() => {
    if (!ready || !pendingLaunch.current) return
    const l = pendingLaunch.current
    pendingLaunch.current = null
    openLaunchRef.current(l)
  }, [ready])
  useEffect(() => {
    if (!IS_MAIN_WINDOW) return
    const off = listen<ClaudeLaunch>('termo-launch', (e) => openLaunchRef.current(e.payload))
    return () => void off.then((f) => f())
  }, [])
  // ---- Layouts salvos: abas, grupos, divisões e comandos iniciais do perfil, abertos com um clique ----
  const [layoutManager, setLayoutManager] = useState<{ open: boolean; saving: boolean }>({ open: false, saving: false })
  const savedLayouts = settings.layouts ?? []
  const currentLayout = (): SavedLayout | null => {
    const snap = captureLayout(
      state,
      '',
      (t) => workspace.info(t.key).cwd ?? t.cwd,
      (t) => initialCommands.current.get(t.key) ?? '',
    )
    return snap.tabs.length > 0 ? snap : null
  }
  const saveLayouts = (layouts: SavedLayout[]) => {
    setSettings((s) => ({ ...s, layouts }))
    updateSettings({ layouts })
  }
  const openLayout = (layout: SavedLayout) => {
    for (const [key, command] of layoutCommands(layout, state.nextKey)) initialCommands.current.set(key, command)
    setShowSessions(false)
    dispatch(openLayoutAction(layout))
  }
  // ---- Claude Code numa cópia isolada (git worktree) ----
  const [showWorktrees, setShowWorktrees] = useState(false)
  /** Aba cuja nota está aberta para editar (menu da aba → "Nota da aba…"). */
  const [noteKey, setNoteKey] = useState<number | null>(null)
  /** Central de avisos aberta (sino da barra de título ou Ctrl+Shift+O). */
  const [showInbox, setShowInbox] = useState(false)
  const openWorktrees = useCallback(() => setShowWorktrees(true), [])

  // ---- Papéis: agentes de .claude/agents (do projeto da aba ativa e do usuário) no menu "nova aba" ----
  const [roleAgents, setRoleAgents] = useState<AgentDef[]>([])
  const roleCwd = state.active == null ? null : (workspace.info(state.active).cwd ?? null)
  useEffect(() => {
    let alive = true
    ipc
      .claudeAgents(roleCwd)
      .then((a) => alive && setRoleAgents(a))
      .catch(() => alive && setRoleAgents([]))
    return () => {
      alive = false
    }
  }, [roleCwd])
  const rolesApi = {
    agents: roleAgents,
    onOpen: (name: string) =>
      openLaunch({
        cwd: roleCwd,
        title: `Claude: ${name}`,
        args: ['--agent', name],
        promptFile: null,
        closeOnExit: false,
      }),
  }
  /** Fecha as abas dentro da cópia e espera os shells soltarem a pasta (o Windows não apaga pasta em uso). */
  const closeTabsIn = async (path: string) => {
    const inside = stateRef.current.tabs.filter((t) => isInside(workspace.info(t.key).cwd ?? t.cwd, path))
    if (inside.length === 0) return
    for (const t of inside) closeTab(t.key)
    await new Promise((resolve) => window.setTimeout(resolve, 1200))
  }

  const layoutsApi = {
    layouts: savedLayouts,
    onOpen: (index: number) => savedLayouts[index] && openLayout(savedLayouts[index]),
    onManage: () => setLayoutManager({ open: true, saving: false }),
  }
  /** Abre uma aba na pasta e, se houver, roda o comando nela (`claude attach` / `claude --resume`). */
  // Menu da bandeja: "Nova aba" e "Nova aba com Claude Code" chegam aqui.
  useTrayActions((kind) => openTab(kind))

  const openTabWithCommand = (dir: string, command: string | null, label?: string) => {
    const key = state.nextKey
    if (command) initialCommands.current.set(key, command)
    setShowSessions(false)
    openTab('shell', { cwd: dir || undefined })
    // O reducer aplica na ordem: a aba já existe quando o nome chega.
    if (label) dispatch({ type: 'rename', key, label })
  }

  // ---- Code review: painel ao lado do terminal e envio dos comentários ao Claude Code ----
  const [showReview, setShowReview] = useState(false)
  const reviewCwd = state.active != null ? (workspace.info(state.active).cwd ?? null) : (cwd ?? null)
  const reviewVersion = activeInfo.git
    ? `${activeInfo.git.added}:${activeInfo.git.removed}:${activeInfo.git.changed}:${activeInfo.git.untracked}`
    : ''
  /** Texto esperando uma aba do Claude ficar pronta (`key` nula: a próxima aba do Claude que abrir). */
  const pendingClaude = useRef<{ text: string; key: number | null; at: number; submit: boolean } | null>(null)
  const deliverToClaude = (key: number, text: string, submit = true) => {
    dispatch({ type: 'activate', key })
    // Um instante para a aba aparecer e o xterm receber o foco antes da colagem.
    window.setTimeout(() => {
      const actions = terminalActions.current.get(key)
      if (submit) actions?.sendText?.(text)
      else actions?.pasteText?.(text)
    }, 150)
  }
  /** `submit: false` só cola (blocos mandados como contexto: a pessoa escreve a pergunta e manda). */
  const sendToClaude = (text: string, submit = true) => {
    const active = tabs.find((t) => t.key === state.active)
    const target = active?.kind === 'claude' ? active : tabs.find((t) => t.kind === 'claude')
    const ready = target && agents.get(target.key) && agents.get(target.key) !== 'off'
    if (target && ready) return deliverToClaude(target.key, text, submit)
    pendingClaude.current = { text, key: target?.key ?? null, at: Date.now(), submit }
    if (target) dispatch({ type: 'activate', key: target.key })
    else openTab('claude', { cwd: reviewCwd ?? undefined })
  }
  // ---- Linha de comando (`termo open/run/claude/tabs/send...`): pedidos vindos do control.rs ----
  const stateRef = useRef(state)
  stateRef.current = state
  useCliActions(
    {
      state: () => stateRef.current,
      tabCwd: (key) => workspace.info(key).cwd,
      openShell: ({ cwd: dir, shellId, command, splitWith }) => {
        if (command) initialCommands.current.set(stateRef.current.nextKey, command)
        setShowSessions(false)
        openTab('shell', { cwd: dir, shellId, splitWith })
      },
      openClaude: (dir, prompt) => {
        if (prompt)
          pendingClaude.current = { text: prompt, key: stateRef.current.nextKey, at: Date.now(), submit: true }
        setShowSessions(false)
        openTab('claude', { cwd: dir })
      },
      activate: (key) => dispatch({ type: 'activate', key }),
      close: closeTab,
      actions: (key) => terminalActions.current.get(key),
      tabName: (key) => {
        const tab = stateRef.current.tabs.find((t) => t.key === key)
        return tab ? tabLabel(tab, shellName) : ''
      },
      rename: (key, label) => dispatch({ type: 'rename', key, label }),
      setNote: (key, note, append) => dispatch({ type: 'note', key, note, append }),
      settings: () => settingsRef.current,
      applySettings: (patch) => ipc.setSettings(patch).then(setSettings),
    },
    IS_MAIN_WINDOW,
  )
  /** O Claude da aba ficou pronto: entrega o texto pendente (vale por 2 minutos). */
  const onClaudeState = (tab: { key: number; kind: SessionKind }, s: AgentState) => {
    const pending = pendingClaude.current
    if (!pending || s !== 'idle' || tab.kind !== 'claude') return
    if (pending.key != null && pending.key !== tab.key) return
    pendingClaude.current = null
    if (Date.now() - pending.at < 120_000) deliverToClaude(tab.key, pending.text, pending.submit)
  }

  const openThemes = useCallback(() => {
    setShowSettings(false)
    setShowThemes(true)
  }, [])

  const runTabAction = (tab: Tab, action: TabMenuAction) => {
    switch (action) {
      case 'new-shell':
        return openTab('shell')
      case 'new-claude':
        return openTab('claude')
      case 'duplicate':
        return openTab(tab.kind, {
          after: tab.key,
          cwd: workspace.info(tab.key).cwd ?? tab.cwd,
          group: tab.group,
          shellId: tab.shell,
        })
      case 'split-new':
        return openTab('shell', { splitWith: tab.key, cwd: workspace.info(tab.key).cwd ?? tab.cwd })
      case 'split-new-down':
        return openTab('shell', { splitWith: tab.key, splitDir: 'col', cwd: workspace.info(tab.key).cwd ?? tab.cwd })
      case 'split-with-active':
        return state.active != null && dispatch({ type: 'split', key: state.active, with: tab.key })
      case 'unsplit':
        return dispatch({ type: 'unsplit', key: tab.key })
      case 'new-group':
        return dispatch({ type: 'group-create', key: tab.key, name: '' })
      case 'ungroup':
        return dispatch({ type: 'set-group', key: tab.key, group: null })
      case 'pin-folder': {
        const dir = workspace.info(tab.key).cwd
        return dir && editProfile({ pinned: pinFolder(profile, dir).pinned })
      }
      case 'move-left':
        return dispatch({ type: 'move', key: tab.key, delta: -1 })
      case 'move-right':
        return dispatch({ type: 'move', key: tab.key, delta: 1 })
      case 'close':
        return closeTab(tab.key)
      case 'close-others':
        return tabsToClose(state, tab.key, 'others').forEach(closeTab)
      case 'close-right':
        return tabsToClose(state, tab.key, 'right').forEach(closeTab)
      case 'note':
        return setNoteKey(tab.key)
      default:
        if (action.startsWith('split-with:'))
          return dispatch({ type: 'split', key: tab.key, with: Number(action.slice('split-with:'.length)) })
        if (action.startsWith('move-to-group:'))
          return dispatch({ type: 'set-group', key: tab.key, group: action.slice('move-to-group:'.length) })
    }
  }

  const runTerminalAction = (key: number, action: TerminalMenuAction) => {
    const term = terminalActions.current.get(key)
    switch (action) {
      case 'copy':
        return term?.copy()
      case 'paste':
        return term?.paste()
      case 'select-all':
        return term?.selectAll()
      case 'clear':
        return term?.clear()
      case 'find':
        return term?.find()
      case 'quick-select':
        // O menu devolve o foco ao fechar; o rAF espera isso para a camada ficar com o teclado.
        return void requestAnimationFrame(() => term?.quickSelect?.())
      case 'copy-mode':
        return void requestAnimationFrame(() => term?.copyMode?.())
      case 'new-shell':
        return openTab('shell')
      case 'new-claude':
        return openTab('claude')
      case 'themes':
        return openThemes()
      case 'settings':
        return setShowSettings(true)
      case 'close':
        return closeTab(key)
    }
  }

  /** Grava e devolve a promessa (a tela de configurações mostra "Salvo" ou o erro). */
  const saveSettings = useCallback(
    (patch: Partial<Settings>) =>
      ipc.setSettings(patch).then(setSettings, (err) => {
        console.error('[termo] falha ao salvar configurações', err)
        throw err
      }),
    [],
  )
  const updateSettings = useCallback(
    (patch: Partial<Settings>) => void saveSettings(patch).catch(() => undefined),
    [saveSettings],
  )
  // Tamanho da interface (zoom do webview): vale com a tela de configurações aberta ou não.
  useInterfaceZoom(settings.interfaceSize)
  // Atalhos trocados pela pessoa valem para o teclado, as dicas e a folha de atalhos.
  setKeybindings(settings.keybindings)

  // Barra de tarefas: o progresso da aba ativa; sem ele, o de outra aba desta janela (um erro primeiro).
  const taskbar = taskbarProgress(progress, state.active)
  const taskbarKey = taskbar ? `${taskbar.state}:${taskbar.value}` : 'none'
  // biome-ignore lint/correctness/useExhaustiveDependencies: a chave resume o estado e o valor
  useEffect(() => {
    void ipc.windowProgress(taskbar?.state ?? 'none', taskbar?.value ?? 0).catch(() => undefined)
  }, [taskbarKey])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const action = actionFor(e)
      if (!action) return
      e.preventDefault()
      const size = settingsRef.current.fontSize
      const activeTab = tabs.find((t) => t.key === state.active)
      switch (action) {
        case 'new-shell':
          return openTab('shell')
        case 'new-claude':
          return openTab('claude')
        case 'duplicate-tab':
          return activeTab && runTabAction(activeTab, 'duplicate')
        case 'split-tab':
          return activeTab && runTabAction(activeTab, 'split-new')
        case 'split-down':
          return activeTab && runTabAction(activeTab, 'split-new-down')
        case 'focus-left':
          return focusPane('left')
        case 'focus-right':
          return focusPane('right')
        case 'focus-up':
          return focusPane('up')
        case 'focus-down':
          return focusPane('down')
        case 'zoom-pane':
          return state.active != null && dispatch({ type: 'zoom', key: state.active })
        case 'broadcast':
          return setBroadcast((v) => !v)
        case 'close-tab':
          return state.active != null && closeTab(state.active)
        case 'next-tab':
          return dispatch({ type: 'cycle', delta: 1 })
        case 'prev-tab':
          return dispatch({ type: 'cycle', delta: -1 })
        case 'move-tab-left':
          return activeTab && runTabAction(activeTab, 'move-left')
        case 'move-tab-right':
          return activeTab && runTabAction(activeTab, 'move-right')
        case 'last-tab': {
          const last = tabs.at(-1)
          return last && dispatch({ type: 'activate', key: last.key })
        }
        case 'font-up':
          return updateSettings({ fontSize: clampFontSize(size + 1) })
        case 'font-down':
          return updateSettings({ fontSize: clampFontSize(size - 1) })
        case 'font-reset':
          return updateSettings({ fontSize: DEFAULT_SETTINGS.fontSize })
        case 'themes':
          setShowSettings(false)
          return setShowThemes((v) => !v)
        case 'settings':
          setShowThemes(false)
          return setShowSettings((v) => !v)
        case 'new-window':
          return void ipc
            .newWindow(activeTab ? (workspace.info(activeTab.key).cwd ?? activeTab.cwd) : cwd)
            .catch((err) => console.error('[termo] falha ao abrir a janela', err))
        case 'inbox':
          return setShowInbox((v) => !v)
        case 'sessions':
          setShowThemes(false)
          return setShowSessions((v) => !v)
        case 'code-review':
          return setShowReview((v) => !v)
        case 'fullscreen':
          return void toggleFullscreen()
        case 'shortcuts':
          return setShowShortcuts((v) => !v)
        case 'palette':
          return setShowPalette((v) => !v)
        case 'workflows':
          return setWorkflowDialog({ open: true, initial: null })
        case 'toggle-sidebar':
          return updateSettings({ layout: { ...layout, sidebar: !layout.sidebar } })
        case 'collapse-sidebar':
          // Com a lateral escondida, o atalho mostra já minimizada.
          return updateSettings({
            layout: { ...layout, sidebar: true, sidebarCollapsed: layout.sidebar ? !layout.sidebarCollapsed : true },
          })
        case 'next-profile':
        case 'prev-profile': {
          const step = action === 'next-profile' ? 1 : -1
          const at = profiles.indexOf(profile)
          return switchProfile(profiles[(at + step + profiles.length) % profiles.length].id)
        }
        default: {
          if (action.startsWith('profile-')) {
            const target = profiles[Number(action.slice('profile-'.length)) - 1]
            return target && switchProfile(target.id)
          }
          const tab = tabs[Number(action.slice('tab-'.length)) - 1]
          return tab && dispatch({ type: 'activate', key: tab.key })
        }
      }
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  })

  return (
    <LayoutsContext.Provider value={layoutsApi}>
      <WorktreeContext.Provider value={openWorktrees}>
        <RolesContext.Provider value={rolesApi}>
          <Tabs
            className="relative isolate flex h-full bg-frame"
            activation="manual"
            value={state.active == null ? null : String(state.active)}
            onValueChange={(value) => value != null && dispatch({ type: 'activate', key: Number(value) })}
          >
            {/* Brilho do tema nas bordas da janela: atrás da lateral, da barra e das frestas em volta do cartão. */}
            <GlowLayer settings={settings.background} theme={theme} />
            {/* Como no Dia: a lateral ocupa a altura toda, e ela, a barra e o rodapé ficam direto sobre a moldura;
          só o terminal tem cartão. Fica sempre montada e abre/fecha pela largura (o que sobra fechada, 6px,
          é a margem esquerda), para a animação partir de onde estiver se o atalho for apertado no meio. */}
            <div
              className={`relative flex-none overflow-hidden ${sidebarDragging ? '' : '[transition:width_380ms_var(--spring-soft),opacity_200ms_ease-out] motion-reduce:[transition:opacity_150ms_ease]'} ${layout.sidebar ? (layout.sidebarCollapsed ? 'w-14' : '') : 'w-2.5 opacity-0'}`}
              style={layout.sidebar && !layout.sidebarCollapsed ? { width: sidebarWidth } : undefined}
              inert={!layout.sidebar}
            >
              {/* Arraste a borda direita para mudar a largura da lateral (só aberta; a minimizada é fixa). */}
              {layout.sidebar && !layout.sidebarCollapsed && (
                <ResizeEdge
                  side="right"
                  label="Largura da lateral"
                  width={sidebarWidth}
                  min={SIDEBAR_MIN}
                  max={() => Math.min(SIDEBAR_MAX, window.innerWidth - 480)}
                  fallback={SIDEBAR_DEFAULT}
                  onWidth={setSidebarWidth}
                  onCommit={commitSidebarWidth}
                  onDragging={setSidebarDragging}
                />
              )}
              {/* Largura fixa por dentro: ao abrir/fechar, o wrapper anima e corta, sem espremer o conteúdo. */}
              <div className="h-full" style={layout.sidebarCollapsed ? undefined : { width: sidebarWidth }}>
                <TabSidebar
                  profiles={profiles}
                  profile={profile}
                  tabs={tabs}
                  shellName={shellName}
                  active={state.active}
                  info={workspace.info}
                  onActivate={(key) => dispatch({ type: 'activate', key })}
                  onClose={closeTab}
                  onNew={(kind, dir, shellId) => openTab(kind, { cwd: dir, shellId })}
                  defaultShell={settings.defaultShell}
                  onTabAction={runTabAction}
                  onSwitchProfile={switchProfile}
                  onAddProfile={addProfile}
                  onEditProfile={editProfile}
                  onDeleteProfile={deleteProfile}
                  onUnpin={(dir) => editProfile({ pinned: profile.pinned.filter((d) => d !== dir) })}
                  closing={closing}
                  renderAlert={(key) => (
                    <TabAlert alert={alerts.get(key)} progress={progress.get(key)} colors={theme.terminal} />
                  )}
                  groups={visibleGroups(state)}
                  onGroupToggle={(id) => dispatch({ type: 'group-toggle', id })}
                  onGroupRename={(id, name) => dispatch({ type: 'group-rename', id, name })}
                  onRename={(key, label) => dispatch({ type: 'rename', key, label })}
                  onGroupDelete={(id) => dispatch({ type: 'group-delete', id })}
                  partnerOf={partnerOf}
                  broadcasting={broadcasting}
                  agents={agents}
                  onReorder={(key, before, group) => dispatch({ type: 'reorder', key, before, group })}
                  collapsed={layout.sidebarCollapsed}
                  onToggleCollapsed={() =>
                    updateSettings({ layout: { ...layout, sidebarCollapsed: !layout.sidebarCollapsed } })
                  }
                  onSplitWith={(key) =>
                    state.active != null &&
                    key !== state.active &&
                    dispatch({ type: 'split', key: state.active, with: key })
                  }
                />
              </div>
            </div>
            <div className="flex min-w-0 flex-1 flex-col">
              {/* Sem a barra nativa: esta é a barra de título. Arrasta pelo fundo e pelo espaço vazio; duplo clique maximiza. */}
              <header
                data-tauri-drag-region
                className="relative z-5 flex h-10 flex-none items-center gap-2 px-2 select-none"
              >
                {!layout.sidebar && (
                  <Tooltip>
                    <TooltipTrigger
                      render={
                        <Button
                          className={`${actionButton} flex-none gap-1.5 text-[12px] font-[600] text-text`}
                          aria-label={`Perfil ${profile.name}: trocar`}
                          onClick={() => switchProfile(profiles[(profiles.indexOf(profile) + 1) % profiles.length].id)}
                        />
                      }
                    >
                      <span className="size-2 rounded-full" style={{ background: profileColorCss(profile.color) }} />
                      {profile.name}
                    </TooltipTrigger>
                    <TooltipContent className={tooltip} sideOffset={6}>
                      Trocar de perfil
                    </TooltipContent>
                  </Tooltip>
                )}
                <TabsList
                  className={`flex min-w-0 gap-0.5 overflow-x-auto py-0.5 [scrollbar-width:none] ${layout.sidebar ? 'hidden' : ''}`}
                  aria-label="Abas"
                >
                  {tabs.map((tab, index) => (
                    <TabMenu
                      key={tab.key}
                      first={index === 0}
                      last={index === tabs.length - 1}
                      alone={tabs.length === 1}
                      groups={visibleGroups(state).filter((g) => g.id !== tab.group)}
                      inGroup={!!tab.group}
                      split={partnerOf(tab.key) != null}
                      canSplitWithActive={
                        state.active != null && tab.key !== state.active && partnerOf(tab.key) !== state.active
                      }
                      onAction={(action) => runTabAction(tab, action)}
                      trigger={
                        <div
                          data-active={tab.key === state.active || undefined}
                          data-closing={closing.has(tab.key) || undefined}
                          className={TAB}
                          onAuxClick={(e) => e.button === 1 && closeTab(tab.key)}
                          title={tabLabel(tab, shellName)}
                        />
                      }
                    >
                      <TabsTab
                        className="flex h-full min-w-0 flex-1 items-center gap-1.5 text-start outline-none"
                        value={String(tab.key)}
                      >
                        <TabsTabIcon className="flex">
                          <TabKindIcon kind={tab.kind} shell={tab.shell} agent={agents.get(tab.key)} />
                        </TabsTabIcon>
                        <span className="flex-1 truncate">{tabLabel(tab, shellName)}</span>
                        {broadcasting.has(tab.key) && (
                          <Radio
                            size={12}
                            className="flex-none text-accent"
                            aria-label="Recebendo o que é digitado"
                            role="img"
                          />
                        )}
                        <TabAlert
                          alert={alerts.get(tab.key)}
                          progress={progress.get(tab.key)}
                          colors={theme.terminal}
                        />
                      </TabsTab>
                      {/* Fora do tab (botão dentro de botão é inválido) e fora da ordem de Tab: pelo teclado é Ctrl+Shift+W. */}
                      <Button
                        className={TAB_CLOSE}
                        tabIndex={-1}
                        aria-label={`Fechar ${tabLabel(tab, shellName)}`}
                        onClick={() => closeTab(tab.key)}
                      >
                        <X size={12} />
                      </Button>
                    </TabMenu>
                  ))}
                </TabsList>
                <span data-tauri-drag-region className="flex-1 self-stretch" />
                {/* O diff da aba ativa fica na barra de status; o selo do topo só aparece sem ela. */}
                {layout.diffBadge && !layout.statusBar && activeInfo.git && (
                  <Button
                    className="rounded-md hover:bg-surface-hover focus-visible:outline-2 focus-visible:outline-accent"
                    aria-label="Abrir a revisão de código"
                    title="Revisão de código (Ctrl+Shift+G)"
                    onClick={() => setShowReview((v) => !v)}
                  >
                    <GitDiff git={activeInfo.git} colors={diffColors} className="px-1" />
                  </Button>
                )}
                {/* Status primeiro (sessões, uso do Claude, atualização), separado das ações por um fio. */}
                <div className="flex items-center gap-1">
                  <InboxPanel
                    inbox={inbox}
                    open={showInbox}
                    onOpenChange={setShowInbox}
                    tabExists={(key) => stateRef.current.tabs.some((t) => t.key === key)}
                    onOpenTab={(key) => {
                      setShowSessions(false)
                      setShowSettings(false)
                      dispatch({ type: 'activate', key })
                    }}
                    onOpenSessions={() => setShowSessions(true)}
                  />
                  <SessionsIndicator onOpen={() => setShowSessions((v) => !v)} />
                  <UsageBattery />
                  <UpdateButton />
                </div>
                <span aria-hidden className="mx-1 h-4 w-px flex-none bg-hairline" />
                <div className="flex gap-1">
                  {/* Com a lateral, abrir aba fica no "Nova aba" dela; o + e o menu de modos só sem a lateral. */}
                  {!layout.sidebar && (
                    <>
                      {/* Os atalhos são ligados em actionFor; o shortcut do Tooltip só mostra e anuncia. */}
                      <Tooltip shortcut={keysFor('new-shell')}>
                        <TooltipTrigger
                          render={
                            <Button className={actionButton} aria-label="Nova aba" onClick={() => openTab('shell')} />
                          }
                        >
                          <Plus size={15} />
                        </TooltipTrigger>
                        <TooltipContent className={tooltip} sideOffset={6}>
                          Nova aba <TooltipShortcut className={tooltipKbd} />
                        </TooltipContent>
                      </Tooltip>
                      <NewShellMenu
                        defaultShell={settings.defaultShell}
                        onPick={(kind, shellId) => openTab(kind, { shellId })}
                      />
                    </>
                  )}
                  <Tooltip shortcut={keysFor('new-claude')}>
                    <TooltipTrigger
                      render={
                        <Button
                          className={`${actionButton} text-[12px] font-[560] tracking-[0.01em] text-claude`}
                          onClick={() => openTab('claude')}
                        />
                      }
                    >
                      <ClaudeIcon size={13} /> Claude
                    </TooltipTrigger>
                    <TooltipContent className={tooltip} sideOffset={6}>
                      Nova aba com Claude Code <TooltipShortcut className={tooltipKbd} />
                    </TooltipContent>
                  </Tooltip>
                  <SettingsButton
                    open={showSettings}
                    onToggle={() => {
                      setShowThemes(false)
                      setShowSessions(false)
                      setShowSettings((v) => !v)
                    }}
                  />
                </div>
                <WindowControls />
              </header>

              <div className={`flex min-h-0 flex-1 gap-2.5 pr-2.5 ${layout.statusBar ? '' : 'pb-2.5'}`}>
                {/* O cartão: o terminal recuado da borda, com cantos arredondados e sombra suave. */}
                {/* Aba arrastada da lateral e solta aqui: abre ao lado da ativa (ver useTabDrag). */}
                <main
                  data-drop-split
                  className="relative min-h-0 min-w-0 flex-1 overflow-hidden rounded-[10px] bg-bg shadow-card outline-accent [transition:outline-color_140ms_ease-out] data-drop-active:outline-2 data-drop-active:-outline-offset-2"
                >
                  {/* Imagem de fundo atrás das abas (o xterm fica transparente; ver features/background). */}
                  <BackgroundLayer settings={settings.background} target="terminal" />
                  {state.tabs.map((tab) => (
                    // Painel próprio (não o TabsPanel): na tela dividida duas abas ficam visíveis ao mesmo tempo.
                    <div
                      key={tab.key}
                      role="tabpanel"
                      aria-label={tabLabel(tab, shellName)}
                      className={`absolute ${paneStyle(tab.key) ? '' : 'inset-0'} ${split && paneStyle(tab.key) && tab.key !== state.active ? 'opacity-80' : ''} ${hiddenByZoom(tab.key) ? 'pointer-events-none' : ''} [transition:opacity_160ms_ease-out]`}
                      style={paneStyle(tab.key)}
                    >
                      <TerminalMenu
                        actions={() => terminalActions.current.get(tab.key)}
                        onAction={(action) => runTerminalAction(tab.key, action)}
                      >
                        <TerminalView
                          kind={tab.kind}
                          shell={tab.shell}
                          onShell={(shell) =>
                            tab.shell !== shell && dispatch({ type: 'update', key: tab.key, patch: { shell } })
                          }
                          initialCommand={initialCommands.current.get(tab.key)}
                          launch={launches.current.get(tab.key)}
                          onInput={(data) => forwardInput(tab.key, data)}
                          active={tab.key === state.active}
                          visible={tab.key === state.active || (paneStyle(tab.key) != null && !hiddenByZoom(tab.key))}
                          onFocus={() => tab.key !== state.active && dispatch({ type: 'activate', key: tab.key })}
                          settings={settings}
                          terminalTheme={terminalTheme}
                          cwd={tab.cwd || profileOf(tab)?.cwd || cwd}
                          onTitle={(title) =>
                            // O ssh.exe põe o próprio caminho no título: a aba SSH mantém o nome do host.
                            !(tab.shell?.startsWith('ssh:') && /ssh(\.exe)?$/i.test(title)) &&
                            // Aba com nome dado na linha de comando (sessões do coord): o nome fica.
                            !launches.current.get(tab.key)?.title &&
                            dispatch({ type: 'update', key: tab.key, patch: { title } })
                          }
                          onKind={(kind) =>
                            dispatch({
                              type: 'update',
                              key: tab.key,
                              patch: { kind, title: kind === 'claude' ? 'Claude Code' : shellName },
                            })
                          }
                          onClose={() => dispatch({ type: 'close', key: tab.key })}
                          onSeverity={(severity) => onSeverity(tab.key, severity)}
                          onAgent={(s) => {
                            setAgents((m) => withAgentState(m, tab.key, s))
                            onClaudeState(tab, s)
                            notifier.agent(tab.key, tab.title, s)
                            inbox.agent(tab.key, tab.label ?? tab.title, workspace.info(tab.key).cwd ?? null, s)
                          }}
                          onSendToClaude={(text) => sendToClaude(text, false)}
                          onProgress={(p) =>
                            setProgress((m) => {
                              if (!p && !m.has(tab.key)) return m
                              const cur = m.get(tab.key)
                              if (p && cur && cur.state === p.state && cur.value === p.value) return m
                              const next = new Map(m)
                              if (p) next.set(tab.key, p)
                              else next.delete(tab.key)
                              return next
                            })
                          }
                          onTrigger={(hit) => {
                            const name = tab.label ?? tab.title
                            if (hit.notify) {
                              notifier.program(name, hit.line)
                              inbox.trigger(tab.key, name, hit.pattern, hit.line)
                            }
                            const seen =
                              tab.key === activeRef.current || (paneStyle(tab.key) != null && !hiddenByZoom(tab.key))
                            if (hit.mark && !seen)
                              setAlerts((prev) => {
                                const next = new Map(prev)
                                next.set(tab.key, {
                                  ...(prev.get(tab.key) ?? { errors: 0, warnings: 0 }),
                                  trigger: hit.line,
                                })
                                return next
                              })
                          }}
                          onProgramNotice={(title, body) => {
                            const name = tab.label ?? tab.title
                            notifier.program(title || name, body)
                            inbox.program(tab.key, name, title, body)
                          }}
                          onCommandEnd={(cmd) => {
                            notifier.command(cmd)
                            inbox.command(tab.key, tab.label ?? tab.title, cmd)
                            onTabCommandEnd(
                              tab.key,
                              tab.key === activeRef.current || (paneStyle(tab.key) != null && !hiddenByZoom(tab.key)),
                              cmd,
                            )
                          }}
                          outputId={outputIdOf(tab)}
                          restoreOutput={keepOutput && tab.outputId != null}
                          onActions={(actions) =>
                            actions
                              ? terminalActions.current.set(tab.key, actions)
                              : terminalActions.current.delete(tab.key)
                          }
                          onCwd={(dir) => workspace.reportCwd(tab.key, dir)}
                          onPrompt={() => workspace.reportPrompt(tab.key)}
                          git={workspace.info(tab.key).git}
                        />
                      </TerminalMenu>
                    </div>
                  ))}
                  {/* Quem recebe o que é digitado ganha uma borda no tom de destaque. */}
                  {state.tabs.map(
                    (tab) =>
                      (receiving.has(tab.key) || (broadcastTo.length > 0 && tab.key === state.active)) &&
                      !hiddenByZoom(tab.key) && (
                        <span
                          key={`bc-${tab.key}`}
                          aria-hidden
                          className={`pointer-events-none absolute z-10 rounded-[10px] border-2 border-accent/60 ${paneStyle(tab.key) ? '' : 'inset-0'}`}
                          style={paneStyle(tab.key)}
                        />
                      ),
                  )}
                  <PaneNotice
                    hiddenPanes={zoomed && splitRects ? splitRects.panes.size - 1 : 0}
                    broadcast={broadcast ? broadcastTo.length + (broadcastTo.length > 0 ? 1 : 0) || 1 : null}
                    onUnzoom={() => state.active != null && dispatch({ type: 'zoom', key: state.active })}
                    onStopBroadcast={() => setBroadcast(false)}
                  />
                  {split &&
                    !zoomed &&
                    state.active != null &&
                    splitRects?.dividers.map((d) => (
                      <SplitDivider
                        key={d.path}
                        dir={d.dir}
                        rect={d.rect}
                        ratio={d.ratio}
                        onRatio={(ratio) =>
                          state.active != null &&
                          dispatch({ type: 'split-ratio', key: state.active, path: d.path, ratio })
                        }
                      />
                    ))}
                  {tabs.length === 0 && (
                    <div className="absolute inset-0 grid animate-fade-in place-items-center motion-reduce:animate-none">
                      <div className="flex flex-col items-center gap-3 text-[13px] text-muted">
                        <span>Nenhuma aba no perfil {profile.name}.</span>
                        <ModeChoices
                          defaultShell={settings.defaultShell}
                          onPick={(kind, shellId) => openTab(kind, { shellId })}
                        />
                      </div>
                    </div>
                  )}
                  {showSettings && (
                    <SettingsPage
                      settings={settings}
                      onChange={saveSettings}
                      onClose={() => {
                        setShowSettings(false)
                        requestAnimationFrame(() =>
                          document.querySelector<HTMLElement>('[data-terminal-active] .xterm-helper-textarea')?.focus(),
                        )
                      }}
                      // Temas abre por cima e, ao fechar, volta para cá.
                      onOpenThemes={() => setShowThemes(true)}
                      onOpenShortcuts={() => setShowShortcuts(true)}
                      onOpenWorkflows={() => setWorkflowManager({ open: true, draft: null })}
                    />
                  )}
                  {showSessions && (
                    <SessionsPage
                      active
                      cwd={state.active != null ? workspace.info(state.active).cwd : null}
                      onClose={() => setShowSessions(false)}
                      onOpen={openTabWithCommand}
                    />
                  )}
                  {showThemes && (
                    <ThemesPage
                      value={settings.theme}
                      onChange={(id) => updateSettings({ theme: id })}
                      onPreview={setPreviewTheme}
                      onClose={closeThemes}
                      customThemes={settings.customThemes ?? []}
                      onCustomThemesChange={(customThemes) => updateSettings({ customThemes })}
                    />
                  )}
                </main>
                <BrowserPanel linkTarget={settings.linkTarget} />
                <CodeReviewPanel
                  open={showReview}
                  cwd={reviewCwd}
                  version={reviewVersion}
                  colors={diffColors}
                  fontFamily={settings.fontFamily}
                  onClose={() => setShowReview(false)}
                  onSendToClaude={sendToClaude}
                />
              </div>
              {layout.statusBar && (
                <StatusBar
                  info={activeInfo}
                  kind={tabs.find((t) => t.key === state.active)?.kind}
                  shell={tabs.find((t) => t.key === state.active)?.shell}
                  shellName={shellName}
                  colors={diffColors}
                  onSearch={() => setShowPalette(true)}
                  searchKeys="Ctrl+Shift+P"
                />
              )}
            </div>
            <ShortcutsDialog
              open={showShortcuts}
              onOpenChange={setShowShortcuts}
              bindings={settings.keybindings ?? {}}
              onChange={(keybindings) => updateSettings({ keybindings })}
            />
            <NoteDialog
              tab={(() => {
                const t = noteKey == null ? undefined : tabs.find((x) => x.key === noteKey)
                return t ? { key: t.key, label: t.label ?? t.title, note: t.note } : null
              })()}
              onClose={() => setNoteKey(null)}
              onSave={(key, note) => dispatch({ type: 'note', key, note })}
            />
            <WorktreeDialog
              open={showWorktrees}
              onOpenChange={setShowWorktrees}
              cwd={state.active == null ? null : (workspace.info(state.active).cwd ?? null)}
              onOpenTab={(kind, path, name) => {
                setShowSessions(false)
                openTab(kind, { cwd: path, title: kind === 'claude' ? `Claude: ${name}` : name })
              }}
              onCloseTabsIn={closeTabsIn}
            />
            <WorkflowDialog
              open={workflowDialog.open}
              onOpenChange={(open) => setWorkflowDialog((d) => ({ ...d, open }))}
              workflows={settings.workflows}
              initial={workflowDialog.initial}
              canRun={tabs.find((t) => t.key === state.active)?.kind === 'shell'}
              onSubmit={sendWorkflow}
              onAdd={(w) => saveWorkflows([...settings.workflows, w])}
              onManage={() => {
                setWorkflowDialog((d) => ({ ...d, open: false }))
                setWorkflowManager({ open: true, draft: null })
              }}
            />
            <WorkflowManager
              open={workflowManager.open}
              onOpenChange={(open) => setWorkflowManager((m) => ({ ...m, open }))}
              workflows={settings.workflows}
              draft={workflowManager.draft}
              onChange={saveWorkflows}
            />
            <CommandPalette
              open={showPalette}
              onOpenChange={setShowPalette}
              tabs={state.tabs}
              active={state.active}
              info={workspace.info}
              actions={[
                { id: 'new-shell', label: 'Nova aba', keys: keysFor('new-shell'), run: () => openTab('shell') },
                {
                  id: 'new-claude',
                  label: 'Nova aba com Claude Code',
                  keys: keysFor('new-claude'),
                  run: () => openTab('claude'),
                },
                {
                  id: 'worktree',
                  label: 'Claude Code numa cópia isolada (worktree)',
                  run: openWorktrees,
                },
                { id: 'install-cli', label: 'Instalar o comando termo no PATH', run: () => void installCliOnPath() },
                // Um item por shell instalado: "Nova aba: Prompt de Comando", "Nova aba: Ubuntu (WSL)"...
                ...sshHosts.map((host) => ({
                  id: `new-ssh-${host}`,
                  label: `Nova aba SSH: ${host}`,
                  run: () => openTab('shell', { shellId: `ssh:${host}` }),
                })),
                ...installedShells.map((s) => ({
                  id: `new-shell-${s.id}`,
                  label: `Nova aba: ${s.label}`,
                  run: () => openTab('shell', { shellId: s.id }),
                })),
                { id: 'themes', label: 'Temas', keys: keysFor('themes'), run: openThemes },
                { id: 'settings', label: 'Configurações', keys: keysFor('settings'), run: () => setShowSettings(true) },
                {
                  id: 'copy-mode',
                  label: 'Modo de cópia: selecionar a saída pelo teclado',
                  keys: 'mod+shift+x',
                  run: () =>
                    requestAnimationFrame(() =>
                      state.active != null ? terminalActions.current.get(state.active)?.copyMode?.() : undefined,
                    ),
                },
                {
                  id: 'quick-select',
                  label: 'Seleção rápida: copiar URL, caminho, hash ou número da tela',
                  keys: 'mod+shift+space',
                  // A paleta fecha antes e devolve o foco; o rAF espera isso para os rótulos ficarem com o teclado.
                  run: () =>
                    requestAnimationFrame(() =>
                      state.active != null ? terminalActions.current.get(state.active)?.quickSelect?.() : undefined,
                    ),
                },
                {
                  id: 'new-window',
                  label: 'Nova janela',
                  keys: keysFor('new-window'),
                  run: () => void ipc.newWindow(state.active != null ? workspace.info(state.active).cwd : cwd),
                },
                {
                  id: 'code-review',
                  label: showReview ? 'Fechar a revisão de código' : 'Revisão de código',
                  keys: keysFor('code-review'),
                  run: () => setShowReview((v) => !v),
                },
                {
                  id: 'sessions',
                  label: 'Sessões do Claude Code',
                  keys: keysFor('sessions'),
                  run: () => setShowSessions(true),
                },
                {
                  id: 'sidebar',
                  label: layout.sidebar ? 'Ocultar abas na lateral' : 'Mostrar abas na lateral',
                  keys: keysFor('toggle-sidebar'),
                  run: () => updateSettings({ layout: { ...layout, sidebar: !layout.sidebar } }),
                },
                {
                  id: 'collapse-sidebar',
                  label: layout.sidebarCollapsed ? 'Expandir a lateral' : 'Minimizar a lateral',
                  keys: keysFor('collapse-sidebar'),
                  run: () =>
                    updateSettings({
                      layout: { ...layout, sidebar: true, sidebarCollapsed: !layout.sidebarCollapsed },
                    }),
                },
                {
                  id: 'broadcast',
                  label: broadcast
                    ? 'Parar de digitar em vários painéis'
                    : 'Digitar em vários painéis (grupo ou tela dividida)',
                  keys: keysFor('broadcast'),
                  run: () => setBroadcast((v) => !v),
                },
                ...(split
                  ? [
                      {
                        id: 'zoom-pane',
                        label: zoomed ? 'Voltar aos dois painéis' : 'Ampliar o painel atual',
                        keys: keysFor('zoom-pane'),
                        run: () => state.active != null && dispatch({ type: 'zoom', key: state.active }),
                      },
                    ]
                  : []),
                { id: 'layouts', label: 'Layouts salvos', run: () => setLayoutManager({ open: true, saving: false }) },
                {
                  id: 'layout-save',
                  label: 'Salvar o layout atual (abas, grupos e divisões)',
                  run: () => setLayoutManager({ open: true, saving: true }),
                },
                ...savedLayouts.map((l, i) => ({
                  id: `layout-${i}`,
                  label: `Abrir layout: ${l.name}`,
                  run: () => openLayout(l),
                })),
                {
                  id: 'shortcuts',
                  label: 'Atalhos de teclado',
                  keys: keysFor('shortcuts'),
                  run: () => setShowShortcuts(true),
                },
                ...(isBackgroundActive(settings.background) && settings.background.images.length > 1
                  ? [{ id: 'background-next', label: 'Próxima imagem de fundo', run: requestNextBackground }]
                  : []),
                {
                  id: 'workflows',
                  label: 'Workflows (comandos salvos)',
                  keys: keysFor('workflows'),
                  run: () => setWorkflowDialog({ open: true, initial: null }),
                },
                ...profiles
                  .filter((p) => p.id !== profile.id)
                  .map((p) => ({
                    id: `profile-${p.id}`,
                    label: `Trocar para o perfil ${p.name}`,
                    run: () => switchProfile(p.id),
                  })),
                { id: 'new-profile', label: 'Novo perfil', run: addProfile },
              ]}
              onActivateTab={(key) => dispatch({ type: 'activate', key })}
              workflows={settings.workflows}
              onWorkflow={(w) => setWorkflowDialog({ open: true, initial: w })}
              onGoToFolder={(dir) => void ipc.writeClipboard(`cd '${dir.replace(/'/g, "''")}'`)}
            />
            {/* Imagem sobre a janela inteira, translúcida e sem pegar cliques. */}
            <BackgroundLayer settings={settings.background} target="window" />
            <LayoutManager
              open={layoutManager.open}
              onOpenChange={(open) => setLayoutManager((m) => ({ ...m, open }))}
              layouts={savedLayouts}
              current={layoutManager.open ? currentLayout() : null}
              startSaving={layoutManager.saving}
              onChange={saveLayouts}
              onOpenLayout={openLayout}
            />
          </Tabs>
        </RolesContext.Provider>
      </WorktreeContext.Provider>
    </LayoutsContext.Provider>
  )
}
