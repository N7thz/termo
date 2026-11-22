import { describe, expect, test } from 'bun:test'
import { installCommand, satisfies, switchCommand } from './commands'

describe('comandos do gerenciador', () => {
  test('trocar de versão', () => {
    expect(switchCommand('fnm', '20.11.0')).toBe('fnm use 20.11.0')
    expect(switchCommand('nvm', '20.11.0')).toBe('nvm use 20.11.0')
    expect(switchCommand('volta', '20.11.0')).toBe('volta install node@20.11.0')
  })

  test('instalar a LTS e a versão do projeto', () => {
    expect(installCommand('fnm', 'lts')).toBe('fnm install --lts; fnm use lts-latest')
    expect(installCommand('fnm', '18')).toBe('fnm use --install-if-missing 18')
    expect(installCommand('nvm', 'lts')).toBe('nvm install lts; nvm use lts')
  })
})

describe('satisfies', () => {
  test('compara por partes', () => {
    expect(satisfies('20.11.0', '20')).toBe(true)
    expect(satisfies('20.11.0', 'v20.11')).toBe(true)
    expect(satisfies('20.11.0', '20.1')).toBe(false)
    expect(satisfies('20.11.0', '2')).toBe(false)
    expect(satisfies('20.11.0', 'lts/*')).toBe(false)
  })
})
