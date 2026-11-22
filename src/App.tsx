import { getCurrentWindow } from '@tauri-apps/api/window'
import { Button } from '@ui-sdk/react/button'
import { Tabs, TabsList, TabsTab, TabsTabIcon } from '@ui-sdk/react/tabs'
import { Tooltip, TooltipContent, TooltipShortcut, TooltipTrigger } from '@ui-sdk/react/tooltip'
import { Plus, X } from 'lucide-react'
import { type CSSProperties, useCallback, useEffect, useReducer, useRef, useState } from 'react'
import { type AgentState, withAgentState } from './features/agent-status/agentState'
import { BrowserPanel } from './features/browser/BrowserPanel'
import { TabMenu } from './features/context-menu/TabMenu'
import { TerminalMenu } from './features/context-menu/TerminalMenu'
import type { TabMenuAction, TerminalActions, TerminalMenuAction } from './features/context-menu/types'
import type { Severity } from './features/highlights/matchers'
import { CommandPalette } from './features/palette/CommandPalette'
import { createProfile, PROFILE_COLORS, pinFolder, profileColorCss } from './features/profiles/profiles'
import { SessionsPage } from './features/sessions/SessionsPage'
import { SettingsPanel } from './features/settings/SettingsPanel'
import { ShortcutsDialog } from './features/shortcuts/ShortcutsDialog'
import { ClaudeIcon } from './features/tabs/ClaudeIcon'
import { SplitDivider } from './features/tabs/SplitDivider'
import { actionFor } from './features/tabs/shortcuts'
import { TabKindIcon } from './features/tabs/TabKindIcon'
import {
  initialTabs,
  pairOf,
  restore,
  snapshot,
  type Tab,
  tabsReducer,
  tabsToClose,
  visibleGroups,
  visibleTabs,
} from './features/tabs/tabs'
import { TerminalView } from './features/terminal/TerminalView'
import { ThemesPage } from './features/theme/ThemesPage'
import { useTheme } from './features/theme/useTheme'
import { UsageBattery } from './features/usage-battery/UsageBattery'
import { WindowControls } from './features/window/WindowControls'
import { GitDiff } from './features/workspace/GitDiff'
import { StatusBar } from './features/workspace/StatusBar'
import { TabSidebar } from './features/workspace/TabSidebar'
import { useWorkspace } from './features/workspace/useWorkspace'
import { ipc } from './lib/ipc'
import { actionButton, tooltip, tooltipKbd } from './lib/ui'
import { clampFontSize, DEFAULT_SETTINGS } from './shared/settings'
import type { Profile, SessionKind, Settings } from './shared/types'

// Feedback no pointer-down (active:), sem esperar o click. Ao fechar, a aba encolhe até sumir.
const TAB =
  'group/tab flex h-7 min-w-27.5 max-w-50 animate-tab-in cursor-default items-center gap-1.5 rounded-lg pr-1.5 pl-2.5 text-[12.5px] tracking-[0.005em] text-muted [transition:background-color_160ms_ease-out,color_160ms_ease-out,box-shadow_200ms_ease-out,scale_400ms_var(--spring)] hover:bg-surface-hover hover:text-text active:scale-[0.97] active:duration-60 has-focus-visible:outline-2 has-focus-visible:outline-offset-1 has-focus-visible:outline-accent data-active:bg-surface data-active:font-[560] data-active:text-text data-active:shadow-tab data-closing:pointer-events-none data-closing:-mx-px data-closing:max-w-0 data-closing:min-w-0 data-closing:overflow-hidden data-closing:px-0 data-closing:opacity-0 data-closing:[transition:max-width_180ms_var(--spring-soft),padding_180ms_var(--spring-soft),opacity_120ms_ease-out] motion-reduce:animate-none motion-reduce:[transition:background-color_120ms,color_120ms,opacity_120ms] motion-reduce:active:scale-100'

