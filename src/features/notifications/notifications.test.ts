import { describe, expect, test } from 'bun:test'
import type { NotificationSettings } from '../../shared/types'
import { agentNotice, commandNotice, formatSeconds } from './notifications'

const on: NotificationSettings = { enabled: true, claude: true, commands: true, commandSecs: 30 }

describe('agentNotice', () => {
  test('avisa ao terminar ou pedir permissão com a janela sem foco', () => {
    expect(agentNotice('working', 'done', 'api', on, false)?.title).toBe('Claude terminou')
    expect(agentNotice('working', 'blocked', 'api', on, false)?.body).toContain('api')
  })
  test('não avisa com a janela na frente, desligado, repetido ou em outros estados', () => {
    expect(agentNotice('working', 'done', 'api', on, true)).toBeNull()
    expect(agentNotice('working', 'done', 'api', { ...on, claude: false }, false)).toBeNull()
    expect(agentNotice('working', 'done', 'api', { ...on, enabled: false }, false)).toBeNull()
    expect(agentNotice('done', 'done', 'api', on, false)).toBeNull()
    expect(agentNotice('done', 'waiting', 'api', on, false)).toBeNull()
    expect(agentNotice('idle', 'working', 'api', on, false)).toBeNull()
  })
  test('sem título usa Claude Code', () => {
    expect(agentNotice(undefined, 'done', '  ', on, false)?.body).toStartWith('Claude Code')
  })
})

describe('commandNotice', () => {
  const cmd = { command: 'bun run build', exitCode: 0, durationMs: 45_000 }
  test('avisa comando longo, com o código quando falha', () => {
    expect(commandNotice(cmd, on, false)).toEqual({ title: 'Comando concluído', body: 'bun run build · 45 s' })
    expect(commandNotice({ ...cmd, exitCode: 2 }, on, false)?.title).toBe('Comando falhou (código 2)')
  })
  test('ignora comando curto, vazio, janela na frente e desligado', () => {
    expect(commandNotice({ ...cmd, durationMs: 29_999 }, on, false)).toBeNull()
    expect(commandNotice({ ...cmd, command: ' ' }, on, false)).toBeNull()
    expect(commandNotice(cmd, on, true)).toBeNull()
    expect(commandNotice(cmd, { ...on, commands: false }, false)).toBeNull()
  })
})

test('formatSeconds', () => {
  expect(formatSeconds(5_400)).toBe('5 s')
  expect(formatSeconds(120_000)).toBe('2 min')
  expect(formatSeconds(125_000)).toBe('2 min 5 s')
  expect(formatSeconds(3_900_000)).toBe('1 h 5 min')
})
