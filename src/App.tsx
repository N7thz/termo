import { getCurrentWindow } from '@tauri-apps/api/window'
import { Button } from '@ui-sdk/react/button'
import { Tabs, TabsList, TabsPanel, TabsTab, TabsTabIcon } from '@ui-sdk/react/tabs'
import { Tooltip, TooltipContent, TooltipShortcut, TooltipTrigger } from '@ui-sdk/react/tooltip'
import { useCallback, useEffect, useReducer, useRef, useState } from 'react'
import { TabMenu } from './features/context-menu/TabMenu'
import { TerminalMenu } from './features/context-menu/TerminalMenu'
import type { TabMenuAction, TerminalActions, TerminalMenuAction } from './features/context-menu/types'
import type { Severity } from './features/highlights/matchers'
import { CommandPalette } from './features/palette/CommandPalette'
import { SettingsPanel } from './features/settings/SettingsPanel'
import { ShortcutsDialog } from './features/shortcuts/ShortcutsDialog'
import { actionFor } from './features/tabs/shortcuts'
import { initialTabs, type Tab, tabsReducer, tabsToClose } from './features/tabs/tabs'
import { TerminalView } from './features/terminal/TerminalView'
import { ThemesPage } from './features/theme/ThemesPage'
import { useTheme } from './features/theme/useTheme'
import { GitDiff } from './features/workspace/GitDiff'
import { StatusBar } from './features/workspace/StatusBar'
import { TabSidebar } from './features/workspace/TabSidebar'
import { useWorkspace } from './features/workspace/useWorkspace'
import { ipc } from './lib/ipc'
import { actionButton, tooltip, tooltipKbd } from './lib/ui'
import { clampFontSize, DEFAULT_SETTINGS } from './shared/settings'
import type { SessionKind, Settings } from './shared/types'

// Feedback no pointer-down (active:), sem esperar o click. Ao fechar, a aba encolhe até sumir.
const TAB =
  'group/tab flex h-7 min-w-27.5 max-w-50 animate-tab-in cursor-default items-center gap-1.5 rounded-lg pr-1.5 pl-2.5 text-[12.5px] tracking-[0.005em] text-muted [transition:background-color_160ms_ease-out,color_160ms_ease-out,box-shadow_200ms_ease-out,scale_400ms_var(--spring)] hover:bg-surface-hover hover:text-text active:scale-[0.97] active:duration-60 has-focus-visible:outline-2 has-focus-visible:outline-offset-1 has-focus-visible:outline-accent data-active:bg-surface data-active:font-[560] data-active:text-text data-active:shadow-tab data-closing:pointer-events-none data-closing:-mx-px data-closing:max-w-0 data-closing:min-w-0 data-closing:overflow-hidden data-closing:px-0 data-closing:opacity-0 data-closing:[transition:max-width_180ms_var(--spring-soft),padding_180ms_var(--spring-soft),opacity_120ms_ease-out] motion-reduce:animate-none motion-reduce:[transition:background-color_120ms,color_120ms,opacity_120ms] motion-reduce:active:scale-100'

const TAB_CLOSE =
  'size-5 rounded-[5px] text-[15px] leading-none opacity-0 [transition:opacity_120ms_ease-out,background-color_120ms_ease-out,scale_300ms_var(--spring)] group-hover/tab:opacity-70 group-data-active/tab:opacity-70 hover:bg-border hover:opacity-100 active:scale-[0.88] active:duration-50 motion-reduce:active:scale-100'

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

