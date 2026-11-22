import { expect, describe as group, test } from 'bun:test'
import { charge, describe, litSegments, moodOf, resetsIn, tightest } from './usage'

const now = 1_000_000_000_000
const H = 3_600_000

group('charge', () => {
  test('inverte o uso e limita a 0..100', () => {
    expect(charge({ usedPct: 23.4, resetsAt: null }, now)).toBe(77)
    expect(charge({ usedPct: 130, resetsAt: null }, now)).toBe(0)
    expect(charge(null, now)).toBeNull()
  })
  test('janela que já recomeçou volta cheia', () => {
    expect(charge({ usedPct: 90, resetsAt: now - 1 }, now)).toBe(100)
  })
})

group('tightest', () => {
  test('pega o limite mais apertado', () => {
    const u = {
      fiveHour: { usedPct: 10, resetsAt: null },
      sevenDay: { usedPct: 70, resetsAt: null },
      updatedAt: 1,
      tracking: true,
    }
    expect(tightest(u, now)).toEqual({ level: 30, which: 'semana' })
    expect(tightest({ ...u, sevenDay: null }, now)).toEqual({ level: 90, which: '5h' })
    expect(tightest({ ...u, fiveHour: null, sevenDay: null }, now)).toBeNull()
  })
})

test('humor e segmentos', () => {
  expect(moodOf(null)).toBe('unknown')
  expect(moodOf(3)).toBe('empty')
  expect(moodOf(20)).toBe('tired')
  expect(moodOf(50)).toBe('ok')
  expect(moodOf(90)).toBe('happy')
  expect(litSegments(0)).toBe(0)
  expect(litSegments(2)).toBe(1)
  expect(litSegments(100)).toBe(5)
})

test('textos', () => {
  expect(resetsIn(now + 40 * 60000, now)).toBe('em 40 min')
  expect(resetsIn(now + 2 * H + 15 * 60000, now)).toBe('em 2 h 15 min')
  expect(resetsIn(now + 3 * H, now)).toBe('em 3 h')
  expect(resetsIn(now + 26 * H, now)).toBe('em 1 dia')
  expect(describe('5 h', { usedPct: 23, resetsAt: now + 2 * H }, now)).toBe('5 h: 77% livre · recomeça em 2 h')
  expect(describe('Semana', null, now)).toBe('Semana: sem dados')
})
