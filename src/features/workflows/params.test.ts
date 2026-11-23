import { describe, expect, test } from 'bun:test'
import { escapeValue, extractParams, fillTemplate, missingParams } from './params'

describe('extractParams', () => {
  test('nomes na ordem, sem repetição', () => {
    expect(extractParams('git log --author={{autor}} -n {{n}} # {{autor}}')).toEqual(['autor', 'n'])
  })

  test('aceita espaços dentro das chaves, acentos e hífen', () => {
    expect(extractParams('x {{ pasta-destino }} {{ação}}')).toEqual(['pasta-destino', 'ação'])
  })

  test('chaves que não são parâmetro ficam de fora', () => {
    // biome-ignore lint/suspicious/noTemplateCurlyInString: `${...}` do PowerShell, não template do JS
    expect(extractParams('${env:X} {a} {{}} {{1x}} { {a} }')).toEqual([])
  })
})

describe('missingParams', () => {
  test('campo vazio ou só com espaços impede rodar', () => {
    expect(missingParams('a {{x}} {{y}} {{z}}', { x: 'ok', y: '', z: '   ' })).toEqual(['y', 'z'])
    expect(missingParams('sem parâmetros', {})).toEqual([])
  })
})

describe('fillTemplate', () => {
  test('valor simples entra como está; o mesmo nome repetido usa o mesmo valor', () => {
    expect(fillTemplate('git log --author={{a}} && echo {{a}}', { a: 'joao' })).toBe(
      'git log --author=joao && echo joao',
    )
  })

  test('fora de aspas: tudo que não é palavra recebe crase', () => {
    expect(fillTemplate('echo {{v}}', { v: 'a b' })).toBe('echo a` b')
    expect(fillTemplate('echo {{v}}', { v: '$(calc)' })).toBe('echo `$`(calc`)')
    expect(fillTemplate('echo {{v}}', { v: 'a; b | c & d' })).toBe('echo a`;` b` `|` c` `&` d')
    expect(fillTemplate('echo {{v}}', { v: "it's" })).toBe("echo it`'s")
    expect(fillTemplate('echo {{v}}', { v: 'a`b' })).toBe('echo a``b')
  })

  test('aspas simples: só a aspa simples é dobrada', () => {
    expect(fillTemplate("echo '{{v}}'", { v: "it's $(calc) `x`" })).toBe("echo 'it''s $(calc) `x`'")
  })

  test('aspas duplas: crase, cifrão e aspas ganham crase', () => {
    expect(fillTemplate('echo "{{v}}"', { v: 'a "b" $x `c`' })).toBe('echo "a `"b`" `$x ``c``"')
  })

  test('aspas tipográficas contam como aspas', () => {
    expect(escapeValue('’', 'single')).toBe('’’')
    expect(escapeValue('“', 'double')).toBe('`“')
  })

  test('o contexto de aspas acompanha o comando, inclusive aspas escapadas', () => {
    // A aspa dobrada continua dentro da string; depois dela o parâmetro ainda está entre aspas simples.
    expect(fillTemplate("echo 'a''{{v}}'", { v: "'" })).toBe("echo 'a'''''")
    // Depois de fechar as aspas, volta ao contexto solto.
    expect(fillTemplate("echo 'x' {{v}}", { v: 'a b' })).toBe("echo 'x' a` b")
    // Crase escapa a aspa dupla dentro de aspas duplas.
    expect(fillTemplate('echo "a`"{{v}}"', { v: '$x' })).toBe('echo "a`"`$x"')
  })

  test('quebras de linha do valor viram espaço', () => {
    expect(escapeValue('a\nb', 'single')).toBe('a b')
    expect(escapeValue('a\r\nb', 'double')).toBe('a b')
  })

  test('valor vazio solto vira string vazia', () => {
    expect(fillTemplate('echo {{v}}', { v: '' })).toBe("echo ''")
  })
})

// Confere com um PowerShell de verdade que o valor chega literal, sem expansão nem execução.
const POWERSHELL = (() => {
  for (const exe of ['pwsh', 'powershell']) {
    try {
      const p = Bun.spawnSync([exe, '-NoProfile', '-Command', '1'])
      if (p.exitCode === 0) return exe
    } catch {
      // próximo
    }
  }
  return null
})()

const SEP = '<<fim>>'

function runPowerShell(exe: string, script: string): string {
  const encoded = Buffer.from(`[Console]::OutputEncoding=[Text.Encoding]::UTF8;${script}`, 'utf16le').toString('base64')
  const p = Bun.spawnSync([exe, '-NoProfile', '-NonInteractive', '-EncodedCommand', encoded])
  return new TextDecoder().decode(p.stdout).replace(/\r\n/g, '\n')
}

describe.skipIf(!POWERSHELL)('o PowerShell recebe o valor literal', () => {
  const values = [
    'simples',
    'com espaço',
    "aspa ' simples",
    'aspa " dupla',
    '$(Write-Output EXECUTOU)',
    '$env:USERNAME',
    '`n crase',
    'a; Write-Output EXECUTOU',
    'a | b & c',
    '<tag> {chave} (par) [col] @x #y',
    'ação, lição — “tipográfica” ‘simples’',
    '-rf',
  ]
  for (const context of ['bare', 'single', 'double'] as const) {
    const template = { bare: 'Write-Output {{v}}', single: "Write-Output '{{v}}'", double: 'Write-Output "{{v}}"' }[
      context
    ]
    test(`${context}: todos os valores chegam como estão`, () => {
      // Solto, um valor que começa com `-` é lido como parâmetro do comando: fica fora desta checagem.
      const list = values.filter((v) => !(context === 'bare' && v.startsWith('-')))
      // Um PowerShell para todos (abrir um por valor é lento); um separador entre as saídas.
      // Se algo executasse, haveria linha a mais ou o valor sairia expandido.
      const script = list.map((v) => `${fillTemplate(template, { v })}; Write-Output '${SEP}'`).join('\n')
      const out = runPowerShell(POWERSHELL as string, script)
      expect(out.split(`${SEP}\n`).map((s) => s.replace(/\n$/, ''))).toEqual([...list, ''])
    })
  }
})
