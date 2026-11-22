import { describe, expect, test } from 'bun:test'
import { initialTabs, type TabsState, tabsReducer, visibleTabs } from './tabs'

const open = (s: TabsState, title: string) => tabsReducer(s, { type: 'open', kind: 'shell', title })
const titles = (s: TabsState) => visibleTabs(s).map((t) => t.title)

function four() {
  let s = { ...initialTabs, profile: 'p' }
  for (const t of ['a', 'b', 'c', 'd']) s = open(s, t)
  return s // chaves 1..4
}

describe('reorder (arrastar)', () => {
  test('põe a aba antes de outra, para cima e para baixo', () => {
    let s = four()
    s = tabsReducer(s, { type: 'reorder', key: 4, before: 2, group: null })
    expect(titles(s)).toEqual(['a', 'd', 'b', 'c'])
    s = tabsReducer(s, { type: 'reorder', key: 1, before: 3, group: null })
    expect(titles(s)).toEqual(['d', 'b', 'a', 'c'])
  })

  test('sem referência vai para o fim das soltas', () => {
    const s = tabsReducer(four(), { type: 'reorder', key: 1, before: null, group: null })
    expect(titles(s)).toEqual(['b', 'c', 'd', 'a'])
  })

  test('soltar antes de uma aba de grupo entra no grupo; no fim das soltas, sai dele', () => {
    let s = tabsReducer(four(), { type: 'group-create', key: 1, name: 'G' })
    s = tabsReducer(s, { type: 'reorder', key: 3, before: 1, group: null })
    expect(titles(s)).toEqual(['c', 'a', 'b', 'd'])
    expect(s.tabs.find((t) => t.key === 3)?.group).toBe('g1')
    s = tabsReducer(s, { type: 'reorder', key: 1, before: null, group: null })
    expect(titles(s)).toEqual(['c', 'b', 'd', 'a'])
    expect(s.tabs.find((t) => t.key === 1)?.group).toBeUndefined()
  })

  test('soltar no cabeçalho do grupo vai para o fim dele', () => {
    let s = tabsReducer(four(), { type: 'group-create', key: 1, name: 'G' })
    s = tabsReducer(s, { type: 'reorder', key: 4, before: null, group: 'g1' })
    expect(titles(s)).toEqual(['a', 'd', 'b', 'c'])
  })

  test('sem mudança devolve o mesmo estado; grupo desconhecido é ignorado', () => {
    const s = four()
    expect(tabsReducer(s, { type: 'reorder', key: 2, before: 3, group: null })).toBe(s)
    expect(tabsReducer(s, { type: 'reorder', key: 2, before: 2, group: null })).toBe(s)
    expect(tabsReducer(s, { type: 'reorder', key: 2, before: null, group: 'nao-existe' })).toBe(s)
  })
})
