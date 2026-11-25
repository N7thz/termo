import { describe, expect, test } from 'bun:test'
import { type CliTab, formatTabs } from './cli'

const tabs: CliTab[] = [
  { key: 1, kind: 'shell', title: 'pwsh', profile: 'p', cwd: 'D:\\x' },
  { key: 12, kind: 'claude', title: 'Claude Code', profile: 'p', cwd: null },
]

describe('formatTabs', () => {
  test('tabela com a ativa marcada e colunas alinhadas', () => {
    expect(formatTabs(tabs, 12, false)).toBe(' 1   shell   pwsh         D:\\x\n*12  claude  Claude Code')
  })

  test('json com active', () => {
    const parsed = JSON.parse(formatTabs(tabs, 1, true))
    expect(parsed[0]).toEqual({ ...tabs[0], active: true })
    expect(parsed[1].active).toBe(false)
  })

  test('sem abas', () => {
    expect(formatTabs([], null, false)).toBe('nenhuma aba aberta')
    expect(formatTabs([], null, true)).toBe('[]')
  })
})
