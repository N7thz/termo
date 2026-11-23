import { describe, expect, test } from 'bun:test'
import { fuzzyMatch, rank } from './fuzzy'

describe('fuzzyMatch', () => {
  test('letras fora de ordem não combinam', () => {
    expect(fuzzyMatch('tg', 'git')).toBeNull()
    expect(fuzzyMatch('xyz', 'git status')).toBeNull()
  })

  test('busca vazia combina com tudo', () => {
    expect(fuzzyMatch('', 'qualquer coisa')).toEqual({ score: 0, positions: [] })
  })

  test('sem diferenciar maiúsculas e devolve as posições', () => {
    const m = fuzzyMatch('GST', 'git status')
    expect(m).not.toBeNull()
    expect(m?.positions.map((p) => 'git status'[p])).toEqual(['g', 's', 't'])
  })

  test('substring contínua vale mais que letras espalhadas', () => {
    const solid = fuzzyMatch('stat', 'git status')
    const spread = fuzzyMatch('stat', 'sudo tar -x -t')
    expect(solid && spread && solid.score > spread.score).toBe(true)
  })

  test('começo de palavra vale mais que meio de palavra', () => {
    const start = fuzzyMatch('lo', 'git log')
    const mid = fuzzyMatch('lo', 'git blog')
    expect(start && mid && start.score > mid.score).toBe(true)
  })

  test('espaços da busca são ignorados', () => {
    expect(fuzzyMatch('git st', 'git status')).not.toBeNull()
    expect(fuzzyMatch('gitst', 'git status')).not.toBeNull()
  })
})

describe('rank', () => {
  const cmds = ['git status', 'git stash pop', 'ls -la', 'bun run check', 'cargo test']

  test('filtra e ordena pela pontuação', () => {
    const out = rank(cmds, 'stat', (c) => c).map((r) => r.item)
    expect(out[0]).toBe('git status')
    expect(out).not.toContain('ls -la')
  })

  test('empate mantém a ordem original (mais recente primeiro)', () => {
    const out = rank(['npm run a', 'npm run b'], 'npm run', (c) => c).map((r) => r.item)
    expect(out).toEqual(['npm run a', 'npm run b'])
  })

  test('sem busca devolve tudo, respeitando o limite', () => {
    expect(rank(cmds, '  ', (c) => c)).toHaveLength(5)
    expect(rank(cmds, '', (c) => c, 2)).toHaveLength(2)
  })

  test('letras espalhadas: "cgt" acha "cargo test"', () => {
    expect(rank(cmds, 'cgot', (c) => c).map((r) => r.item)).toEqual(['cargo test'])
  })
})
