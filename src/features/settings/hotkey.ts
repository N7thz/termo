/** Teclas que sozinhas não formam um atalho. */
const MODIFIER_CODES = new Set([
  'ControlLeft',
  'ControlRight',
  'ShiftLeft',
  'ShiftRight',
  'AltLeft',
  'AltRight',
  'MetaLeft',
  'MetaRight',
])

export interface KeyLike {
  code: string
  ctrlKey: boolean
  altKey: boolean
  shiftKey: boolean
  metaKey: boolean
}

/**
 * Atalho global no formato do tauri-plugin-global-shortcut (`Ctrl+Alt+T`, `Alt+F12`), a partir da tecla
 * física (`code`, que não muda com o layout ABNT2). `null` enquanto só há modificadores, ou sem nenhum
 * modificador numa tecla comum (uma letra sozinha roubaria a digitação em todo o Windows). F1 a F24
 * podem ir sem modificador.
 */
export function comboFromEvent(e: KeyLike): string | null {
  if (MODIFIER_CODES.has(e.code) || !e.code) return null
  const mods = [e.ctrlKey && 'Ctrl', e.altKey && 'Alt', e.shiftKey && 'Shift', e.metaKey && 'Super'].filter(
    Boolean,
  ) as string[]
  const key = e.code.replace(/^Key(?=[A-Z]$)/, '').replace(/^Digit(?=\d$)/, '')
  const isFn = /^F([1-9]|1\d|2[0-4])$/.test(key)
  if (mods.length === 0 && !isFn) return null
  // Só Shift + tecla comum também digitaria (Shift+A = "A").
  if (mods.length === 1 && mods[0] === 'Shift' && !isFn) return null
  return [...mods, key].join('+')
}

/** Como mostrar o atalho salvo (`Super` aparece como `Win`). */
export function formatCombo(combo: string): string {
  return combo
    .split('+')
    .map((p) => (p === 'Super' ? 'Win' : p === 'Backquote' ? '`' : p))
    .join(' + ')
}
