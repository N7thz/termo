import { expect, test } from 'bun:test'
import { compactCount, folderName, shortPath } from './format'

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
