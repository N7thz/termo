import { describe, expect, test } from 'bun:test'
import {
  blocksForClaude,
  blocksToMarkdown,
  blocksToText,
  CLAUDE_MAX_OUTPUT,
  type ExportBlock,
  exportFileName,
} from './blockExport'

const ok: ExportBlock = { command: 'bun test', output: '3 pass', exitCode: 0, cwd: 'D:\\proj', durationMs: 1200 }
const fail: ExportBlock = {
  command: 'cargo build',
  output: 'error[E0308]',
  exitCode: 101,
  cwd: null,
  durationMs: 15_000,
}

describe('blocksToMarkdown', () => {
  test('comando, status com pasta e saída em blocos de código', () => {
    expect(blocksToMarkdown([ok])).toBe('```sh\nbun test\n```\n\n_ok em 1,2 s · D:\\proj_\n\n```text\n3 pass\n```')
  })
  test('vários blocos separados, falha com o código', () => {
    const md = blocksToMarkdown([ok, fail])
    expect(md).toContain('\n\n---\n\n')
    expect(md).toContain('_código 101 em 15 s_')
  })
  test('saída com crases não fecha a cerca antes da hora', () => {
    const md = blocksToMarkdown([{ ...ok, output: 'a ``` b' }])
    expect(md).toContain('````text\na ``` b\n````')
  })
  test('sem saída, sem bloco de texto', () => {
    expect(blocksToMarkdown([{ ...ok, output: '  ' }])).not.toContain('```text')
  })
})

test('blocksToText imita o terminal', () => {
  expect(blocksToText([ok, fail])).toBe(
    '$ bun test\n3 pass\n[ok em 1,2 s · D:\\proj]\n\n$ cargo build\nerror[E0308]\n[código 101 em 15 s]',
  )
})

describe('blocksForClaude', () => {
  test('introdução no singular e no plural, termina sem Enter mas com espaço para a pergunta', () => {
    expect(blocksForClaude([ok])).toStartWith('Saída deste comando no terminal:\n\n```sh')
    expect(blocksForClaude([ok, fail])).toStartWith('Saída destes 2 comandos no terminal:')
    expect(blocksForClaude([ok])).toEndWith('```\n\n')
  })
  test('corta a saída enorme pelo começo', () => {
    const text = blocksForClaude([{ ...ok, output: `${'x'.repeat(CLAUDE_MAX_OUTPUT)}FIM` }])
    expect(text).toContain('…\n')
    expect(text).toContain('FIM')
    expect(text.length).toBeLessThan(CLAUDE_MAX_OUTPUT + 200)
  })
})

test('exportFileName', () => {
  expect(exportFileName([ok], 'png')).toBe('bun-test.png')
  expect(exportFileName([{ ...ok, command: 'cat "C:\\a b\\c.txt" | grep x' }], 'txt')).toBe(
    'cat-C-a-b-c.txt-grep-x.txt',
  )
  expect(exportFileName([{ ...ok, command: '  ' }], 'md')).toBe('saida.md')
  expect(exportFileName([], 'txt')).toBe('saida.txt')
})
