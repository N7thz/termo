import { expect, test } from 'bun:test'
import { ALPHABET, findTargets, MAX_TARGETS, makeLabels, matchLine, resolveTyped, type ScreenLine } from './quickSelect'

const texts = (line: string) => matchLine(line).map((m) => `${m.kind}:${line.slice(m.start, m.end)}`)

test('URLs, sem a pontuação do fim, com parênteses que abriram dentro', () => {
  expect(texts('veja https://exemplo.com/a?b=1.')).toEqual(['url:https://exemplo.com/a?b=1'])
  expect(texts('(https://exemplo.com/x)')).toEqual(['url:https://exemplo.com/x'])
  expect(texts('https://pt.wikipedia.org/wiki/Termo_(jogo)')).toEqual([
    'url:https://pt.wikipedia.org/wiki/Termo_(jogo)',
  ])
})

test('caminhos do Windows, relativos e com linha:coluna', () => {
  expect(texts(String.raw`erro em D:\estudos\termo\src\App.tsx:12:5`)).toEqual([
    String.raw`path:D:\estudos\termo\src\App.tsx:12:5`,
  ])
  expect(texts('src/features/terminal/quickSelect.ts | 4 ++--')).toEqual(['path:src/features/terminal/quickSelect.ts'])
  expect(texts('cd ../outro && ls ./build/')).toEqual(['path:../outro', 'path:./build/'])
  expect(texts('~/.config/termo')).toEqual(['path:~/.config/termo'])
  expect(texts('e/ou, a/b')).toEqual(['path:e/ou', 'path:a/b'])
  expect(texts('1/2')).toEqual(['path:1/2'])
})

test('hashes do git, UUIDs, IPs e números longos', () => {
  expect(texts('09a73ce feat: progresso')).toEqual(['hash:09a73ce'])
  expect(texts('palavra defaced e 1234567')).toEqual(['number:1234567'])
  expect(texts('id 3f2b8c1e-9a4d-4e2f-8b6a-0c1d2e3f4a5b')).toEqual(['uuid:3f2b8c1e-9a4d-4e2f-8b6a-0c1d2e3f4a5b'])
  expect(texts('ouvindo em 127.0.0.1:4747 e localhost:5173')).toEqual(['ip:127.0.0.1:4747', 'ip:localhost:5173'])
  expect(texts('porta 8080 pid 12')).toEqual(['number:8080'])
})

test('rótulos: uma letra até 26, duas acima, nenhum prefixo de outro', () => {
  expect(makeLabels(3)).toEqual(['a', 's', 'd'])
  expect(makeLabels(26)).toHaveLength(26)
  const two = makeLabels(30)
  expect(two.every((l) => l.length === 2)).toBe(true)
  expect(new Set(two).size).toBe(30)
  expect(makeLabels(MAX_TARGETS + 50)).toHaveLength(MAX_TARGETS)
  expect(ALPHABET).toHaveLength(26)
})

const line = (row: number, text: string): ScreenLine => ({
  text,
  cells: [...text].map((_, col) => ({ row, col })),
})

test('alvos: mesmo texto, mesmo rótulo; os de baixo ganham os primeiros rótulos', () => {
  const t = findTargets([line(0, 'commit 09a73ce'), line(1, 'abc1234 e 09a73ce')])
  expect(t.map((x) => `${x.text}=${x.label}@${x.segments[0].row}:${x.segments[0].from}-${x.segments[0].to}`)).toEqual([
    '09a73ce=a@0:7-13',
    'abc1234=s@1:0-6',
    '09a73ce=a@1:10-16',
  ])
})

test('alvo que quebra de linha vira dois pedaços', () => {
  const wrapped: ScreenLine = {
    text: 'https://exemplo.com/longo',
    cells: [...'https://exemplo.com/longo'].map((_, i) => ({ row: i < 10 ? 0 : 1, col: i < 10 ? 70 + i : i - 10 })),
  }
  const [t] = findTargets([wrapped])
  expect(t.segments).toEqual([
    { row: 0, from: 70, to: 79 },
    { row: 1, from: 0, to: 14 },
  ])
})

test('digitar: rótulo completo, espera mais uma letra ou nada', () => {
  const many = findTargets(Array.from({ length: 30 }, (_, i) => line(i, `${1000 + i}`)))
  const first = many.find((x) => x.label === 'aa')
  expect(resolveTyped(many, 'a')).toBe('more')
  expect(resolveTyped(many, 'AA')).toBe(first as never)
  expect(resolveTyped(many, 'zz')).toBeNull()
})
