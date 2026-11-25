import { describe, expect, test } from 'bun:test'
import {
  addItem,
  badgeText,
  coordNotices,
  dayLabel,
  groupByDay,
  type InboxItem,
  MAX_INBOX,
  markAllRead,
  markRead,
  parseInbox,
  pending,
  relativeTime,
  resolveBlocked,
  unreadCount,
} from './inbox'

const T = new Date(2026, 10, 25, 15, 0).getTime()

describe('central de avisos', () => {
  test('junta repetidos não lidos e corta no máximo', () => {
    const fail = { kind: 'command-failed' as const, title: 'pwsh', detail: 'bun test · 40 s', tabKey: 1 }
    let list = addItem([], fail, T)
    list = addItem(list, { kind: 'claude-done', title: 'Claude', detail: 'pronto', tabKey: 2 }, T + 1000)
    list = addItem(list, fail, T + 2000)
    expect(list.length).toBe(2)
    expect(list[0].count).toBe(2)
    expect(list[0].at).toBe(T + 2000)
    // Lido não junta mais.
    list = addItem(markRead(list, list[0].id), fail, T + 3000)
    expect(list.length).toBe(3)
    let many: InboxItem[] = []
    for (let i = 0; i < MAX_INBOX + 5; i++) many = addItem(many, { ...fail, detail: `c${i}` }, T + i)
    expect(many.length).toBe(MAX_INBOX)
    expect(many[0].detail).toBe(`c${MAX_INBOX + 4}`)
  })

  test('lidos, pendentes e contador', () => {
    let list = addItem([], { kind: 'claude-blocked', title: 'Claude', detail: 'permissão', tabKey: 3 }, T)
    list = addItem(list, { kind: 'claude-done', title: 'Claude', detail: 'pronto', tabKey: 4 }, T)
    expect(unreadCount(list)).toBe(2)
    expect(pending(list).length).toBe(1)
    expect(groupByDay(list, T)[0].items.map((x) => x.kind)).toEqual(['claude-done'])
    list = resolveBlocked(list, 3)
    expect(pending(list).length).toBe(0)
    expect(unreadCount(list)).toBe(1)
    expect(unreadCount(markAllRead(list))).toBe(0)
    expect(badgeText(0)).toBe('')
    expect(badgeText(7)).toBe('7')
    expect(badgeText(12)).toBe('9+')
  })

  test('dias e horas', () => {
    expect(dayLabel(T, T)).toBe('Hoje')
    expect(dayLabel(T - 86_400_000, T)).toBe('Ontem')
    expect(relativeTime(T - 20_000, T)).toBe('agora')
    expect(relativeTime(T - 5 * 60_000, T)).toBe('há 5 min')
    expect(relativeTime(T - 3 * 3_600_000, T)).toBe('há 3 h')
    const groups = groupByDay(
      [
        { id: 'a', kind: 'claude-done', title: 'x', detail: '', at: T, read: false, count: 1 },
        { id: 'b', kind: 'claude-done', title: 'y', detail: '', at: T - 86_400_000, read: true, count: 1 },
      ],
      T,
    )
    expect(groups.map((g) => g.label)).toEqual(['Hoje', 'Ontem'])
  })

  test('lê o histórico gravado com tolerância', () => {
    expect(parseInbox(null)).toEqual([])
    expect(parseInbox('{quebrado')).toEqual([])
    const ok = parseInbox(JSON.stringify([{ id: 'a', kind: 'claude-done', title: 't', detail: 'd', at: 1 }, { id: 2 }]))
    expect(ok.length).toBe(1)
    expect(ok[0]).toMatchObject({ read: false, count: 1 })
  })

  test('avisos das sessões do coord', () => {
    const s = (estado: string, done: number, tipo = 'interactive') => ({
      sessionId: 's1',
      nome: 'titulo-abas',
      tipo,
      estado,
      cwd: 'D:\\estudos\\termo',
      plano: { titulo: 'Título nas abas', done, total: 6 },
    })
    const first = coordNotices(null, [s('busy', 5)])
    expect(first.notices).toEqual([])
    const done = coordNotices(first.seen, [s('idle', 6)])
    expect(done.notices).toEqual([
      { kind: 'session-done', title: 'Título nas abas', detail: 'Concluiu as 6 etapas · termo', sessionId: 's1' },
    ])
    // Já avisado: não repete.
    expect(coordNotices(done.seen, [s('idle', 6)]).notices).toEqual([])
    const bg = coordNotices(new Map([['s1', { estado: 'running', planDone: false }]]), [s('failed', 0, 'background')])
    expect(bg.notices[0].kind).toBe('session-failed')
  })
})
