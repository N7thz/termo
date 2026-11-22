import { describe, expect, test } from 'bun:test'
import { afterSeen, needsAttention, withAgentState } from './agentState'

describe('estado do Claude por aba', () => {
  test('off tira a aba do mapa', () => {
    const a = withAgentState(new Map(), 1, 'working')
    expect(a.get(1)).toBe('working')
    const b = withAgentState(a, 1, 'off')
    expect(b.has(1)).toBe(false)
    expect(a.get(1)).toBe('working')
  })

  test('ver a aba só limpa o "terminou"', () => {
    expect(afterSeen('done')).toBe('idle')
    expect(afterSeen('blocked')).toBe('blocked')
    expect(afterSeen(undefined)).toBeUndefined()
  })

  test('pedem atenção: permissão, espera e fim', () => {
    expect(needsAttention('blocked')).toBe(true)
    expect(needsAttention('done')).toBe(true)
    expect(needsAttention('working')).toBe(false)
    expect(needsAttention(undefined)).toBe(false)
  })
})
