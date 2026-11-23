import { describe, expect, test } from 'bun:test'
import { mergeHistory, normalizeDir, oneLine, onlyHere, searchHistory } from './history'

describe('mergeHistory', () => {
  const session = [
    { command: 'cd src', cwd: 'D:\\proj' },
    { command: 'bun test', cwd: 'D:\\proj\\src' },
    { command: 'bun test', cwd: 'D:\\proj' },
  ]

  test('a sessão vem primeiro (mais recente antes) e o arquivo completa sem repetir', () => {
    const out = mergeHistory(session, ['git log', 'bun test', 'ls'])
    expect(out.map((e) => e.command)).toEqual(['bun test', 'cd src', 'git log', 'ls'])
    expect(out[0].fromSession).toBe(true)
    expect(out[2].fromSession).toBe(false)
  })

  test('guarda todas as pastas em que o comando rodou na sessão', () => {
    const out = mergeHistory(session, [])
    expect([...out[0].cwds].sort()).toEqual(['d:\\proj', 'd:\\proj\\src'])
  })
})

describe('filtro por pasta', () => {
  const entries = mergeHistory(
    [
      { command: 'a', cwd: 'D:\\proj\\' },
      { command: 'b', cwd: 'D:\\outra' },
    ],
    ['c'],
  )

  test('só os comandos da pasta atual, sem diferenciar barra, caixa ou barra final', () => {
    expect(onlyHere(entries, 'd:/PROJ').map((e) => e.command)).toEqual(['a'])
  })

  test('sem pasta ou sem registros, nada', () => {
    expect(onlyHere(entries, null)).toEqual([])
    expect(onlyHere(entries, 'D:\\vazia')).toEqual([])
  })

  test('searchHistory combina filtro e busca', () => {
    expect(searchHistory(entries, '', 'D:\\outra', true).map((r) => r.item.command)).toEqual(['b'])
    expect(searchHistory(entries, 'c', null, false).map((r) => r.item.command)).toEqual(['c'])
  })

  test('normalizeDir preserva a raiz do disco', () => {
    expect(normalizeDir('C:\\')).toBe('c:\\')
    expect(normalizeDir('C:\\Users\\')).toBe('c:\\users')
  })
})

test('oneLine junta comandos de várias linhas', () => {
  expect(oneLine('Get-ChildItem \n  -Recurse \n  -Force')).toBe('Get-ChildItem -Recurse -Force')
})
