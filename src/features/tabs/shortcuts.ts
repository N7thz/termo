export type TabNumber = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8

export type AppAction =
  | 'new-shell'
  | 'new-claude'
  | 'duplicate-tab'
  | 'close-tab'
  | 'next-tab'
  | 'prev-tab'
  | 'move-tab-left'
  | 'move-tab-right'
  | `tab-${TabNumber}`
  | 'last-tab'
  | 'font-up'
  | 'font-down'
  | 'font-reset'
  | 'themes'
  | 'settings'
  | 'fullscreen'
  | 'shortcuts'
  | 'palette'
  | 'toggle-sidebar'

export type ShortcutGroup = 'Abas' | 'Terminal' | 'Janela'

export interface Shortcut {
  group: ShortcutGroup
  label: string
  /** Teclas como o UI SDK escreve (`mod+shift+t`), formatadas para a plataforma na hora de mostrar. */
  keys: readonly string[]
  /** Sem `action`: o atalho é do terminal (TerminalView) e só aparece na folha de atalhos. */
  action?: AppAction
  match?: (e: KeyboardEvent) => boolean
}

const key = (e: KeyboardEvent) => e.key.toLowerCase()
// AltGr chega como Ctrl+Alt no Windows: sem exigir !alt, AltGr+2 (²) viraria atalho.
const ctrl = (e: KeyboardEvent) => e.ctrlKey && !e.altKey && !e.metaKey
const ctrlOnly = (e: KeyboardEvent) => ctrl(e) && !e.shiftKey
const ctrlShift = (e: KeyboardEvent) => ctrl(e) && e.shiftKey
const plain = (e: KeyboardEvent) => !e.ctrlKey && !e.altKey && !e.shiftKey && !e.metaKey
// Dígitos pela tecla física: com Shift ou em AZERTY o `key` não é o número.
const digit = (e: KeyboardEvent, n: number) => e.code === `Digit${n}` || e.code === `Numpad${n}` || e.key === String(n)

const goToTab = (n: TabNumber): Shortcut => ({
  group: 'Abas',
  label: `Ir para a aba ${n}`,
  keys: [`mod+${n}`],
  action: `tab-${n}`,
  match: (e) => ctrlOnly(e) && digit(e, n),
})

