import { expect, test } from 'bun:test'
import { familyOf, modeLabel, modeOf, resolveDefaultShell } from './modes'

const shells = [
  { id: 'pwsh', label: 'PowerShell 7', family: 'pwsh' as const },
  { id: 'cmd', label: 'Prompt de Comando', family: 'cmd' as const },
]

test('familyOf reconhece os ids de shell', () => {
  expect(familyOf('pwsh')).toBe('pwsh')
  expect(familyOf('powershell')).toBe('powershell')
  expect(familyOf('cmd')).toBe('cmd')
  expect(familyOf('wsl')).toBe('wsl')
  expect(familyOf('wsl:Ubuntu-22.04')).toBe('wsl')
  expect(familyOf('bash')).toBe('bash')
  expect(familyOf('zsh')).toBeNull()
})

test('modeOf: Claude, shell da aba, padrão e PowerShell 7 por último', () => {
  expect(modeOf('claude', 'cmd')).toBe('claude')
  expect(modeOf('shell', 'wsl:Debian')).toBe('wsl')
  expect(modeOf('shell', undefined, 'cmd')).toBe('cmd')
  expect(modeOf('shell')).toBe('pwsh')
  expect(modeOf('shell', 'auto')).toBe('pwsh')
})

test('resolveDefaultShell: auto é o primeiro detectado', () => {
  expect(resolveDefaultShell('auto', shells)).toBe('pwsh')
  expect(resolveDefaultShell('auto', [])).toBe('pwsh')
  expect(resolveDefaultShell('cmd', shells)).toBe('cmd')
})

test('modeLabel mostra a distro do WSL', () => {
  expect(modeLabel('shell', 'wsl:Ubuntu')).toBe('Ubuntu (WSL)')
  expect(modeLabel('shell', 'wsl')).toBe('WSL')
  expect(modeLabel('shell', 'cmd')).toBe('Prompt de Comando')
  expect(modeLabel('shell', 'bash')).toBe('Git Bash')
  expect(modeLabel('claude')).toBe('Claude Code')
})
