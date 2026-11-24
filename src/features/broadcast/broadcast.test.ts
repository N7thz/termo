import { describe, expect, test } from 'bun:test'
import { initialTabs, type TabsAction, type TabsState, tabsReducer } from '../tabs/tabs'
import { broadcastTargets, isTyped } from './broadcast'

const run = (...actions: TabsAction[]) => actions.reduce<TabsState>(tabsReducer, initialTabs)
const open = (kind: 'shell' | 'claude' = 'shell'): TabsAction => ({ type: 'open', kind, title: kind })

describe('broadcastTargets', () => {
  test('sem grupo nem divisão, ninguém recebe', () => {
    expect(broadcastTargets(run(open(), open()), 1)).toEqual([])
  })

  test('fora de grupo, vai para a outra metade da tela dividida', () => {
    const state = run(open(), open(), open(), { type: 'split', key: 1, with: 2 })
    expect(broadcastTargets(state, 1)).toEqual([2])
    expect(broadcastTargets(state, 2)).toEqual([1])
    expect(broadcastTargets(state, 3)).toEqual([])
  })

  test('em grupo, vai para as outras abas de shell do grupo (e não para o par de fora)', () => {
    const state = run(
      open(),
      open(),
      open('claude'),
      open(),
      { type: 'group-create', key: 1, name: 'g' },
      { type: 'set-group', key: 2, group: 'g1' },
      { type: 'set-group', key: 3, group: 'g1' },
      { type: 'split', key: 1, with: 4 },
    )
    expect(broadcastTargets(state, 1)).toEqual([2])
  })

  test('o Claude não manda nem recebe, mesmo aberto dentro de um shell', () => {
    const state = run(open('claude'), open(), { type: 'split', key: 1, with: 2 })
    expect(broadcastTargets(state, 1)).toEqual([])
    expect(broadcastTargets(state, 2)).toEqual([])
    const shells = run(open(), open(), { type: 'split', key: 1, with: 2 })
    expect(broadcastTargets(shells, 1, (t) => t.key === 2)).toEqual([])
  })
})

describe('isTyped', () => {
  test('teclado e colagem passam', () => {
    for (const data of ['a', '\r', '\x03', '\x1b', '\x1b[A', '\x1b[3~', '\x1bOP', '\x1b[200~ls\x1b[201~', '\x1bb'])
      expect(isTyped(data)).toBe(true)
  })

  test('respostas automáticas do terminal não', () => {
    for (const data of ['\x1b[12;40R', '\x1b[?1;2c', '\x1b[>0;276;0c', '\x1b[I', '\x1b[O', '\x1b[<0;3;4M', '\x1b[0n'])
      expect(isTyped(data)).toBe(false)
    expect(isTyped('\x1b]11;rgb:0000/0000/0000\x07')).toBe(false)
    expect(isTyped('')).toBe(false)
  })
})
