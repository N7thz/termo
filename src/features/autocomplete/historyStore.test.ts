import { describe, expect, test } from 'bun:test'
import { loadCommands, MAX_STORED, nextWord, rememberCommand, suggest } from './historyStore'

function memory() {
  const data = new Map<string, string>()
  return {
    getItem: (k: string) => data.get(k) ?? null,
    setItem: (k: string, v: string) => void data.set(k, v),
  }
}

describe('histórico guardado', () => {
  test('acrescenta sem repetir o par comando + pasta e persiste', () => {
    const store = memory()
    rememberCommand('git status', 'D:\\a', store)
    rememberCommand('ls', 'D:\\a', store)
    rememberCommand('  git status ', 'd:/a/', store)
    rememberCommand('git status', 'D:\\b', store)
    expect(loadCommands(store).map((e) => `${e.command}|${e.cwd}`)).toEqual([
      'ls|d:\\a',
      'git status|d:\\a',
      'git status|d:\\b',
    ])
  })

  test('não guarda vazio, enorme nem linha com cara de segredo', () => {
    const store = memory()
    for (const command of [
      '   ',
      'x'.repeat(501),
      '$env:GITHUB_TOKEN = "abc"',
      'curl -H "Authorization: Bearer abc" x',
      'git clone https://user:senha@host/repo',
    ])
      rememberCommand(command, 'D:\\a', store)
    expect(loadCommands(store)).toEqual([])
  })

  test('respeita o limite e aguenta conteúdo quebrado', () => {
    const store = memory()
    store.setItem(
      'termo.commandHistory',
      JSON.stringify(Array.from({ length: MAX_STORED }, (_, i) => ({ command: `c${i}`, cwd: null }))),
    )
    rememberCommand('novo', null, store)
    const list = loadCommands(store)
    expect(list.length).toBe(MAX_STORED)
    expect(list[0]?.command).toBe('c1')
    expect(list.at(-1)?.command).toBe('novo')
    store.setItem('termo.commandHistory', '{quebrado')
    expect(loadCommands(store)).toEqual([])
  })
})

describe('suggest', () => {
  const stored = [
    { command: 'bun run check', cwd: 'd:\\a' },
    { command: 'bun run dev', cwd: 'd:\\b' },
  ]

  test('prefere a pasta atual, depois qualquer pasta, depois o PSReadLine', () => {
    expect(suggest('bun run ', 'D:\\a', stored)).toBe('check')
    expect(suggest('bun run ', 'D:\\outra', stored)).toBe('dev')
    expect(suggest('git p', 'D:\\a', stored, ['git pull --rebase', 'git push'])).toBe('ull --rebase')
  })

  test('sem sugestão para linha vazia, pedido em linguagem natural ou comando completo', () => {
    expect(suggest('', 'D:\\a', stored)).toBe('')
    expect(suggest('# listar', null, [], ['# listar tudo'])).toBe('')
    expect(suggest('bun run dev', 'D:\\b', stored)).toBe('')
  })

  test('nextWord pega os espaços e a palavra seguinte', () => {
    expect(nextWord(' run check')).toBe(' run')
    expect(nextWord('heck --fix')).toBe('heck')
  })
})
