import { expect, test } from 'bun:test'
import { commentsPrompt, lineKey, lineSegments, parseDiff, reviewPrompt, splitPath, wordDiff } from './diff'

const diff = [
  'diff --git a/a.txt b/a.txt',
  'index 1..2 100644',
  '--- a/a.txt',
  '+++ b/a.txt',
  '@@ -1,3 +1,3 @@ fn main',
  ' 1',
  '-2',
  '+dois',
  ' 3',
  '\\ No newline at end of file',
  '@@ -10,2 +10,3 @@',
  ' a\r',
  '+b',
  ' c',
  '',
].join('\n')

test('separa hunks com números de linha', () => {
  const hunks = parseDiff(diff)
  expect(hunks).toHaveLength(2)
  expect(hunks[0].header).toBe('@@ -1,3 +1,3 @@ fn main')
  expect(hunks[0].context).toBe('fn main')
  expect(hunks[0].start).toBe(1)
  expect(hunks[1].context).toBe('')
  expect(hunks[1].start).toBe(10)
  expect(hunks[0].lines).toEqual([
    { type: 'ctx', oldNo: 1, newNo: 1, text: '1' },
    { type: 'del', oldNo: 2, newNo: null, text: '2' },
    { type: 'add', oldNo: null, newNo: 2, text: 'dois' },
    { type: 'ctx', oldNo: 3, newNo: 3, text: '3' },
  ])
  expect(hunks[1].lines.map((l) => [l.type, l.oldNo, l.newNo, l.text])).toEqual([
    ['ctx', 10, 10, 'a'],
    ['add', null, 11, 'b'],
    ['ctx', 11, 12, 'c'],
  ])
  expect(parseDiff('')).toEqual([])
})

test('chave da linha usa o lado certo', () => {
  expect(lineKey('a.txt', { type: 'del', oldNo: 2, newNo: null, text: '' })).toBe('a.txt:old:2')
  expect(lineKey('a.txt', { type: 'add', oldNo: null, newNo: 5, text: '' })).toBe('a.txt:new:5')
})

test('prompt dos comentários agrupa por arquivo e ordena por linha', () => {
  const text = commentsPrompt([
    { id: '1', path: 'b.ts', line: 9, side: 'new', code: '  let x = 1 ', text: 'use const' },
    { id: '2', path: 'a.ts', line: 3, side: 'old', code: 'foo()', text: 'por que tirou?' },
    { id: '3', path: 'b.ts', line: 2, side: 'new', code: '', text: ' nome melhor ' },
  ])
  expect(text).toBe(
    [
      'Revisei as alterações não commitadas e deixei estes comentários. Aplique cada um:',
      '',
      'a.ts:',
      '- linha 3 (removida) `foo()`: por que tirou?',
      '',
      'b.ts:',
      '- linha 2: nome melhor',
      '- linha 9 `let x = 1`: use const',
    ].join('\n'),
  )
})

test('prompt de revisão lista os arquivos', () => {
  const text = reviewPrompt([
    { path: 'src/a.ts', status: 'modified', staged: 'none', added: 3, removed: 1, binary: false },
  ])
  expect(text).toContain('git diff HEAD')
  expect(text).toContain('- src/a.ts (modificado, +3 −1)')
})

test('separa pasta e nome', () => {
  expect(splitPath('src/features/a.ts')).toEqual({ dir: 'src/features/', name: 'a.ts' })
  expect(splitPath('a.ts')).toEqual({ dir: '', name: 'a.ts' })
})

test('início do trecho de arquivo apagado usa o lado antigo', () => {
  const [h] = parseDiff('@@ -5,2 +0,0 @@\n-a\n-b\n')
  expect(h.start).toBe(5)
})

test('wordDiff marca só o que mudou', () => {
  const d = wordDiff('const total = soma(a, b)', 'const total = soma(a, c)')
  expect(d?.old).toEqual([
    { text: 'const total = soma(a, ', changed: false },
    { text: 'b', changed: true },
    { text: ')', changed: false },
  ])
  expect(d?.new.filter((s) => s.changed).map((s) => s.text)).toEqual(['c'])
  // Os pedaços remontam as linhas.
  expect(d?.old.map((s) => s.text).join('')).toBe('const total = soma(a, b)')
  expect(d?.new.map((s) => s.text).join('')).toBe('const total = soma(a, c)')
})

test('wordDiff desiste de linhas diferentes demais', () => {
  expect(wordDiff('import x from "y"', 'return 42')).toBeNull()
  expect(wordDiff('', 'algo')).toBeNull()
})

test('lineSegments pareia removidas e adicionadas do mesmo bloco', () => {
  const [h] = parseDiff('@@ -1,3 +1,3 @@\n ctx\n-let a = 1\n-let b = 2\n+let a = 10\n+let b = 20\n+novo\n')
  const segs = lineSegments(h.lines)
  expect(segs[0]).toBeUndefined()
  expect(segs[1]?.some((s) => s.changed && s.text === '1')).toBe(true)
  expect(segs[3]?.some((s) => s.changed && s.text === '10')).toBe(true)
  expect(segs[4]?.some((s) => s.changed && s.text === '20')).toBe(true)
  expect(segs[5]).toBeUndefined()
})
