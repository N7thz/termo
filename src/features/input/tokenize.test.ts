import { describe, expect, test } from 'bun:test'
import { tokenize } from './tokenize'

const kinds = (s: string) =>
  tokenize(s)
    .filter((t) => t.type !== 'plain')
    .map((t) => `${t.type}:${t.text}`)

describe('tokenize', () => {
  test('linha vazia', () => {
    expect(tokenize('')).toEqual([])
  })
  test('sempre devolve o texto original', () => {
    for (const s of ['git log --oneline | sort', 'echo "a  b" # x', 'dir C:\\x\\y;  ls', 'a\nb', "'abre", '$']) {
      expect(
        tokenize(s)
          .map((t) => t.text)
          .join(''),
      ).toBe(s)
    }
  })
  test('comando, flag e pipe', () => {
    expect(kinds('Get-ChildItem -Recurse | Sort-Object -Name')).toEqual([
      'command:Get-ChildItem',
      'parameter:-Recurse',
      'operator:|',
      'command:Sort-Object',
      'parameter:-Name',
    ])
  })
  test('string com espaço fica inteira', () => {
    expect(kinds('echo "oi mundo" \'a b\'')).toEqual(['command:echo', 'string:"oi mundo"', "string:'a b'"])
  })
  test('string aberta vai até o fim', () => {
    expect(kinds('echo "abc')).toEqual(['command:echo', 'string:"abc'])
  })
  test('variável e número', () => {
    expect(kinds('$x = 42')).toEqual(['variable:$x', 'operator:=', 'number:42'])
    // biome-ignore lint/suspicious/noTemplateCurlyInString: é o `${...}` do PowerShell, não um template
    expect(kinds('echo ${a b} $env:PATH')).toEqual(['command:echo', 'variable:${a b}', 'variable:$env:PATH'])
  })
  test('comentário até o fim da linha', () => {
    expect(kinds('ls # lista tudo | isso')).toEqual(['command:ls', 'comment:# lista tudo | isso'])
  })
  test('caminho do Windows', () => {
    expect(kinds('cd C:\\x\\y')).toEqual(['command:cd', 'path:C:\\x\\y'])
    expect(kinds('ls .\\src')).toEqual(['command:ls', 'path:.\\src'])
  })
  test('comando depois de ; e &&', () => {
    expect(kinds('a; b && c')).toEqual(['command:a', 'operator:;', 'command:b', 'operator:&&', 'command:c'])
  })
  test('palavra-chave', () => {
    expect(kinds('if ($a) { ls }')).toEqual([
      'keyword:if',
      'operator:(',
      'variable:$a',
      'operator:)',
      'operator:{',
      'command:ls',
      'operator:}',
    ])
  })
  test('redirecionamento', () => {
    expect(kinds('ls > out.txt')).toEqual(['command:ls', 'operator:>'])
  })
})