const TAB_CLOSE =
  'grid size-5 place-items-center rounded-[5px] text-[15px] leading-none opacity-0 [transition:opacity_120ms_ease-out,background-color_120ms_ease-out,scale_300ms_var(--spring)] group-hover/tab:opacity-70 group-data-active/tab:opacity-70 hover:bg-border hover:opacity-100 active:scale-[0.88] active:duration-50 motion-reduce:active:scale-100'

/** Contador de erros (vermelho) ou ponto de aviso (amarelo) numa aba em segundo plano. */
function TabAlert({
  alert,
  colors,
}: {
  alert?: { errors: number; warnings: number }
  colors: { red?: string; yellow?: string }
}) {
  if (!alert) return null
  if (alert.errors > 0) {
    return (
      <span
        className="min-w-4 rounded-full px-1 text-center font-mono text-[10px] leading-4 font-semibold text-white"
        style={{ background: colors.red }}
        title={`${alert.errors} erro(s) novo(s)`}
      >
        {alert.errors > 99 ? '99+' : alert.errors}
      </span>
    )
  }
  return (
    <span
      className="size-2 rounded-full"
      style={{ background: colors.yellow }}
      title={`${alert.warnings} aviso(s) novo(s)`}
      role="img"
      aria-label={`${alert.warnings} aviso(s) novo(s)`}
    />
  )
}

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
  const [closing, setClosing] = useState<ReadonlySet<number>>(new Set())
  const settingsRef = useRef(settings)
  settingsRef.current = settings
  // Aplica as cores do tema no :root e devolve o tema ativo (com as cores do terminal).
  // Prévia ao passar pela lista de temas; null = tema salvo.
  const [previewTheme, setPreviewTheme] = useState<string | null>(null)
  const theme = useTheme(previewTheme ?? settings.theme)
  const [showThemes, setShowThemes] = useState(false)
  const [showSessions, setShowSessions] = useState(false)
  // Erros/avisos novos em abas em segundo plano; some ao abrir a aba.
  const [alerts, setAlerts] = useState<ReadonlyMap<number, { errors: number; warnings: number }>>(new Map())
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

  // Estado do Claude Code de cada aba (avatar). "Terminou" vira "pronto" quando a pessoa abre a aba.
  const [agents, setAgents] = useState<ReadonlyMap<number, AgentState>>(new Map())
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
      opts: { shell?: string; cwd?: string; profile?: string; after?: number; group?: string; splitWith?: number } = {},
    ) =>
      dispatch({
        type: 'open',
        kind,
        title: kind === 'claude' ? 'Claude Code' : (opts.shell ?? shellName),
        cwd: opts.cwd,
        profile: opts.profile,
        after: opts.after,
        group: opts.group,
        splitWith: opts.splitWith,
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
        if (!extra && s.restoreSession && restore(saved, initialTabs, new Set(ids)).tabs.length > 0) {
          dispatch({ type: 'restore', snapshot: saved, profiles: ids })
          return
        }
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
      .finally(() => setReady(true))
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
  const session = ready ? JSON.stringify(snapshot(state, (t) => workspace.info(t.key).cwd ?? t.cwd)) : ''
  useEffect(() => {
    if (!session || !settings.restoreSession || !IS_MAIN_WINDOW) return
    const timer = window.setTimeout(() => {
      ipc.saveSession(JSON.parse(session)).catch((err) => console.error('[termo] falha ao salvar a sessão', err))
    }, 400)
    return () => window.clearTimeout(timer)
  }, [session, settings.restoreSession])

  // Sem abas em nenhum perfil: fecha a janela, como os outros terminais (salvando a sessão vazia antes,
  // para a próxima abertura não reabrir o que foi fechado de propósito).
  useEffect(() => {
    if (!ready || state.tabs.length > 0) return
    void (IS_MAIN_WINDOW ? ipc.saveSession(snapshot(initialTabs, () => undefined)) : Promise.resolve())
      .catch(() => {})
      .finally(() => void getCurrentWindow().close())
  }, [ready, state.tabs.length])

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

  // Tela dividida: o par da aba ativa aparece lado a lado no cartão; as outras abas ficam escondidas.
  const split = pairOf(state, state.active)
  const partnerOf = (key: number) => {
    const p = pairOf(state, key)
    return p && (p.left === key ? p.right : p.left)
  }
  const paneStyle = (key: number): CSSProperties | undefined => {
    if (!split) return undefined
    if (key === split.left) return { left: 0, width: `${split.ratio * 100}%` }
    if (key === split.right) return { left: `${split.ratio * 100}%`, right: 0 }
    return undefined
  }

  // Ações do xterm de cada aba, para o menu do botão direito.
  const terminalActions = useRef(new Map<number, TerminalActions>())

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
        return openTab(tab.kind, { after: tab.key, cwd: workspace.info(tab.key).cwd ?? tab.cwd, group: tab.group })
      case 'split-new':
        return openTab('shell', { splitWith: tab.key, cwd: workspace.info(tab.key).cwd ?? tab.cwd })
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
      default:
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

  const updateSettings = useCallback((patch: Partial<Settings>) => {
    ipc
      .setSettings(patch)
      .then(setSettings)
      .catch((err) => console.error('[termo] falha ao salvar configurações', err))
  }, [])

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
          return activeTab && runTabAction(activeTab, pairOf(state, activeTab.key) ? 'unsplit' : 'split-new')
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
        case 'sessions':
          setShowThemes(false)
          return setShowSessions((v) => !v)
        case 'fullscreen':
          return void toggleFullscreen()
        case 'shortcuts':
          return setShowShortcuts((v) => !v)
        case 'palette':
          return setShowPalette((v) => !v)
        case 'toggle-sidebar':
          return updateSettings({ layout: { ...layout, sidebar: !layout.sidebar } })
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
    <Tabs
      className="flex h-full bg-frame"
      activation="manual"
      value={state.active == null ? null : String(state.active)}
      onValueChange={(value) => value != null && dispatch({ type: 'activate', key: Number(value) })}
    >
      {/* Como no Dia: a lateral ocupa a altura toda, e ela, a barra e o rodapé ficam direto sobre a moldura;
          só o terminal tem cartão. Fica sempre montada e abre/fecha pela largura (o que sobra fechada, 6px,
          é a margem esquerda), para a animação partir de onde estiver se o atalho for apertado no meio. */}
      <div
        className={`flex-none overflow-hidden [transition:width_380ms_var(--spring-soft),opacity_200ms_ease-out] motion-reduce:[transition:opacity_150ms_ease] ${layout.sidebar ? 'w-56' : 'w-2.5 opacity-0'}`}
        inert={!layout.sidebar}
      >
        <TabSidebar
          profiles={profiles}
          profile={profile}
          tabs={tabs}
          active={state.active}
          info={workspace.info}
          colors={diffColors}
          onActivate={(key) => dispatch({ type: 'activate', key })}
          onClose={closeTab}
          onNew={(kind, dir) => openTab(kind, { cwd: dir })}
          onTabAction={runTabAction}
          onSwitchProfile={switchProfile}
          onAddProfile={addProfile}
          onEditProfile={editProfile}
          onDeleteProfile={deleteProfile}
          onUnpin={(dir) => editProfile({ pinned: profile.pinned.filter((d) => d !== dir) })}
          closing={closing}
          renderAlert={(key) => <TabAlert alert={alerts.get(key)} colors={theme.terminal} />}
          groups={visibleGroups(state)}
          onGroupToggle={(id) => dispatch({ type: 'group-toggle', id })}
          onGroupRename={(id, name) => dispatch({ type: 'group-rename', id, name })}
          onGroupDelete={(id) => dispatch({ type: 'group-delete', id })}
          partnerOf={partnerOf}
          agents={agents}
        />
      </div>
      <div className="flex min-w-0 flex-1 flex-col">
        {/* Sem a barra nativa: esta é a barra de título. Arrasta pelo fundo e pelo espaço vazio; duplo clique maximiza. */}
        <header data-tauri-drag-region className="relative z-5 flex h-10 flex-none items-center gap-2 px-2 select-none">
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
                    title={tab.title}
                  />
                }
              >
                <TabsTab
                  className="flex h-full min-w-0 flex-1 items-center gap-1.5 text-start outline-none"
                  value={String(tab.key)}
                >
                  <TabsTabIcon className="flex">
                    <TabKindIcon kind={tab.kind} agent={agents.get(tab.key)} />
                  </TabsTabIcon>
                  <span className="flex-1 truncate">{tab.title}</span>
                  <TabAlert alert={alerts.get(tab.key)} colors={theme.terminal} />
                </TabsTab>
                {/* Fora do tab (botão dentro de botão é inválido) e fora da ordem de Tab: pelo teclado é Ctrl+Shift+W. */}
                <Button
                  className={TAB_CLOSE}
                  tabIndex={-1}
                  aria-label={`Fechar ${tab.title}`}
                  onClick={() => closeTab(tab.key)}
                >
                  <X size={12} />
                </Button>
              </TabMenu>
            ))}
          </TabsList>
          <span data-tauri-drag-region className="flex-1 self-stretch" />
          {layout.diffBadge && <GitDiff git={activeInfo.git} colors={diffColors} className="px-1" />}
          <div className="flex gap-1">
            {/* Os atalhos são ligados em actionFor; o shortcut do Tooltip só mostra e anuncia. */}
            <Tooltip shortcut="mod+shift+t">
              <TooltipTrigger
                render={<Button className={actionButton} aria-label="Nova aba" onClick={() => openTab('shell')} />}
              >
                <Plus size={15} />
              </TooltipTrigger>
              <TooltipContent className={tooltip} sideOffset={6}>
                Nova aba <TooltipShortcut className={tooltipKbd} />
              </TooltipContent>
            </Tooltip>
            <UsageBattery />
            <Tooltip shortcut="mod+shift+k">
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
            <SettingsPanel
              open={showSettings}
              onOpenChange={setShowSettings}
              settings={settings}
              onChange={updateSettings}
              onOpenThemes={openThemes}
              onOpenShortcuts={() => {
                setShowSettings(false)
                setShowShortcuts(true)
              }}
            />
          </div>
          <WindowControls />
        </header>

        <div className={`flex min-h-0 flex-1 gap-2.5 pr-2.5 ${layout.statusBar ? '' : 'pb-2.5'}`}>
          {/* O cartão: o terminal recuado da borda, com cantos arredondados e sombra suave. */}
          <main className="relative min-h-0 min-w-0 flex-1 overflow-hidden rounded-[10px] bg-bg shadow-card">
            {state.tabs.map((tab) => (
              // Painel próprio (não o TabsPanel): na tela dividida duas abas ficam visíveis ao mesmo tempo.
              <div
                key={tab.key}
                role="tabpanel"
                aria-label={tab.title}
                className={`absolute inset-y-0 ${paneStyle(tab.key) ? '' : 'inset-x-0'} ${split && paneStyle(tab.key) && tab.key !== state.active ? 'opacity-80' : ''} [transition:opacity_160ms_ease-out]`}
                style={paneStyle(tab.key)}
              >
                <TerminalMenu
                  actions={() => terminalActions.current.get(tab.key)}
                  onAction={(action) => runTerminalAction(tab.key, action)}
                >
                  <TerminalView
                    kind={tab.kind}
                    active={tab.key === state.active}
                    visible={tab.key === state.active || paneStyle(tab.key) != null}
                    onFocus={() => tab.key !== state.active && dispatch({ type: 'activate', key: tab.key })}
                    settings={settings}
                    terminalTheme={theme.terminal}
                    cwd={tab.cwd || profileOf(tab)?.cwd || cwd}
                    onTitle={(title) => dispatch({ type: 'update', key: tab.key, patch: { title } })}
                    onKind={(kind) =>
                      dispatch({
                        type: 'update',
                        key: tab.key,
                        patch: { kind, title: kind === 'claude' ? 'Claude Code' : shellName },
                      })
                    }
                    onClose={() => dispatch({ type: 'close', key: tab.key })}
                    onSeverity={(severity) => onSeverity(tab.key, severity)}
                    onAgent={(s) => setAgents((m) => withAgentState(m, tab.key, s))}
                    onActions={(actions) =>
                      actions ? terminalActions.current.set(tab.key, actions) : terminalActions.current.delete(tab.key)
                    }
                    onCwd={(dir) => workspace.reportCwd(tab.key, dir)}
                    onPrompt={() => workspace.reportPrompt(tab.key)}
                    git={workspace.info(tab.key).git}
                  />
                </TerminalMenu>
              </div>
            ))}
            {split && (
              <SplitDivider
                ratio={split.ratio}
                onRatio={(ratio) => dispatch({ type: 'split-ratio', key: split.left, ratio })}
              />
            )}
            {tabs.length === 0 && (
              <div className="absolute inset-0 grid animate-fade-in place-items-center motion-reduce:animate-none">
                <div className="flex flex-col items-center gap-3 text-[13px] text-muted">
                  <span>Nenhuma aba no perfil {profile.name}.</span>
                  <div className="flex gap-2">
                    <Button className={actionButton} onClick={() => openTab('shell')}>
                      <Plus size={14} /> Nova aba
                    </Button>
                    <Button className={`${actionButton} text-claude`} onClick={() => openTab('claude')}>
                      <ClaudeIcon size={13} /> Claude Code
                    </Button>
                  </div>
                </div>
              </div>
            )}
            {showSessions && (
              <SessionsPage
                active
                cwd={state.active != null ? workspace.info(state.active).cwd : null}
                onClose={() => setShowSessions(false)}
              />
            )}
            {showThemes && (
              <ThemesPage
                value={settings.theme}
                onChange={(id) => updateSettings({ theme: id })}
                onPreview={setPreviewTheme}
                onClose={closeThemes}
              />
            )}
          </main>
          <BrowserPanel linkTarget={settings.linkTarget} />
        </div>
        {layout.statusBar && (
          <StatusBar
            info={activeInfo}
            kind={tabs.find((t) => t.key === state.active)?.kind}
            shellName={shellName}
            colors={diffColors}
            onSearch={() => setShowPalette(true)}
            searchKeys="Ctrl+Shift+P"
          />
        )}
      </div>
      <ShortcutsDialog open={showShortcuts} onOpenChange={setShowShortcuts} />
      <CommandPalette
        open={showPalette}
        onOpenChange={setShowPalette}
        tabs={state.tabs}
        active={state.active}
        info={workspace.info}
        actions={[
          { id: 'new-shell', label: 'Nova aba', keys: 'mod+shift+t', run: () => openTab('shell') },
          { id: 'new-claude', label: 'Nova aba com Claude Code', keys: 'mod+shift+k', run: () => openTab('claude') },
          { id: 'themes', label: 'Temas', keys: 'mod+shift+,', run: openThemes },
          { id: 'settings', label: 'Configurações', keys: 'mod+,', run: () => setShowSettings(true) },
          {
            id: 'new-window',
            label: 'Nova janela',
            keys: 'mod+shift+n',
            run: () => void ipc.newWindow(state.active != null ? workspace.info(state.active).cwd : cwd),
          },
          { id: 'sessions', label: 'Sessões do Claude Code', keys: 'mod+shift+a', run: () => setShowSessions(true) },
          {
            id: 'sidebar',
            label: layout.sidebar ? 'Ocultar abas na lateral' : 'Mostrar abas na lateral',
            keys: 'mod+shift+b',
            run: () => updateSettings({ layout: { ...layout, sidebar: !layout.sidebar } }),
          },
          { id: 'shortcuts', label: 'Atalhos de teclado', keys: 'f1', run: () => setShowShortcuts(true) },
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
        onGoToFolder={(dir) => void ipc.writeClipboard(`cd '${dir.replace(/'/g, "''")}'`)}
      />
    </Tabs>
  )
}
