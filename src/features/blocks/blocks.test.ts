import { describe, expect, test } from 'bun:test'
import { decodeCommand, findImagePaths, formatDuration, joinRows, tail } from './blocks'

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

describe('findImagePaths', () => {
  test('acha nomes soltos, entre aspas e caminhos do Windows', () => {
    const text = [
      'magick foto.jpg -resize 50% out/menor.png',
      'salvo em "C:Userseuminha foto.webp"',
      'D:imglogo.SVG pronto.',
      'notas.txt e arquivo.pngx não contam',
    ].join('\n')
    expect(findImagePaths(text)).toEqual(['C:Userseuminha foto.webp', 'foto.jpg', 'out/menor.png', 'D:imglogo.SVG'])
  })

  test('lê o nome (com espaços) da tabela do ls do PowerShell', () => {
    const text = [
      'Mode                 LastWriteTime         Length Name',
      '----                 -------------         ------ ----',
      'd-----        22/11/2026     18:01                assets',
      '-a----        22/11/2026     18:02          10930 icon.png',
      '-a----        22/11/2026     18:02           2048 tela de inicio.jpeg',
      '-a----        22/11/2026     18:02            120 leia.md',
    ].join('\n')
    expect(findImagePaths(text)).toEqual(['icon.png', 'tela de inicio.jpeg'])
  })

  test('respeita o limite', () => {
    const text = Array.from({ length: 10 }, (_, i) => `img${i}.png`).join(' ')
    expect(findImagePaths(text, 3)).toHaveLength(3)
  })
})
