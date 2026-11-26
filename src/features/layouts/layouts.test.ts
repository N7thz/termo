import { describe, expect, test } from 'bun:test'
import { toOps } from '../tabs/splitTree'
import { initialTabs, type TabsAction, type TabsState, tabsReducer, visibleTabs } from '../tabs/tabs'
import {
  captureLayout,
  deleteLayout,
  layoutCommands,
  MAX_LAYOUTS,
  openLayoutAction,
  renameLayout,
  saveLayout,
  validateCommand,
  validateLayoutName,
} from './layouts'

const run = (...actions: TabsAction[]) => actions.reduce<TabsState>(tabsReducer, { ...initialTabs, profile: 'p' })
const open = (title: string, extra: object = {}): TabsAction => ({ type: 'open', kind: 'shell', title, ...extra })

function sample() {
  return run(
    open('web', { cwd: 'D:/web', shell: 'cmd' }),
    open('api'),
    { type: 'open', kind: 'claude', title: 'Claude Code' },
    { type: 'group-create', key: 2, name: 'Back' },
    { type: 'split', key: 1, with: 3 },
    { type: 'split-ratio', key: 1, path: '', ratio: 0.6 },
  )
}

describe('captureLayout', () => {
  test('guarda abas na ordem da tela, grupos, divisões, pasta e comando', () => {
    const state = sample()
    const layout = captureLayout(
      state,
      ' Dev ',
      (t) => (t.key === 1 ? 'D:/web/src' : undefined),
      (t) => (t.key === 1 ? ' bun run dev ' : 'x'),
    )
    expect(layout.name).toBe('Dev')
    expect(layout.groups).toEqual(['Back'])
    // A aba do grupo vem primeiro na ordem da tela: api, web, Claude.
    expect(layout.tabs.map((t) => t.title)).toEqual(['api', 'web', 'Claude Code'])
    expect(layout.tabs[0].group).toBe(0)
    expect(layout.tabs[1]).toMatchObject({ shell: 'cmd', cwd: 'D:/web/src', command: 'bun run dev', group: null })
    // Claude: sem shell nem comando.
    expect(layout.tabs[2]).toMatchObject({ kind: 'claude', shell: '', command: '' })
    expect(layout.splits).toEqual([{ left: 1, right: 2, ratio: 0.6, dir: 'row' }])
  })

  test('aba SSH não guarda comando; abas de outro perfil ficam de fora', () => {
    const state = run(open('b', { profile: 'outro' }), open('a', { profile: 'p', shell: 'ssh:web-1' }))
    const layout = captureLayout(
      state,
      'x',
      () => undefined,
      () => 'ls',
    )
    expect(layout.tabs).toHaveLength(1)
    expect(layout.tabs[0]).toMatchObject({ shell: 'ssh:web-1', command: '' })
  })

  test('no máximo 16 abas', () => {
    const state = run(...Array.from({ length: 20 }, (_, i) => open(`t${i}`)))
    expect(captureLayout(state, 'x', () => undefined).tabs).toHaveLength(16)
  })
})

describe('abrir um layout', () => {
  test('recria abas, grupos e divisões com chaves novas e ativa a primeira', () => {
    const layout = captureLayout(
      sample(),
      'Dev',
      () => undefined,
      (t) => (t.title === 'web' ? 'bun run dev' : ''),
    )
    const base = run(open('antiga'))
    const next = tabsReducer(base, openLayoutAction(layout))
    expect(next.tabs.map((t) => t.title)).toEqual(['antiga', 'api', 'web', 'Claude Code'])
    expect(next.active).toBe(2)
    expect(next.groups).toHaveLength(1)
    expect(next.tabs[1].group).toBe(next.groups[0].id)
    expect(next.splits.map((l) => toOps(l.root))).toEqual([[{ left: 3, right: 4, ratio: 0.6, dir: 'row' }]])
    expect(next.tabs[2].shell).toBe('cmd')
    expect(visibleTabs(next)).toHaveLength(4)
    expect([...layoutCommands(layout, base.nextKey)]).toEqual([[3, 'bun run dev']])
  })

  test('abrir duas vezes não repete ids de grupo nem chaves', () => {
    const layout = captureLayout(sample(), 'Dev', () => undefined)
    let s = tabsReducer(initialTabs, openLayoutAction(layout))
    s = tabsReducer(s, openLayoutAction(layout))
    expect(new Set(s.tabs.map((t) => t.key)).size).toBe(6)
    expect(new Set(s.groups.map((g) => g.id)).size).toBe(2)
  })

  test('shell inválido é ignorado e divisão fora da lista também', () => {
    const next = tabsReducer(initialTabs, {
      type: 'open-layout',
      groups: [],
      tabs: [{ kind: 'shell', title: 'a', shell: 'zsh; rm' }],
      splits: [{ left: 0, right: 5, ratio: 0.5 }],
    })
    expect(next.tabs[0].shell).toBeUndefined()
    expect(next.splits).toEqual([])
  })
})

describe('lista de layouts', () => {
  const mk = (name: string) => captureLayout(run(open('a')), name, () => undefined)

  test('salvar com o mesmo nome substitui; lista cheia recusa', () => {
    const one = saveLayout([], mk('Dev')) ?? []
    expect(saveLayout(one, mk('dev'))).toHaveLength(1)
    const full = Array.from({ length: MAX_LAYOUTS }, (_, i) => mk(`l${i}`))
    expect(saveLayout(full, mk('novo'))).toBeNull()
    expect(saveLayout(full, mk('L1'))).toHaveLength(MAX_LAYOUTS)
  })

  test('renomear, excluir e validar nomes', () => {
    const list = [mk('a'), mk('b')]
    expect(renameLayout(list, 1, ' c ').map((l) => l.name)).toEqual(['a', 'c'])
    expect(deleteLayout(list, 0).map((l) => l.name)).toEqual(['b'])
    expect(validateLayoutName(list, '')).not.toBeNull()
    expect(validateLayoutName(list, 'A')).not.toBeNull()
    expect(validateLayoutName(list, 'A', 0)).toBeNull()
    expect(validateLayoutName(list, 'x'.repeat(61))).not.toBeNull()
  })

  test('comando de uma linha', () => {
    expect(validateCommand('bun run dev')).toBeNull()
    expect(validateCommand('a\nb')).not.toBeNull()
    expect(validateCommand('x'.repeat(501))).not.toBeNull()
  })
})
