import { describe, expect, test } from 'bun:test'
import { leaves, toOps } from './splitTree'
import { initialTabs, paneMates, restore, snapshot, splitOf, type TabsState, tabsReducer, visibleTabs } from './tabs'

const open = (s: TabsState, title: string, extra: object = {}) =>
  tabsReducer(s, { type: 'open', kind: 'shell', title, ...extra })

function three() {
  let s = { ...initialTabs, profile: 'p' }
  s = open(s, 'a')
  s = open(s, 'b')
  s = open(s, 'c')
  return s // chaves 1, 2, 3
}

describe('grupos', () => {
  test('criar grupo põe a aba dentro e ela vai para o topo da ordem de tela', () => {
    let s = three()
    s = tabsReducer(s, { type: 'group-create', key: 3, name: '  Servidores  ' })
    expect(s.groups).toEqual([{ id: 'g1', name: 'Servidores', profile: 'p', collapsed: false }])
    expect(visibleTabs(s).map((t) => t.title)).toEqual(['c', 'a', 'b'])
  })

  test('nome vazio vira "Grupo N"; renomear vazio é ignorado', () => {
    let s = tabsReducer(three(), { type: 'group-create', key: 1, name: ' ' })
    expect(s.groups[0].name).toBe('Grupo 1')
    s = tabsReducer(s, { type: 'group-rename', id: 'g1', name: '' })
    expect(s.groups[0].name).toBe('Grupo 1')
  })

  test('mover para grupo, tirar e desfazer o grupo mantém as abas', () => {
    let s = tabsReducer(three(), { type: 'group-create', key: 1, name: 'X' })
    s = tabsReducer(s, { type: 'set-group', key: 2, group: 'g1' })
    expect(visibleTabs(s).map((t) => t.title)).toEqual(['a', 'b', 'c'])
    s = tabsReducer(s, { type: 'set-group', key: 1, group: null })
    expect(s.tabs.find((t) => t.key === 1)?.group).toBeUndefined()
    s = tabsReducer(s, { type: 'group-delete', id: 'g1' })
    expect(s.groups).toEqual([])
    expect(s.tabs).toHaveLength(3)
    expect(s.tabs.every((t) => !t.group)).toBe(true)
  })

  test('não move aba para grupo de outro perfil', () => {
    let s = tabsReducer(three(), { type: 'group-create', key: 1, name: 'X' })
    s = open(s, 'outro', { profile: 'q' })
    const before = s
    s = tabsReducer(s, { type: 'set-group', key: 4, group: 'g1' })
    expect(s).toBe(before)
  })

  test('ativar aba de grupo recolhido abre o grupo', () => {
    let s = tabsReducer(three(), { type: 'group-create', key: 1, name: 'X' })
    s = tabsReducer(s, { type: 'group-toggle', id: 'g1' })
    expect(s.groups[0].collapsed).toBe(true)
    s = tabsReducer(s, { type: 'activate', key: 1 })
    expect(s.groups[0].collapsed).toBe(false)
  })

  test('mover não atravessa a borda do grupo', () => {
    const s = tabsReducer(three(), { type: 'group-create', key: 1, name: 'X' })
    expect(tabsReducer(s, { type: 'move', key: 1, delta: 1 })).toBe(s)
  })
})

/** As telas divididas no formato do disco (lista de divisões), para comparar fácil. */
const splitOps = (s: TabsState) => s.splits.map((l) => toOps(l.root))

describe('tela dividida', () => {
  test('abrir dividida cria a divisão e foca a nova', () => {
    const s = open(three(), 'd', { splitWith: 1 })
    expect(splitOps(s)).toEqual([[{ left: 1, right: 4, ratio: 0.5, dir: 'row' }]])
    expect(s.active).toBe(4)
    expect(splitOf(s, 1)).toBe(splitOf(s, 4))
  })

  test('dividir de novo um painel faz a árvore; embaixo com `col`', () => {
    let s = tabsReducer(three(), { type: 'split', key: 1, with: 2 })
    s = tabsReducer(s, { type: 'split', key: 2, with: 3, dir: 'col' })
    expect(splitOps(s)).toEqual([
      [
        { left: 1, right: 2, ratio: 0.5, dir: 'row' },
        { left: 2, right: 3, ratio: 0.5, dir: 'col' },
      ],
    ])
    expect(paneMates(s, 1)).toEqual([2, 3])
    s = open(s, 'd', { splitWith: 3, splitDir: 'col' })
    expect(leaves(s.splits[0].root)).toEqual([1, 2, 3, 4])
  })

  test('uma aba fica numa tela dividida só', () => {
    let s = tabsReducer(three(), { type: 'split', key: 1, with: 2 })
    s = tabsReducer(s, { type: 'split', key: 3, with: 2 })
    expect(splitOps(s)).toEqual([[{ left: 3, right: 2, ratio: 0.5, dir: 'row' }]])
  })

  test('fechar a ativa deixa um vizinho ativo; com um painel só, deixa de ser dividida', () => {
    let s = open(three(), 'd', { splitWith: 1 })
    s = tabsReducer(s, { type: 'close', key: 4 })
    expect(s.active).toBe(1)
    expect(s.splits).toEqual([])
  })

  test('fechar o painel do meio mantém os outros divididos', () => {
    let s = tabsReducer(three(), { type: 'split', key: 1, with: 2 })
    s = tabsReducer(s, { type: 'split', key: 2, with: 3, dir: 'col' })
    s = tabsReducer(s, { type: 'close', key: 2 })
    expect(splitOps(s)).toEqual([[{ left: 1, right: 3, ratio: 0.5, dir: 'row' }]])
  })

  test('proporção de cada divisão fica entre 10% e 90%; ampliar e voltar', () => {
    let s = tabsReducer(three(), { type: 'split', key: 1, with: 2 })
    s = tabsReducer(s, { type: 'split-ratio', key: 2, path: '', ratio: 0.95 })
    expect(splitOps(s)[0][0].ratio).toBe(0.9)
    s = tabsReducer(s, { type: 'zoom', key: 1 })
    expect(s.splits[0].zoomed).toBe(true)
    s = tabsReducer(s, { type: 'zoom', key: 2 })
    expect(s.splits[0].zoomed).toBe(false)
    s = tabsReducer(s, { type: 'unsplit', key: 1 })
    expect(s.splits).toEqual([])
  })
})