export const SHORTCUTS: readonly Shortcut[] = [
  {
    group: 'Abas',
    label: 'Nova aba',
    keys: ['mod+shift+t'],
    action: 'new-shell',
    match: (e) => ctrlShift(e) && key(e) === 't',
  },
  {
    group: 'Abas',
    label: 'Nova aba com Claude Code',
    keys: ['mod+shift+k'],
    action: 'new-claude',
    match: (e) => ctrlShift(e) && key(e) === 'k',
  },
  {
    group: 'Abas',
    label: 'Duplicar aba',
    keys: ['mod+shift+d'],
    action: 'duplicate-tab',
    match: (e) => ctrlShift(e) && key(e) === 'd',
  },
  {
    group: 'Abas',
    label: 'Fechar aba',
    keys: ['mod+shift+w'],
    action: 'close-tab',
    match: (e) => ctrlShift(e) && key(e) === 'w',
  },
  {
    group: 'Abas',
    label: 'Próxima aba',
    keys: ['ctrl+tab', 'ctrl+pagedown'],
    action: 'next-tab',
    match: (e) => (ctrlOnly(e) && key(e) === 'tab') || (ctrlOnly(e) && e.key === 'PageDown'),
  },
  {
    group: 'Abas',
    label: 'Aba anterior',
    keys: ['ctrl+shift+tab', 'ctrl+pageup'],
    action: 'prev-tab',
    match: (e) => (ctrlShift(e) && key(e) === 'tab') || (ctrlOnly(e) && e.key === 'PageUp'),
  },
  {
    group: 'Abas',
    label: 'Mover aba para a esquerda',
    keys: ['ctrl+shift+pageup'],
    action: 'move-tab-left',
    match: (e) => ctrlShift(e) && e.key === 'PageUp',
  },
  {
    group: 'Abas',
    label: 'Mover aba para a direita',
    keys: ['ctrl+shift+pagedown'],
    action: 'move-tab-right',
    match: (e) => ctrlShift(e) && e.key === 'PageDown',
  },
  ...([1, 2, 3, 4, 5, 6, 7, 8] as const).map(goToTab),
  {
    group: 'Abas',
    label: 'Ir para a última aba',
    keys: ['mod+9'],
    action: 'last-tab',
    match: (e) => ctrlOnly(e) && digit(e, 9),
  },
  { group: 'Terminal', label: 'Copiar a seleção', keys: ['mod+shift+c', 'mod+c'] },
  { group: 'Terminal', label: 'Colar', keys: ['mod+v'] },
  { group: 'Terminal', label: 'Buscar na saída', keys: ['mod+shift+f'] },
  { group: 'Terminal', label: 'Executar a sugestão de pasta 1 a 9', keys: ['alt+1'] },
  { group: 'Terminal', label: 'Ir para a lista de sugestões', keys: ['alt+arrowdown'] },
  {
    group: 'Janela',
    label: 'Aumentar a fonte',
    keys: ['mod+='],
    action: 'font-up',
    match: (e) => ctrl(e) && (e.key === '=' || e.key === '+' || e.code === 'NumpadAdd'),
  },
  {
    group: 'Janela',
    label: 'Diminuir a fonte',
    keys: ['mod+-'],
    action: 'font-down',
    match: (e) => ctrl(e) && (e.key === '-' || e.code === 'NumpadSubtract'),
  },
  {
    group: 'Janela',
    label: 'Tamanho padrão da fonte',
    keys: ['mod+0'],
    action: 'font-reset',
    match: (e) => ctrlOnly(e) && digit(e, 0),
  },
  {
    group: 'Janela',
    label: 'Temas',
    keys: ['mod+shift+,'],
    action: 'themes',
    // Pela tecla física: com Shift o `key` vira "<" em vários layouts.
    match: (e) => ctrlShift(e) && e.code === 'Comma',
  },
  {
    group: 'Janela',
    label: 'Configurações',
    keys: ['mod+,'],
    action: 'settings',
    match: (e) => ctrlOnly(e) && e.code === 'Comma',
  },
  {
    group: 'Janela',
    label: 'Busca geral (abas, pastas, arquivos)',
    keys: ['mod+shift+p'],
    action: 'palette',
    match: (e) => ctrlShift(e) && key(e) === 'p',
  },
  {
    group: 'Janela',
    label: 'Mostrar/ocultar abas na lateral',
    keys: ['mod+shift+b'],
    action: 'toggle-sidebar',
    match: (e) => ctrlShift(e) && key(e) === 'b',
  },
  {
    group: 'Janela',
    label: 'Tela cheia',
    keys: ['f11'],
    action: 'fullscreen',
    match: (e) => plain(e) && e.key === 'F11',
  },
  {
    group: 'Janela',
    label: 'Mostrar os atalhos',
    keys: ['mod+shift+/', 'f1'],
    action: 'shortcuts',
    // No ABNT2 a barra fica na tecla IntlRo; nos outros, em Slash.
    match: (e) =>
      (ctrlShift(e) && (e.code === 'Slash' || e.code === 'IntlRo' || e.key === '?')) || (plain(e) && e.key === 'F1'),
  },
]

export const SHORTCUT_GROUPS: readonly ShortcutGroup[] = ['Abas', 'Terminal', 'Janela']

/** Atalhos do app, no estilo do Warp / Windows Terminal. */
export function actionFor(e: KeyboardEvent): AppAction | null {
  for (const s of SHORTCUTS) if (s.action && s.match?.(e)) return s.action
  return null
}

export const isAppShortcut = (e: KeyboardEvent) => actionFor(e) !== null

/** O primeiro atalho de uma ação, no formato do UI SDK, para dicas em menus e tooltips. */
export function keysFor(action: AppAction): string | undefined {
  return SHORTCUTS.find((s) => s.action === action)?.keys[0]
}
