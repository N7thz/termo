import { describe, expect, test } from 'bun:test'
import { blockKeyAction, extendFocus, filterOutput, type KeyLike, matchedText, stepSelection } from './blockNav'
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

describe('navegação entre blocos', () => {
  test('stepSelection', () => {
    expect(stepSelection(0, null, 'prev')).toBeNull()
    expect(stepSelection(3, null, 'prev')).toBe(2)
    expect(stepSelection(3, null, 'next')).toBeNull()
    expect(stepSelection(3, 2, 'prev')).toBe(1)
    expect(stepSelection(3, 0, 'prev')).toBe(0)
    expect(stepSelection(3, 1, 'next')).toBe(2)
    expect(stepSelection(3, 2, 'next')).toBeNull()
    expect(stepSelection(3, 9, 'prev')).toBe(2)
  })

  const ev = (key: string, mods: Partial<KeyLike> = {}): KeyLike => ({
    key,
    ctrlKey: false,
    shiftKey: false,
    altKey: false,
    ...mods,
  })

  test('teclas: Ctrl+↑ seleciona e o resto só com seleção', () => {
    expect(blockKeyAction(ev('ArrowUp', { ctrlKey: true }), false, false)).toBe('prev')
    expect(blockKeyAction(ev('ArrowDown', { ctrlKey: true }), false, false)).toBeNull()
    expect(blockKeyAction(ev('ArrowDown', { ctrlKey: true }), true, false)).toBe('next')
    expect(blockKeyAction(ev('Enter'), false, false)).toBeNull()
    expect(blockKeyAction(ev('Enter'), true, false)).toBe('reopen')
    expect(blockKeyAction(ev('Escape'), true, false)).toBe('clear')
    expect(blockKeyAction(ev('/'), true, false)).toBe('filter')
    expect(blockKeyAction(ev('L', { ctrlKey: true, shiftKey: true }), true, false)).toBe('filter')
    expect(blockKeyAction(ev('C', { ctrlKey: true, shiftKey: true }), true, false)).toBe('copy-command')
  })

  test('vários blocos: Shift+↑/↓ estende, Ctrl+Enter manda ao Claude, M e E exportam', () => {
    expect(blockKeyAction(ev('ArrowUp', { shiftKey: true }), true, false)).toBe('extend-prev')
    expect(blockKeyAction(ev('ArrowDown', { shiftKey: true }), true, false)).toBe('extend-next')
    expect(blockKeyAction(ev('ArrowUp', { shiftKey: true }), false, false)).toBeNull()
    expect(blockKeyAction(ev('Enter', { ctrlKey: true }), true, false)).toBe('send-claude')
    expect(blockKeyAction(ev('Enter', { ctrlKey: true }), false, false)).toBeNull()
    expect(blockKeyAction(ev('m'), true, false)).toBe('copy-markdown')
    expect(blockKeyAction(ev('e'), true, false)).toBe('export')
    expect(blockKeyAction(ev('e'), false, false)).toBeNull()
  })

  test('extendFocus fica dentro da lista', () => {
    expect(extendFocus(5, 2, 'prev')).toBe(1)
    expect(extendFocus(5, 0, 'prev')).toBe(0)
    expect(extendFocus(5, 4, 'next')).toBe(4)
    expect(extendFocus(5, 3, 'next')).toBe(4)
  })

  test('Ctrl+C copia a saída só sem texto selecionado e com bloco', () => {
    expect(blockKeyAction(ev('c', { ctrlKey: true }), true, false)).toBe('copy-output')
    expect(blockKeyAction(ev('c', { ctrlKey: true }), true, true)).toBeNull()
    expect(blockKeyAction(ev('c', { ctrlKey: true }), false, false)).toBeNull()
    expect(blockKeyAction(ev('ArrowUp', { ctrlKey: true, altKey: true }), true, false)).toBeNull()
  })
})

describe('filterOutput', () => {
  const out = 'Compilando\nerro: falta ;\naviso: x\nERRO: outro\nfim'
  test('texto simples ignora maiúsculas e guarda o número da linha', () => {
    const r = filterOutput(out, 'erro', false)
    expect(r.lines).toEqual([
      { n: 2, text: 'erro: falta ;' },
      { n: 4, text: 'ERRO: outro' },
    ])
    expect(r.total).toBe(5)
    expect(matchedText(r)).toBe('erro: falta ;\nERRO: outro')
  })
  test('texto simples não trata o padrão como regex', () => {
    expect(filterOutput('a.b\naxb', 'a.b', false).lines).toHaveLength(1)
  })
  test('regex', () => {
    expect(filterOutput(out, '^(erro|aviso):', true).lines.map((l) => l.n)).toEqual([2, 3, 4])
  })
  test('regex inválida devolve o erro e nenhuma linha', () => {
    const r = filterOutput(out, '(', true)
    expect(r.error).toBeTruthy()
    expect(r.lines).toEqual([])
  })
  test('consulta vazia mostra tudo', () => {
    expect(filterOutput(out, '', false).lines).toHaveLength(5)
  })
})
