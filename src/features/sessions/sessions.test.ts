import { describe, expect, test } from 'bun:test'
import {
  type AgentSession,
  ago,
  groupByProject,
  type HistoryEntry,
  historyProgress,
  progressLabel,
  projectName,
  statusOf,
} from './sessions'

const s = (over: Partial<AgentSession>): AgentSession => ({
  id: 'x',
  sessionId: 'x',
  nome: '',
  tipo: 'interactive',
  estado: 'idle',
  cwd: 'D:\\estudos\\termo',
  inicio: 0,
  plano: null,
  reservas: [],
  ...over,
})

describe('sessões', () => {
  test('statusOf traduz estados', () => {
    expect(statusOf({ estado: '', status: 'busy' })).toEqual({ label: 'trabalhando', tone: 'busy' })
    expect(statusOf({ estado: 'done' })).toEqual({ label: 'concluída', tone: 'done' })
    expect(statusOf({ estado: 'failed' }).tone).toBe('failed')
    expect(statusOf({ estado: '' }).tone).toBe('unknown')
  })

  test('progressLabel como no coord', () => {
    const base = { done: 2, total: 6, pct: 33, atual: null, elapsed: 0 }
    expect(progressLabel({ ...base, etaMs: 12 * 60000 })).toBe('2/6 etapas · termina em ~12 min')
    expect(progressLabel({ ...base, etaMs: null })).toBe('2/6 etapas · previsão após a 1ª etapa')
    expect(progressLabel({ ...base, etaMs: 0 })).toBe('2/6 etapas · passou da previsão')
    expect(progressLabel({ ...base, done: 6, etaMs: 0, elapsed: 7 * 60000 })).toBe('6/6 etapas · concluída em 7 min')
  })

  test('ago', () => {
    const now = 10_000_000
    expect(ago(now - 10_000, now)).toBe('agora')
    expect(ago(now - 5 * 60000, now)).toBe('há 5 min')
    expect(ago(now - 2 * 3600000, now)).toBe('há 2 h')
    expect(ago(null, now)).toBe('')
  })

  test('historyProgress calcula dos passos', () => {
    const h: HistoryEntry = {
      id: 'a',
      ended: 0,
      plan: {
        titulo: 'T',
        started: 1000,
        steps: [
          { t: 'a', done: 2000 },
          { t: 'b', done: null },
        ],
      },
    }
    expect(historyProgress(h)).toMatchObject({ done: 1, total: 2, pct: 50, atual: 'b', elapsed: 1000 })
  })

  test('agrupa por projeto com o atual primeiro e ordena por estado', () => {
    const groups = groupByProject(
      [
        s({ id: '1', cwd: 'D:\\outro', estado: 'done', inicio: 900 }),
        s({ id: '2', cwd: 'D:\\estudos\\termo\\', status: 'idle', inicio: 100 }),
        s({ id: '3', cwd: 'D:\\estudos\\termo', status: 'busy', inicio: 50 }),
      ],
      'd:\\estudos\\termo',
    )
    expect(groups.map((g) => g.name)).toEqual(['termo', 'outro'])
    expect(groups[0].current).toBe(true)
    expect(groups[0].sessions.map((x) => x.id)).toEqual(['3', '2'])
    expect(projectName('C:\\a\\b\\')).toBe('b')
  })
})
