import { describe, expect, test } from 'bun:test'
import { extractQuery } from './query'

describe('extractQuery', () => {
  test('cd e sinônimos devolvem o argumento', () => {
    expect(extractQuery('cd pro')).toBe('pro')
    expect(extractQuery('cd ../ap')).toBe('../ap')
    expect(extractQuery('Set-Location src')).toBe('src')
    expect(extractQuery('CD Docs')).toBe('Docs')
  })

  test('cd sozinho lista tudo', () => {
    expect(extractQuery('cd')).toBe('')
    expect(extractQuery('cd   ')).toBe('')
  })

  test('tira aspas do argumento', () => {
    expect(extractQuery("cd 'minha pa")).toBe('minha pa')
  })

  test('palavra solta ou caminho', () => {
    expect(extractQuery('pro')).toBe('pro')
    expect(extractQuery('../')).toBe('../')
    expect(extractQuery('p')).toBeNull()
  })

  test('sem sugestão para linha vazia ou outros comandos', () => {
    expect(extractQuery(null)).toBeNull()
    expect(extractQuery('')).toBeNull()
    expect(extractQuery('   ')).toBeNull()
    expect(extractQuery('git status')).toBeNull()
    expect(extractQuery('cdx')).toBe('cdx')
  })
})
