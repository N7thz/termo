import { describe, expect, test } from 'bun:test'
import { quoteScript, runScriptCommand, sortScripts } from './scripts'

describe('scripts npm', () => {
  test('comando por gerenciador', () => {
    expect(runScriptCommand('npm', 'dev')).toBe('npm run dev')
    expect(runScriptCommand('bun', 'test:web')).toBe('bun run test:web')
    expect(runScriptCommand(null, 'build')).toBe('npm run build')
  })

  test('cita nomes estranhos conforme o shell', () => {
    expect(quoteScript("it's ok", 'pwsh')).toBe("'it''s ok'")
    expect(quoteScript("it's ok", 'bash')).toBe(`'it'\\''s ok'`)
    expect(quoteScript('a b', 'cmd')).toBe('"a b"')
    expect(quoteScript('a"b', 'cmd')).toBeNull()
    expect(quoteScript('a\nb', 'pwsh')).toBeNull()
    expect(quoteScript('$(rm)', 'pwsh')).toBe("'$(rm)'")
  })

  test('os mais usados primeiro, o resto na ordem do arquivo', () => {
    const list = ['format', 'build', 'zeta', 'dev', 'alpha'].map((name) => ({ name }))
    expect(sortScripts(list).map((s) => s.name)).toEqual(['dev', 'build', 'format', 'zeta', 'alpha'])
  })
})
