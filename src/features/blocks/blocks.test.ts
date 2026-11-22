import { expect, test } from 'bun:test'
import { decodeCommand, formatDuration, joinRows, tail } from './blocks'

test('decodifica o comando do OSC 633;E', () => {
  expect(decodeCommand('echo a\\x3bb \\\\x "c"\\x0ad')).toBe('echo a;b \\x "c"\nd')
  expect(decodeCommand('git status')).toBe('git status')
})

test('duração', () => {
  expect(formatDuration(420)).toBe('0,4 s')
  expect(formatDuration(12_300)).toBe('12 s')
  expect(formatDuration(65_000)).toBe('1 min 5 s')
  expect(formatDuration(120_000)).toBe('2 min')
  expect(formatDuration(2 * 3_600_000 + 180_000)).toBe('2 h 3 min')
})

test('junta linhas quebradas e tira as vazias do fim', () => {
  const rows = [
    { text: 'abc', wrapped: false },
    { text: 'def  ', wrapped: true },
    { text: 'x', wrapped: false },
    { text: '   ', wrapped: false },
  ]
  expect(joinRows(rows)).toBe('abcdef\nx')
  expect(joinRows([])).toBe('')
})

test('tail corta pelo começo', () => {
  expect(tail('abcdef', 10)).toBe('abcdef')
  expect(tail('abcdef', 3)).toBe('…\ndef')
})
