import { describe, expect, test } from 'bun:test'
import { completeCommand } from './complete'
import { cargo } from './specs/cargo'
import { docker } from './specs/docker'
import { git } from './specs/git'
import { bun, npm } from './specs/node'
import type { Command } from './specs/types'
import { winget } from './specs/winget'

const scripts = [
  { name: 'dev', command: 'vite' },
  { name: 'build:web', command: 'vite build' },
]

const values = (line: string, caret = line.length) =>
  completeCommand(line, caret, scripts)?.items.map((i) => i.value) ?? null

describe('completeCommand', () => {
  test('subcomandos pelo prefixo e a posição da palavra', () => {
    expect(values('git sta')).toEqual(['status', 'stash'])
    expect(completeCommand('git sta', 7)?.start).toBe(4)
    expect(values('git ')).toContain('commit')
    expect(values('git stash p')).toEqual(['push', 'pop'])
    expect(values('docker compose u')).toEqual(['up'])
    expect(values('cargo cl')).toEqual(['clippy', 'clean'])
    expect(values('winget.exe up')).toEqual(['upgrade'])
  })

  test('flags do subcomando, sem repetir as usadas', () => {
    expect(values('git commit --am')).toEqual(['--amend'])
    expect(values('git commit --amend --am')).toBeNull()
    expect(values('git commit -a -')).not.toContain('--all')
    expect(values('git -C ../x push --force-')).toEqual(['--force-with-lease'])
    expect(values('npm i --save-')).toEqual(['--save-dev', '--save-exact'])
  })

  test('scripts do package.json em bun run e npm run', () => {
    expect(values('bun run ')).toEqual(['dev', 'build:web'])
    expect(values('npm run bui')).toEqual(['build:web'])
    expect(values('bun de')).toEqual(['dev'])
    expect(values('npm de')).toBeNull()
    expect(completeCommand('bun run ', 8, [])).toBeNull()
  })

  test('vale o comando em que o cursor está', () => {
    expect(values('cd x; git sw')).toEqual(['switch'])
    expect(values('git log | docker p')).toEqual(['ps', 'pull', 'push'])
    expect(values('ls\ngit reb')).toEqual(['rebase'])
    expect(values('echo "a; git sw')).toBeNull()
    expect(values('git sta && ls', 7)).toEqual(['status', 'stash'])
  })

  test('sem sugestão: comando desconhecido, valor de flag, argumento livre ou depois de --', () => {
    expect(values('git')).toBeNull()
    expect(values('foo ba')).toBeNull()
    expect(values('git commit -m ')).toBeNull()
    expect(values('git add src/')).toBeNull()
    expect(values('git switch main x')).toBeNull()
    expect(values('bun run dev -- --wat')).toBeNull()
    expect(values('git status')).toBeNull()
  })

  test('specs sem nomes repetidos e flags bem formadas', () => {
    const check = (c: Command, path: string) => {
      const subs = c.subcommands?.map((s) => s.name) ?? []
      expect([path, subs]).toEqual([path, [...new Set(subs)]])
      const flags = c.flags?.flatMap((f) => f.names) ?? []
      expect([path, flags]).toEqual([path, [...new Set(flags)]])
      for (const f of flags) expect([path, f.startsWith('-')]).toEqual([path, true])
      for (const s of c.subcommands ?? []) check(s, `${path} ${s.name}`)
    }
    for (const c of [git, bun, npm, cargo, winget, docker]) check(c, c.name)
  })
})
