import { describe, expect, test } from 'bun:test'
import { formatShortcut } from '@ui-sdk/core/shortcuts'
import { actionFor, keysFor, SHORTCUTS } from './shortcuts'

const key = (k: string, mods: Partial<KeyboardEvent> = {}) =>
  ({ key: k, code: '', ctrlKey: false, shiftKey: false, altKey: false, metaKey: false, ...mods }) as KeyboardEvent

const ctrl = { ctrlKey: true }
const ctrlShift = { ctrlKey: true, shiftKey: true }

describe('actionFor', () => {
  test('atalhos de aba', () => {
    expect(actionFor(key('T', ctrlShift))).toBe('new-shell')
    expect(actionFor(key('K', ctrlShift))).toBe('new-claude')
    expect(actionFor(key('D', ctrlShift))).toBe('duplicate-tab')
    expect(actionFor(key('E', ctrlShift))).toBe('split-tab')
    expect(actionFor(key('W', ctrlShift))).toBe('close-tab')
    expect(actionFor(key('A', ctrlShift))).toBe('sessions')
    expect(actionFor(key('N', ctrlShift))).toBe('new-window')
    expect(actionFor(key('Tab', ctrl))).toBe('next-tab')
    expect(actionFor(key('Tab', ctrlShift))).toBe('prev-tab')
    expect(actionFor(key('PageDown', ctrl))).toBe('next-tab')
    expect(actionFor(key('PageUp', ctrl))).toBe('prev-tab')
    expect(actionFor(key('PageUp', ctrlShift))).toBe('move-tab-left')
    expect(actionFor(key('PageDown', ctrlShift))).toBe('move-tab-right')
  })

  test('ir para a aba pelo número, pela tecla física', () => {
    expect(actionFor(key('1', { ...ctrl, code: 'Digit1' }))).toBe('tab-1')
    expect(actionFor(key('8', { ...ctrl, code: 'Numpad8' }))).toBe('tab-8')
    expect(actionFor(key('&', { ...ctrl, code: 'Digit1' }))).toBe('tab-1')
    expect(actionFor(key('9', { ...ctrl, code: 'Digit9' }))).toBe('last-tab')
  })

  test('AltGr (Ctrl+Alt com AltGraph ligado) não vira atalho', () => {
    const altGr = { ctrlKey: true, altKey: true, getModifierState: (m: string) => m === 'AltGraph' }
    expect(actionFor(key('²', { ...altGr, code: 'Digit2' }))).toBeNull()
    expect(actionFor(key('ArrowRight', altGr))).toBeNull()
    expect(actionFor(key('T', { ...ctrlShift, altKey: true }))).toBeNull()
  })

  test('perfis: Ctrl+Alt+1..9 e Ctrl+Alt+setas', () => {
    const ctrlAlt = { ctrlKey: true, altKey: true, getModifierState: () => false }
    expect(actionFor(key('1', { ...ctrlAlt, code: 'Digit1' }))).toBe('profile-1')
    expect(actionFor(key('9', { ...ctrlAlt, code: 'Numpad9' }))).toBe('profile-9')
    expect(actionFor(key('ArrowRight', ctrlAlt))).toBe('next-profile')
    expect(actionFor(key('ArrowLeft', ctrlAlt))).toBe('prev-profile')
    expect(actionFor(key('1', { ...ctrlAlt, shiftKey: true, code: 'Digit1' }))).toBeNull()
  })

  test('fonte', () => {
    expect(actionFor(key('=', ctrl))).toBe('font-up')
    expect(actionFor(key('+', { ...ctrlShift }))).toBe('font-up')
    expect(actionFor(key('-', ctrl))).toBe('font-down')
    expect(actionFor(key('0', { ...ctrl, code: 'Digit0' }))).toBe('font-reset')
  })

  test('temas e configurações pela tecla física da vírgula', () => {
    expect(actionFor(key('<', { ...ctrlShift, code: 'Comma' }))).toBe('themes')
    expect(actionFor(key(',', { ...ctrl, code: 'Comma' }))).toBe('settings')
  })

  test('tela cheia e folha de atalhos', () => {
    expect(actionFor(key('F11'))).toBe('fullscreen')
    expect(actionFor(key('F1'))).toBe('shortcuts')
    expect(actionFor(key('?', { ...ctrlShift, code: 'Slash' }))).toBe('shortcuts')
    expect(actionFor(key('?', { ...ctrlShift, code: 'IntlRo' }))).toBe('shortcuts')
    expect(actionFor(key('F11', ctrl))).toBeNull()
  })

  test('teclas do terminal continuam indo para o shell', () => {
    expect(actionFor(key('c', ctrl))).toBeNull()
    expect(actionFor(key('v', ctrl))).toBeNull()
    expect(actionFor(key('F', ctrlShift))).toBeNull()
    expect(actionFor(key('C', ctrlShift))).toBeNull()
    expect(actionFor(key('t'))).toBeNull()
    expect(actionFor(key('k', ctrl))).toBeNull()
    expect(actionFor(key('1', { altKey: true, code: 'Digit1' }))).toBeNull()
  })
})

describe('tabela de atalhos', () => {
  test('nenhuma combinação dispara duas ações', () => {
    const probes = [
      ...'tkdwcvf'.split('').flatMap((k) => [key(k, ctrl), key(k.toUpperCase(), ctrlShift)]),
      ...['Tab', 'PageUp', 'PageDown'].flatMap((k) => [key(k, ctrl), key(k, ctrlShift)]),
      ...[0, 1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => key(String(n), { ...ctrl, code: `Digit${n}` })),
      key(',', { ...ctrl, code: 'Comma' }),
      key('<', { ...ctrlShift, code: 'Comma' }),
      key('F1'),
      key('F11'),
    ]
    for (const e of probes) {
      const hits = SHORTCUTS.filter((s) => s.action && s.match?.(e))
      expect(hits.length).toBeLessThanOrEqual(1)
    }
  })

  test('toda ação do app tem como disparar, e todo atalho se formata', () => {
    for (const s of SHORTCUTS) {
      if (s.action) expect(s.match).toBeDefined()
      for (const k of s.keys) expect(formatShortcut(k)).not.toBe('')
    }
    expect(keysFor('new-shell')).toBe('mod+shift+t')
    expect(keysFor('shortcuts')).toBe('mod+shift+/')
  })
})
