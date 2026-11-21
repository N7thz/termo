import { describe, expect, test } from 'bun:test'
import { classifyLine, compileRules, findCustom, findLinks, isValidRulePattern } from './matchers'

const kinds = (line: string) => findLinks(line).map((m) => `${m.kind}:${m.text}`)

describe('findLinks: arquivos', () => {
  test('caminho com linha e coluna (TypeScript, Biome, Rust)', () => {
    const [m] = findLinks('src/App.tsx:42:10 - error TS2322')
    expect(m).toMatchObject({ kind: 'file', path: 'src/App.tsx', line: 42, column: 10, start: 0, end: 17 })
  })

  test('formato (linha,coluna) do tsc', () => {
    const [m] = findLinks('src/features/x.ts(12,5): error TS1005')
    expect(m).toMatchObject({ path: 'src/features/x.ts', line: 12, column: 5 })
  })

  test('caminho do Windows e relativo', () => {
    expect(findLinks(String.raw`  --> C:\proj\src\main.rs:7:3`)[0]).toMatchObject({
      path: String.raw`C:\proj\src\main.rs`,
      line: 7,
      column: 3,
    })
    expect(findLinks('veja ../docs/README.md')[0]).toMatchObject({ path: '../docs/README.md', line: undefined })
  })

  test('sem extensão conhecida não vira link', () => {
    expect(kinds('a/b c/d foo.bar1')).toEqual([])
  })

  test('não pega arquivo dentro de URL', () => {
    expect(kinds('https://github.com/x/y/blob/main/src/a.ts')).toEqual([])
  })
})

describe('findLinks: rede e hashes', () => {
  test('endereço com porta', () => {
    expect(kinds('Local: http://localhost:1420/ e 127.0.0.1:4747')).toEqual(['address:127.0.0.1:4747'])
    expect(kinds('ouvindo em localhost:3000')).toEqual(['address:localhost:3000'])
  })

  test('IP solto', () => {
    expect(kinds('gateway 192.168.0.1 ok')).toEqual(['ip:192.168.0.1'])
    expect(kinds('versão 1.2.3.4.5')).toEqual([])
  })

  test('hash do git', () => {
    expect(kinds('f54ff89 feat: um card por banco')).toEqual(['hash:f54ff89'])
    expect(kinds('commit 8520e9fa1b2c3d4e5f60718293a4b5c6d7e8f901')).toEqual([
      'hash:8520e9fa1b2c3d4e5f60718293a4b5c6d7e8f901',
    ])
  })

  test('números e palavras hex não são hash', () => {
    expect(kinds('1234567 deadbeef facade')).toEqual([])
  })
})

describe('classifyLine', () => {
  test('erros', () => {
    for (const l of ['error TS2322: Type', '✖ 3 problems', 'Test FAILED', "thread 'main' panicked", 'npm ERR! code 1'])
      expect(classifyLine(l)).toBe('error')
  })

  test('avisos', () => {
    for (const l of ['warning: unused variable', 'Aviso: pasta vazia', '⚠ deprecated API'])
      expect(classifyLine(l)).toBe('warning')
  })

  test('resumos sem problema não contam', () => {
    for (const l of ['Found 0 errors.', 'no warnings', 'sem erros', 'errors: 0', '0 fail', ''])
      expect(classifyLine(l)).toBeNull()
  })

  test('palavras parecidas não contam', () => {
    expect(classifyLine('errorHandler.ts compilado')).toBeNull()
    expect(classifyLine('error-boundary pronto')).toBeNull()
  })

  test('erro vence aviso', () => {
    expect(classifyLine('warning: x; error: y')).toBe('error')
  })
})

describe('regras próprias', () => {
  test('compila só as válidas', () => {
    const rules = compileRules([
      { pattern: 'TODO|FIXME', color: '#ffaa00' },
      { pattern: '(', color: '#ffffff' },
      { pattern: 'x', color: 'red' },
    ])
    expect(rules).toHaveLength(1)
  })

  test('acha trechos sem sobreposição', () => {
    const rules = compileRules([
      { pattern: 'TODO', color: '#ffaa00' },
      { pattern: 'TO', color: '#00ff00' },
    ])
    expect(findCustom('TODO e todo', rules)).toEqual([
      { start: 0, end: 4, color: '#ffaa00' },
      { start: 7, end: 11, color: '#ffaa00' },
    ])
  })

  test('isValidRulePattern', () => {
    expect(isValidRulePattern('ab+c')).toBe(true)
    expect(isValidRulePattern('[')).toBe(false)
    expect(isValidRulePattern('')).toBe(false)
  })
})
