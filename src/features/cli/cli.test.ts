import { describe, expect, test } from 'bun:test'
import { type CliTab, formatTabs, resolveTab } from './cli'

const tabs: CliTab[] = [
  { key: 1, kind: 'shell', title: 'pwsh', label: null, profile: 'p', cwd: 'D:\\x' },
  { key: 12, kind: 'claude', title: 'Claude Code', label: null, profile: 'p', cwd: null },
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

describe('resolveTab', () => {
  const named: CliTab[] = [
    { key: 1, kind: 'shell', title: 'API: bun dev', label: 'API: bun dev', profile: 'p', cwd: null },
    { key: 2, kind: 'shell', title: 'Migração', label: 'Migração', profile: 'p', cwd: null },
    { key: 3, kind: 'claude', title: 'API: testes', label: 'API: testes', profile: 'p', cwd: null },
  ]

  test('número, com ou sem #', () => {
    expect(resolveTab(named, '2')).toEqual({ key: 2 })
    expect(resolveTab(named, '#3')).toEqual({ key: 3 })
    expect(resolveTab(named, '9')).toEqual({ error: 'aba 9 não existe (veja termo tabs)' })
  })

  test('nome igual sem caixa nem acento, ou contido se for único', () => {
    expect(resolveTab(named, 'migracao')).toEqual({ key: 2 })
    expect(resolveTab(named, 'testes')).toEqual({ key: 3 })
  })

  test('nome que serve para várias abas é erro', () => {
    expect(resolveTab(named, 'api')).toEqual({ error: '"api" serve para várias abas (1, 3); use o número' })
    expect('error' in resolveTab(named, 'deploy')).toBe(true)
  })
})
