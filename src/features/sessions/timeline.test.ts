import { expect, test } from 'bun:test'
import {
  counts,
  duration,
  effortLevel,
  filesOf,
  modelTier,
  openCommand,
  type StateResponse,
  timeline,
} from './sessions'

const M = 60_000

test('etapas com o tempo de cada uma e a atual', () => {
  const plan = {
    started: 0,
    steps: [
      { t: 'a', done: 5 * M },
      { t: 'b', done: 12 * M },
      { t: 'c', done: null },
      { t: 'd', done: null },
    ],
  }
  expect(timeline(plan, 20 * M)).toEqual([
    { t: 'a', state: 'done', at: 5 * M, took: 5 * M },
    { t: 'b', state: 'done', at: 12 * M, took: 7 * M },
    { t: 'c', state: 'current', at: null, took: 8 * M },
    { t: 'd', state: 'pending', at: null, took: null },
  ])
  // Sessão encerrada: nada fica "em andamento".
  expect(timeline(plan, 20 * M, 15 * M).map((s) => s.state)).toEqual(['done', 'done', 'pending', 'pending'])
})

test('duração', () => {
  expect(duration(10_000)).toBe('1 min')
  expect(duration(8 * M)).toBe('8 min')
  expect(duration(65 * M)).toBe('1 h 05 min')
})

test('modelo e esforço', () => {
  expect(modelTier('claude-opus-5-5')).toBe('opus')
  expect(modelTier('Sonnet')).toBe('sonnet')
  expect(modelTier('inherit')).toBeNull()
  expect(modelTier(null)).toBeNull()
  expect(modelTier('gpt-x')).toBe('outro')
  expect(effortLevel('high')).toBe(3)
  expect(effortLevel('max')).toBe(5)
  expect(effortLevel(undefined)).toBe(0)
})

test('arquivos da sessão, mais recentes primeiro', () => {
  const state: StateResponse = {
    now: 0,
    history: [],
    locks: {
      a: { session: 's1', display: 'D:\\x\\a.ts', since: 1 },
      b: { session: 's2', display: 'D:\\x\\b.ts', since: 2 },
      c: { session: 's1', display: 'D:\\x\\c.ts', since: 3 },
    },
    claims: { d: { session: 's1', display: 'D:\\x\\src', since: 1, dir: true } },
  }
  const f = filesOf(state, 's1')
  expect(f.editing.map((m) => m.display)).toEqual(['D:\\x\\c.ts', 'D:\\x\\a.ts'])
  expect(f.claims.map((m) => m.display)).toEqual(['D:\\x\\src'])
  expect(filesOf(null, 's1')).toEqual({ editing: [], claims: [] })
})

test('comando para abrir a sessão', () => {
  expect(openCommand({ tipo: 'background', id: 'abc123', sessionId: 'x' })).toBe('claude attach abc123')
  expect(openCommand({ tipo: 'interactive', id: 'x', sessionId: '1f2e-33' })).toBe('claude --resume 1f2e-33')
  expect(openCommand({ tipo: 'interactive', id: 'x', sessionId: 'a; rm -rf /' })).toBeNull()
  expect(openCommand({ tipo: 'interactive', id: 'x', sessionId: '' })).toBeNull()
})

test('contagem para o indicador', () => {
  const base = {
    id: '',
    sessionId: '',
    nome: '',
    tipo: 'interactive',
    cwd: '',
    inicio: null,
    plano: null,
    reservas: [],
  }
  expect(
    counts([
      { ...base, estado: 'busy' },
      { ...base, estado: 'running' },
      { ...base, estado: 'idle' },
      { ...base, estado: 'done' },
    ]),
  ).toEqual({ busy: 2, waiting: 1 })
})
