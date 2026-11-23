import { expect, test } from 'bun:test'
import { comboFromEvent, formatCombo } from './hotkey'

const ev = (code: string, mods: Partial<{ ctrl: boolean; alt: boolean; shift: boolean; meta: boolean }> = {}) => ({
  code,
  ctrlKey: !!mods.ctrl,
  altKey: !!mods.alt,
  shiftKey: !!mods.shift,
  metaKey: !!mods.meta,
})

test('monta o atalho pela tecla física', () => {
  expect(comboFromEvent(ev('KeyT', { ctrl: true, alt: true }))).toBe('Ctrl+Alt+T')
  expect(comboFromEvent(ev('F12', { alt: true }))).toBe('Alt+F12')
  expect(comboFromEvent(ev('Backquote', { meta: true }))).toBe('Super+Backquote')
  expect(comboFromEvent(ev('Digit1', { ctrl: true, shift: true }))).toBe('Ctrl+Shift+1')
  expect(comboFromEvent(ev('Space', { ctrl: true, shift: true }))).toBe('Ctrl+Shift+Space')
  expect(comboFromEvent(ev('F9'))).toBe('F9')
})

test('recusa só modificadores, tecla comum sozinha e Shift + tecla comum', () => {
  expect(comboFromEvent(ev('ControlLeft', { ctrl: true }))).toBeNull()
  expect(comboFromEvent(ev('KeyA'))).toBeNull()
  expect(comboFromEvent(ev('KeyA', { shift: true }))).toBeNull()
  expect(comboFromEvent(ev(''))).toBeNull()
})

test('formatCombo', () => {
  expect(formatCombo('Super+Backquote')).toBe('Win + `')
  expect(formatCombo('Ctrl+Alt+T')).toBe('Ctrl + Alt + T')
})
