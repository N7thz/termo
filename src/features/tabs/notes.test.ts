import { describe, expect, test } from 'bun:test'
import { appendNote, cleanNote, initialTabs, lastLine, MAX_TAB_NOTE, restore, snapshot, tabsReducer } from './tabs'

describe('nota da aba', () => {
  test('limpa o texto', () => {
    expect(cleanNote('  \n\nfeito: login  \r\n\r\n\r\n\r\nfalta: testes\u0007 \n')).toBe(
      'feito: login\n\nfalta: testes',
    )
    expect(cleanNote('   ')).toBeUndefined()
    expect(cleanNote(null)).toBeUndefined()
    expect(cleanNote('x'.repeat(MAX_TAB_NOTE + 50))?.length).toBe(MAX_TAB_NOTE)
  })

  test('junta linhas e corta as mais antigas', () => {
    expect(appendNote(undefined, 'etapa 1')).toBe('etapa 1')
    expect(appendNote('etapa 1', '  ')).toBe('etapa 1')
    expect(appendNote('etapa 1', 'etapa 2')).toBe('etapa 1\netapa 2')
    const long = Array.from({ length: 200 }, (_, i) => `linha ${i} ${'x'.repeat(20)}`).join('\n')
    const next = appendNote(long, 'última') ?? ''
    expect(next.length).toBeLessThanOrEqual(MAX_TAB_NOTE)
    expect(lastLine(next)).toBe('última')
    expect(next.startsWith('linha 0 ')).toBe(false)
  })

  test('última linha', () => {
    expect(lastLine('a\nb\n\n')).toBe('b')
    expect(lastLine('')).toBe('')
  })

  test('reducer e sessão salva', () => {
    let s = tabsReducer(initialTabs, { type: 'open', kind: 'claude', title: 'Claude Code' })
    const key = s.tabs[0].key
    s = tabsReducer(s, { type: 'note', key, note: 'plano: 3 etapas' })
    s = tabsReducer(s, { type: 'note', key, note: 'etapa 1 ok', append: true })
    expect(s.tabs[0].note).toBe('plano: 3 etapas\netapa 1 ok')
    const same = tabsReducer(s, { type: 'note', key, note: 'plano: 3 etapas\netapa 1 ok' })
    expect(same).toBe(s)
    const back = restore(
      JSON.parse(
        JSON.stringify(
          snapshot(
            s,
            () => undefined,
            () => undefined,
          ),
        ),
      ),
    )
    expect(back.tabs[0].note).toBe('plano: 3 etapas\netapa 1 ok')
    s = tabsReducer(s, { type: 'note', key, note: null })
    expect(s.tabs[0].note).toBeUndefined()
    expect('note' in s.tabs[0]).toBe(false)
  })
})