describe('salvar e restaurar', () => {
  test('ida e volta preserva abas, perfis, grupos, pares e a ativa', () => {
    let s = three()
    s = open(s, 'q1', { profile: 'q', cwd: 'D:q' })
    s = tabsReducer(s, { type: 'switch-profile', profile: 'p' })
    s = tabsReducer(s, { type: 'group-create', key: 2, name: 'Build' })
    s = tabsReducer(s, { type: 'split', key: 1, with: 3 })
    s = tabsReducer(s, { type: 'activate', key: 3 })
    const snap = snapshot(s, (t) => (t.key === 1 ? 'C:proj' : t.cwd))
    const r = restore(JSON.parse(JSON.stringify(snap)))
    expect(r.tabs.map((t) => [t.title, t.profile, t.cwd, t.group])).toEqual([
      ['a', 'p', 'C:proj', undefined],
      ['b', 'p', undefined, 'g1'],
      ['c', 'p', undefined, undefined],
      ['q1', 'q', 'D:q', undefined],
    ])
    expect(r.profile).toBe('p')
    expect(r.active).toBe(3)
    expect(r.lastActive.q).toBe(4)
    expect(r.groups[0].name).toBe('Build')
    expect(r.nextGroup).toBe(2)
    expect(splitOps(r)).toEqual([[{ left: 1, right: 3, ratio: 0.5, dir: 'row' }]])
    expect(r.nextKey).toBe(5)
  })

  test('abas e grupos de perfis excluídos ficam de fora', () => {
    let s = three()
    s = open(s, 'q1', { profile: 'q' })
    s = tabsReducer(s, { type: 'group-create', key: 4, name: 'G' })
    const r = restore(
      snapshot(s, (t) => t.cwd),
      initialTabs,
      new Set(['p']),
    )
    expect(r.tabs.map((t) => t.title)).toEqual(['a', 'b', 'c'])
    expect(r.groups).toEqual([])
  })

  test('arquivo velho, vazio ou corrompido não quebra', () => {
    expect(restore(null)).toBe(initialTabs)
    expect(restore({ version: 2, tabs: [] })).toBe(initialTabs)
    expect(restore({ version: 1, tabs: [] })).toBe(initialTabs)
    const r = restore({
      version: 1,
      profile: 'sumiu',
      tabs: [
        { kind: 'evil', profile: 'p' },
        { kind: 'shell', title: 'ok', profile: 'p', group: 'nao-existe' },
      ],
      active: { p: 0 },
      groups: [{ id: 'x' }],
      pairs: [{ left: 0, right: 1 }],
    })
    expect(r.tabs).toEqual([{ key: 1, kind: 'shell', title: 'ok', profile: 'p' }])
    expect(r.profile).toBe('p')
    expect(r.active).toBe(1)
    expect(r.splits).toEqual([])
    expect(r.groups).toEqual([])
  })
})

describe('zoom do painel', () => {
  const split = () =>
    tabsReducer(open(open({ ...initialTabs, profile: 'p' }, 'a'), 'b'), { type: 'split', key: 1, with: 2 })

  test('liga e desliga sem desfazer a divisão', () => {
    const zoomed = tabsReducer(split(), { type: 'zoom', key: 2 })
    expect(zoomed.splits).toHaveLength(1)
    expect(zoomed.splits[0].zoomed).toBe(true)
    expect(tabsReducer(zoomed, { type: 'zoom', key: 1 }).splits[0].zoomed).toBe(false)
  })

  test('sem divisão não faz nada, e nova divisão começa sem zoom', () => {
    const lone = open({ ...initialTabs, profile: 'p' }, 'a')
    expect(tabsReducer(lone, { type: 'zoom', key: 1 })).toBe(lone)
    const zoomed = tabsReducer(split(), { type: 'zoom', key: 1 })
    expect(tabsReducer(zoomed, { type: 'split', key: 1, with: 2 }).splits[0].zoomed).toBeUndefined()
  })
})

describe('sessões antigas', () => {
  test('pares sem `dir` (antes da árvore) voltam como telas divididas lado a lado', () => {
    const old = {
      version: 1,
      profile: 'p',
      tabs: ['a', 'b', 'c', 'd'].map((title) => ({ kind: 'shell', title, profile: 'p' })),
      active: { p: 0 },
      groups: [],
      pairs: [
        { left: 0, right: 1, ratio: 0.3 },
        { left: 2, right: 3, ratio: 0.5 },
      ],
    }
    const r = restore(old)
    expect(splitOps(r)).toEqual([
      [{ left: 1, right: 2, ratio: 0.3, dir: 'row' }],
      [{ left: 3, right: 4, ratio: 0.5, dir: 'row' }],
    ])
  })
})
