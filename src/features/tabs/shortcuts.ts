export type AppAction =
  | 'new-shell'
  | 'new-claude'
  | 'close-tab'
  | 'next-tab'
  | 'prev-tab'
  | 'font-up'
  | 'font-down'
  | 'themes'

/** Atalhos do app, no estilo do Warp / Windows Terminal. */
export function actionFor(e: KeyboardEvent): AppAction | null {
  const k = e.key.toLowerCase()
  if (e.ctrlKey && e.shiftKey && k === 't') return 'new-shell'
  if (e.ctrlKey && e.shiftKey && k === 'k') return 'new-claude'
  if (e.ctrlKey && e.shiftKey && k === 'w') return 'close-tab'
  if (e.ctrlKey && k === 'tab') return e.shiftKey ? 'prev-tab' : 'next-tab'
  if (e.ctrlKey && (k === '=' || k === '+')) return 'font-up'
  if (e.ctrlKey && k === '-') return 'font-down'
  // Ctrl+Shift+, pela tecla física (com Shift o `key` vira "<" em vários layouts).
  if (e.ctrlKey && e.shiftKey && e.code === 'Comma') return 'themes'
  return null
}

export const isAppShortcut = (e: KeyboardEvent) => actionFor(e) !== null
