import { expect, test } from 'bun:test'
import { cdCommand, folderName, otherRecent, parentDir } from './commands'

test('cd com -LiteralPath e aspas escapadas', () => {
  expect(cdCommand('D:\\estudos\\termo')).toBe("Set-Location -LiteralPath 'D:\\estudos\\termo'")
  expect(cdCommand("C:\\it's [x]")).toBe("Set-Location -LiteralPath 'C:\\it''s [x]'")
})

test('pasta acima', () => {
  expect(parentDir('D:\\estudos\\termo')).toBe('D:\\estudos')
  expect(parentDir('D:\\estudos\\')).toBe('D:\\')
  expect(parentDir('D:\\')).toBeNull()
  expect(parentDir('\\\\srv\\share\\x')).toBe('\\\\srv\\share')
  expect(parentDir('\\\\srv\\share')).toBeNull()
})

test('recentes sem a atual nem repetidas', () => {
  const recent = ['D:\\estudos\\termo', 'C:\\x', 'c:\\X\\', 'D:\\y', 'D:\\z']
  expect(otherRecent(recent, 'd:\\estudos\\termo\\', 2)).toEqual(['C:\\x', 'D:\\y'])
})

test('nome curto', () => {
  expect(folderName('D:\\estudos\\termo')).toBe('termo')
  expect(folderName('D:\\')).toBe('D:\\')
})