export function App() {
  const [state, dispatch] = useReducer(tabsReducer, initialTabs)
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

  const openTab = useCallback(
    (kind: SessionKind, shell = shellName) =>
      dispatch({ type: 'open', kind, title: kind === 'claude' ? 'Claude Code' : shell }),
    [shellName],
  )

  // Primeira aba: Claude se veio --claude ou a configuração pede; senão o shell.
  // biome-ignore lint/correctness/useExhaustiveDependencies: roda só na abertura
  useEffect(() => {
    Promise.all([ipc.getSettings(), ipc.launchInfo()])
      .then(([s, info]) => {
        setSettings(s)
        setShellName(info.shellName)
        setCwd(info.cwd ?? undefined)
        openTab(info.openClaudeFirst ? 'claude' : 'shell', info.shellName)
      })
      .catch((err) => {
        console.error('[termo] falha ao iniciar', err)
        openTab('shell')
      })
      .finally(() => setReady(true))
  }, [])

  // Sem abas: fecha a janela, como os outros terminais.
  useEffect(() => {
    if (ready && state.tabs.length === 0) void getCurrentWindow().close()
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
  const workspace = useWorkspace(state.active)
  const activeInfo = workspace.info(state.active)
  const diffColors = { added: theme.terminal.green as string, removed: theme.terminal.red as string }
  const layout = settings.layout ?? DEFAULT_SETTINGS.layout

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
        return dispatch({
          type: 'open',
          kind: tab.kind,
          title: tab.kind === 'claude' ? 'Claude Code' : shellName,
          after: tab.key,
        })
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
      const activeTab = state.tabs.find((t) => t.key === state.active)
      switch (action) {
        case 'new-shell':
          return openTab('shell')
        case 'new-claude':
          return openTab('claude')
        case 'duplicate-tab':
          return activeTab && runTabAction(activeTab, 'duplicate')
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
          const last = state.tabs.at(-1)
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
        case 'fullscreen':
          return void toggleFullscreen()
        case 'shortcuts':
          return setShowShortcuts((v) => !v)
        case 'palette':
          return setShowPalette((v) => !v)
        case 'toggle-sidebar':
          return updateSettings({ layout: { ...layout, sidebar: !layout.sidebar } })
        default: {
          const tab = state.tabs[Number(action.slice('tab-'.length)) - 1]
          return tab && dispatch({ type: 'activate', key: tab.key })
        }
      }
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  })

  return (
    <Tabs
      className="flex h-full flex-col"
      activation="manual"
      value={state.active == null ? null : String(state.active)}
      onValueChange={(value) => value != null && dispatch({ type: 'activate', key: Number(value) })}
    >
      {/* Barra de título nativa fica por fora; esta barra é só a de abas. */}
      <header className="relative z-5 flex h-10 items-center gap-2 bg-linear-to-b from-material-thick to-material px-2 shadow-titlebar backdrop-blur-[24px] backdrop-saturate-160 select-none reduced-transparency:bg-surface reduced-transparency:bg-none reduced-transparency:backdrop-blur-none">
        <TabsList
          className={`flex min-w-0 gap-0.5 overflow-x-auto py-0.5 [scrollbar-width:none] ${layout.sidebar ? 'hidden' : ''}`}
          aria-label="Abas"
        >
          {state.tabs.map((tab, index) => (
            <TabMenu
              key={tab.key}
              first={index === 0}
              last={index === state.tabs.length - 1}
              alone={state.tabs.length === 1}
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
                <TabsTabIcon
                  className={`font-mono text-[11px] font-semibold ${tab.kind === 'claude' ? 'text-claude' : 'text-accent'}`}
                >
                  {tab.kind === 'claude' ? '✦' : '›_'}
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
                ×
              </Button>
            </TabMenu>
          ))}
        </TabsList>
        <span className="flex-1" />
        {layout.diffBadge && <GitDiff git={activeInfo.git} colors={diffColors} className="px-1" />}
        <div className="flex gap-1">
          {/* Os atalhos são ligados em actionFor; o shortcut do Tooltip só mostra e anuncia. */}
          <Tooltip shortcut="mod+shift+t">
            <TooltipTrigger
              render={<Button className={actionButton} aria-label="Nova aba" onClick={() => openTab('shell')} />}
            >
              +
            </TooltipTrigger>
            <TooltipContent className={tooltip} sideOffset={6}>
              Nova aba <TooltipShortcut className={tooltipKbd} />
            </TooltipContent>
          </Tooltip>
          <Tooltip shortcut="mod+shift+k">
            <TooltipTrigger
              render={
                <Button
                  className={`${actionButton} text-[12px] font-[560] tracking-[0.01em] text-claude`}
                  onClick={() => openTab('claude')}
                />
              }
            >
              ✦ Claude
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
      </header>

      <div className="flex min-h-0 flex-1">
        {layout.sidebar && (
          <TabSidebar
            tabs={state.tabs}
            active={state.active}
            info={workspace.info}
            colors={diffColors}
            onActivate={(key) => dispatch({ type: 'activate', key })}
            onClose={closeTab}
            onNew={() => openTab('shell')}
            renderAlert={(key) => <TabAlert alert={alerts.get(key)} colors={theme.terminal} />}
          />
        )}
        <main className="relative min-h-0 flex-1">
          {state.tabs.map((tab) => (
            <TabsPanel key={tab.key} value={String(tab.key)} keepMounted className="absolute inset-0">
              <TerminalMenu
                actions={() => terminalActions.current.get(tab.key)}
                onAction={(action) => runTerminalAction(tab.key, action)}
              >
                <TerminalView
                  kind={tab.kind}
                  active={tab.key === state.active}
                  settings={settings}
                  terminalTheme={theme.terminal}
                  cwd={cwd}
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
                  onActions={(actions) =>
                    actions ? terminalActions.current.set(tab.key, actions) : terminalActions.current.delete(tab.key)
                  }
                  onCwd={(dir) => workspace.reportCwd(tab.key, dir)}
                  onPrompt={() => workspace.reportPrompt(tab.key)}
                />
              </TerminalMenu>
            </TabsPanel>
          ))}
          {showThemes && (
            <ThemesPage
              value={settings.theme}
              onChange={(id) => updateSettings({ theme: id })}
              onPreview={setPreviewTheme}
              onClose={closeThemes}
            />
          )}
        </main>
      </div>
      {layout.statusBar && (
        <StatusBar
          info={activeInfo}
          kind={state.tabs.find((t) => t.key === state.active)?.kind}
          shellName={shellName}
          colors={diffColors}
          onSearch={() => setShowPalette(true)}
          searchKeys="Ctrl+Shift+P"
        />
      )}
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
            id: 'sidebar',
            label: layout.sidebar ? 'Ocultar abas na lateral' : 'Mostrar abas na lateral',
            keys: 'mod+shift+b',
            run: () => updateSettings({ layout: { ...layout, sidebar: !layout.sidebar } }),
          },
          { id: 'shortcuts', label: 'Atalhos de teclado', keys: 'f1', run: () => setShowShortcuts(true) },
        ]}
        onActivateTab={(key) => dispatch({ type: 'activate', key })}
        onGoToFolder={(dir) => void ipc.writeClipboard(`cd '${dir.replace(/'/g, "''")}'`)}
      />
    </Tabs>
  )
}
