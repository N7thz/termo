import { expect, test } from 'bun:test'
import { initialTabs, outputIdFor, restore, snapshot, tabsReducer } from '../tabs/tabs'
import { trimToFit } from './scrollback'

test('trimToFit corta o começo em linhas inteiras', () => {
  expect(trimToFit('abc', 10)).toBe('abc')
  expect(trimToFit('linha1\nlinha2\nlinha3', 10)).toBe('linha3')
  expect(trimToFit('semquebra', 4)).toBe('ebra')
})

test('outputIdFor mantém o id da sessão salva e cria um por aba nova', () => {
  const ids = new Map<number, string>()
  let n = 0
  const make = () => `id${++n}`
  expect(outputIdFor(ids, { key: 1, outputId: 'salvo' }, make)).toBe('salvo')
  expect(outputIdFor(ids, { key: 2 }, make)).toBe('id1')
  expect(outputIdFor(ids, { key: 2 }, make)).toBe('id1')
  expect(outputIdFor(ids, { key: 3 }, make)).toBe('id2')
})

test('o id da saída vai e volta pela sessão salva, e ids inválidos ficam de fora', () => {
  let state = tabsReducer(initialTabs, { type: 'open', kind: 'shell', title: 'pwsh', profile: 'p' })
  state = tabsReducer(state, { type: 'open', kind: 'shell', title: 'pwsh', profile: 'p' })
  const [a, b] = state.tabs
  const snap = snapshot(
    state,
    () => undefined,
    (t) => (t.key === a.key ? 'abc123' : t.key === b.key ? '../fora' : undefined),
  )
  expect(snap.tabs[0].output).toBe('abc123')
  expect(snap.tabs[1].output).toBeUndefined()
  const back = restore(snap, initialTabs, new Set(['p']))
  expect(back.tabs[0].outputId).toBe('abc123')
  expect(back.tabs[1].outputId).toBeUndefined()
  // Snapshot sem o campo (versão anterior) continua valendo.
  const old = restore({ ...snap, tabs: snap.tabs.map(({ output: _, ...t }) => t) }, initialTabs, new Set(['p']))
  expect(old.tabs).toHaveLength(2)
  expect(old.tabs[0].outputId).toBeUndefined()
})
