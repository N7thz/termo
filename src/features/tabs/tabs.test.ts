import { describe, expect, test } from 'bun:test'
import { initialTabs, type TabsState, tabsReducer, tabsToClose } from './tabs'

const open3 = (): TabsState =>
  ['a', 'b', 'c'].reduce((s, title) => tabsReducer(s, { type: 'open', kind: 'shell', title }), initialTabs)

describe('tabsReducer', () => {
  test('abrir ativa a aba nova', () => {
    const s = open3()
    expect(s.tabs.map((t) => t.title)).toEqual(['a', 'b', 'c'])
    expect(s.active).toBe(3)
  })

  test('fechar a ativa vai para a vizinha da esquerda', () => {
    const s = tabsReducer(open3(), { type: 'close', key: 3 })
    expect(s.active).toBe(2)
  })

  test('fechar a primeira ativa vai para a nova primeira', () => {
    let s = tabsReducer(open3(), { type: 'activate', key: 1 })
    s = tabsReducer(s, { type: 'close', key: 1 })
    expect(s.active).toBe(2)
  })

  test('fechar outra aba mantém a ativa', () => {
    const s = tabsReducer(open3(), { type: 'close', key: 1 })
    expect(s.active).toBe(3)
  })

  test('fechar a última deixa sem ativa', () => {
    let s = tabsReducer(initialTabs, { type: 'open', kind: 'claude', title: 'x' })
    s = tabsReducer(s, { type: 'close', key: 1 })
    expect(s).toMatchObject({ tabs: [], active: null })
  })

  test('ciclar dá a volta', () => {
    let s = tabsReducer(open3(), { type: 'cycle', delta: 1 })
    expect(s.active).toBe(1)
    s = tabsReducer(s, { type: 'cycle', delta: -1 })
    expect(s.active).toBe(3)
  })

  test('update troca só a aba certa', () => {
    const s = tabsReducer(open3(), { type: 'update', key: 2, patch: { title: 'novo', kind: 'claude' } })
    expect(s.tabs[1]).toEqual({ key: 2, title: 'novo', kind: 'claude' })
    expect(s.tabs[0].title).toBe('a')
  })
})

describe('ações do menu das abas', () => {
  test('abrir com after insere logo à direita e ativa', () => {
    const s = tabsReducer(open3(), { type: 'open', kind: 'shell', title: 'a2', after: 1 })
    expect(s.tabs.map((t) => t.title)).toEqual(['a', 'a2', 'b', 'c'])
    expect(s.active).toBe(4)
  })

  test('abrir com after de aba inexistente vai para o fim', () => {
    const s = tabsReducer(open3(), { type: 'open', kind: 'shell', title: 'x', after: 99 })
    expect(s.tabs.map((t) => t.title)).toEqual(['a', 'b', 'c', 'x'])
  })

  test('mover troca com a vizinha e para nas pontas', () => {
    let s = tabsReducer(open3(), { type: 'move', key: 1, delta: 1 })
    expect(s.tabs.map((t) => t.title)).toEqual(['b', 'a', 'c'])
    s = tabsReducer(s, { type: 'move', key: 2, delta: -1 })
    expect(s.tabs.map((t) => t.title)).toEqual(['b', 'a', 'c'])
    expect(tabsReducer(s, { type: 'move', key: 3, delta: 1 })).toBe(s)
  })

  test('mover não muda a aba ativa', () => {
    const s = tabsReducer(open3(), { type: 'move', key: 3, delta: -1 })
    expect(s.active).toBe(3)
  })

  test('fechar outras e fechar à direita', () => {
    const s = open3()
    expect(tabsToClose(s, 2, 'others')).toEqual([1, 3])
    expect(tabsToClose(s, 2, 'right')).toEqual([3])
    expect(tabsToClose(s, 3, 'right')).toEqual([])
    expect(tabsToClose(s, 99, 'others')).toEqual([])
  })
})
