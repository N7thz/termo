import { describe, expect, test } from 'bun:test'
import { actionFor } from './shortcuts'

const key = (k: string, mods: Partial<KeyboardEvent> = {}) =>
  ({ key: k, ctrlKey: false, shiftKey: false, altKey: false, ...mods }) as KeyboardEvent

describe('actionFor', () => {
  test('atalhos de aba', () => {
    expect(actionFor(key('T', { ctrlKey: true, shiftKey: true }))).toBe('new-shell')
    expect(actionFor(key('K', { ctrlKey: true, shiftKey: true }))).toBe('new-claude')
    expect(actionFor(key('W', { ctrlKey: true, shiftKey: true }))).toBe('close-tab')
    expect(actionFor(key('Tab', { ctrlKey: true }))).toBe('next-tab')
    expect(actionFor(key('Tab', { ctrlKey: true, shiftKey: true }))).toBe('prev-tab')
  })

  test('fonte', () => {
    expect(actionFor(key('=', { ctrlKey: true }))).toBe('font-up')
    expect(actionFor(key('-', { ctrlKey: true }))).toBe('font-down')
  })

  test('página de temas pela tecla física da vírgula', () => {
    expect(actionFor(key('<', { ctrlKey: true, shiftKey: true, code: 'Comma' }))).toBe('themes')
    expect(actionFor(key(',', { ctrlKey: true, code: 'Comma' }))).toBeNull()
  })

  test('teclas comuns vão para o shell', () => {
    expect(actionFor(key('c', { ctrlKey: true }))).toBeNull()
    expect(actionFor(key('t'))).toBeNull()
    expect(actionFor(key('k', { ctrlKey: true }))).toBeNull()
  })
})
