import { expect, test } from 'bun:test'
import { compactCount, folderName, modeName, shortPath, tabLabel } from './format'

test('shortPath', () => {
  expect(shortPath('D:\\estudos\\termo\\src')).toBe('…\\termo\\src')
  expect(shortPath('D:\\estudos')).toBe('D:\\estudos')
  expect(shortPath('D:\\')).toBe('D:\\')
  expect(shortPath('/home/x/projeto/app', 1)).toBe('…/app')
  expect(shortPath(null)).toBe('')
})

test('folderName', () => {
  expect(folderName('D:\\estudos\\termo')).toBe('termo')
  expect(folderName('D:\\')).toBe('D:\\')
  expect(folderName('/a/b/')).toBe('b')
})

test('compactCount', () => {
  expect(compactCount(980)).toBe('980')
  expect(compactCount(2008)).toBe('2k')
  expect(compactCount(1250)).toBe('1.3k')
  expect(compactCount(12_400)).toBe('12k')
})

test('tabLabel troca o caminho do executável pelo nome do modo', () => {
  const sh = (title: string, shell?: string) => tabLabel({ kind: 'shell', title, shell }, 'Windows PowerShell')
  expect(sh('C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe', 'powershell')).toBe('Windows PowerShell')
  expect(sh('C:\\Program Files\\PowerShell\\7\\pwsh.exe', 'pwsh')).toBe('PowerShell 7')
  expect(sh('Administrador: C:\\WINDOWS\\system32\\cmd.exe', 'cmd')).toBe('Prompt de Comando')
  expect(sh('C:\\Program Files\\PowerShell\\7\\pwsh.exe')).toBe('Windows PowerShell')
  expect(sh('npm run dev', 'pwsh')).toBe('npm run dev')
  expect(sh('user@host: ~/projeto', 'wsl:Ubuntu')).toBe('user@host: ~/projeto')
})

test('tabLabel tira o ícone animado do Claude Code', () => {
  expect(tabLabel({ kind: 'claude', title: '✳ Claude Code' }, 'x')).toBe('Claude Code')
  expect(tabLabel({ kind: 'claude', title: '✶ Corrigir testes' }, 'x')).toBe('Corrigir testes')
  expect(tabLabel({ kind: 'claude', title: '✳' }, 'x')).toBe('Claude Code')
})

test('modeName', () => {
  expect(modeName('shell', undefined, 'Windows PowerShell')).toBe('Windows PowerShell')
  expect(modeName('shell', 'cmd', 'x')).toBe('Prompt de Comando')
  expect(modeName('claude', undefined, 'x')).toBe('Claude Code')
})
