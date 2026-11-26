import { describe, expect, test } from 'bun:test'
import {
  classifyLine,
  compileRules,
  diffLine,
  findCustom,
  findLinks,
  findTokens,
  findTriggers,
  isValidRulePattern,
  TRIGGER_INTERVAL_MS,
  triggerGate,
} from './matchers'

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

  test('erros do rustc, da pilha do Node e do Biome', () => {
    expect(findLinks('  --> src-tauri/src/lib.rs:552:8')[0]).toMatchObject({
      path: 'src-tauri/src/lib.rs',
      line: 552,
      column: 8,
    })
    expect(findLinks(String.raw`    at Object.<anonymous> (D:\x\y.js:5:10)`)[0]).toMatchObject({
      path: String.raw`D:\x\y.js`,
      line: 5,
      column: 10,
    })
    expect(findLinks('./src/App.tsx:3:1 lint/style/useConst')[0]).toMatchObject({
      path: './src/App.tsx',
      line: 3,
      column: 1,
    })
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

describe('findTokens', () => {
  const all = { logLevels: true, timestamps: true, uuids: true }
  const show = (line: string, on = all) => findTokens(line, on).map((t) => `${t.kind}:${line.slice(t.start, t.end)}`)

  test('níveis de log em maiúsculas e entre colchetes', () => {
    expect(show('2026-11-22T14:05:09Z INFO servidor pronto')).toEqual([
      'timestamp:2026-11-22T14:05:09Z',
      'level-info:INFO',
    ])
    expect(show('[warn] cache frio; [Error] falhou')).toEqual(['level-warning:[warn]', 'level-error:[Error]'])
    expect(show('FATAL e DEBUG e TRACE')).toEqual(['level-error:FATAL', 'level-debug:DEBUG', 'level-debug:TRACE'])
  })

  test('palavras comuns em minúsculas não viram nível', () => {
    expect(show('more info about the error here')).toEqual([])
    expect(show('INFORMATION e ERRORS não contam')).toEqual([])
  })

  test('datas, horas e UUID', () => {
    expect(show('em 22/11/2026 14:05 às 09:30:01.5')).toEqual(['timestamp:22/11/2026 14:05', 'timestamp:09:30:01.5'])
    expect(show('id 3f2b8c1e-9a4d-4e7f-b1c2-0d9e8f7a6b5c ok')).toEqual(['uuid:3f2b8c1e-9a4d-4e7f-b1c2-0d9e8f7a6b5c'])
  })

  test('respeita as opções desligadas', () => {
    expect(show('INFO 10:00:00', { logLevels: false, timestamps: true, uuids: true })).toEqual(['timestamp:10:00:00'])
    expect(show('INFO 10:00:00', { logLevels: true, timestamps: false, uuids: false })).toEqual(['level-info:INFO'])
  })

  test('localhost:porta e versões não viram hora', () => {
    expect(show('localhost:3000 v1.2.3 12:34')).toEqual([])
  })
})

describe('diffLine', () => {
  const run = (lines: string[]) => {
    let inDiff = false
    return lines.map((l) => {
      const r = diffLine(l, inDiff)
      inDiff = r.inDiff
      return r.kind
    })
  }

  test('marca + e - só dentro de um diff', () => {
    expect(
      run([
        '- item de lista',
        'diff --git a/x.ts b/x.ts',
        '--- a/x.ts',
        '+++ b/x.ts',
        '@@ -1,2 +1,2 @@',
        ' contexto',
        '-velho',
        '+novo',
        'PS C:> ',
        '- outra lista',
      ]),
    ).toEqual([null, null, null, null, 'hunk', null, 'removed', 'added', null, null])
  })
})

test('gatilhos: só regras com avisar/marcar, mesmo com o trecho pintado por outra', () => {
  const rules = compileRules([
    { pattern: 'ready', color: '#00ff00' },
    { pattern: 'ready on', color: '#ff0000', notify: true },
    { pattern: 'FAIL', color: '#ff0000', mark: true },
  ])
  expect(findTriggers('  ready on localhost:5173 ', rules)).toEqual([
    { pattern: 'ready on', notify: true, mark: false, line: 'ready on localhost:5173' },
  ])
  expect(findTriggers('2 FAIL, 3 ok', rules).map((t) => t.pattern)).toEqual(['FAIL'])
  expect(findTriggers('nada aqui', rules)).toEqual([])
  // A regex é global: testar duas vezes seguidas dá o mesmo resultado.
  expect(findTriggers('FAIL', rules)).toHaveLength(1)
  expect(findTriggers('FAIL', rules)).toHaveLength(1)
})

test('gatilhos: um disparo por regra a cada 5 s', () => {
  let t = 0
  const gate = triggerGate(() => t)
  expect(gate('a')).toBe(true)
  expect(gate('a')).toBe(false)
  expect(gate('b')).toBe(true)
  t = TRIGGER_INTERVAL_MS
  expect(gate('a')).toBe(true)
})
