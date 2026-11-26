import { expect, test } from 'bun:test'
import {
  type BufferView,
  type CopyAction,
  type CopyState,
  copyModeKey,
  scrollFor,
  selectionRange,
  selectLength,
} from './copyMode'

const LINES = ['git log --oneline', '  09a73ce feat: progresso', '', 'D:\\estudos\\termo> ']
const buf: BufferView = { length: LINES.length, cols: 40, rows: 2, text: (r) => LINES[r] ?? '' }
const at = (row: number, col: number): CopyState => ({ cursor: { row, col }, anchor: null, lines: false })

/** Aplica as teclas em sequência e devolve o estado final (falha se alguma não for movimento). */
function run(s: CopyState, keys: string[]): CopyState {
  let cur = s
  for (const key of keys) {
    const a: CopyAction = copyModeKey(cur, { key }, buf)
    if (a.type !== 'move') throw new Error(`${key}: ${a.type}`)
    cur = a.state
  }
  return cur
}

test('setas e hjkl andam e param nas bordas', () => {
  expect(run(at(0, 0), ['j', 'j', 'l', 'ArrowRight']).cursor).toEqual({ row: 2, col: 2 })
  expect(run(at(0, 0), ['k', 'h']).cursor).toEqual({ row: 0, col: 0 })
  expect(run(at(3, 0), ['j', 'j']).cursor).toEqual({ row: 3, col: 0 })
  expect(run(at(0, 39), ['l']).cursor).toEqual({ row: 0, col: 39 })
})

test('palavras: w, b e e, atravessando linhas vazias', () => {
  expect(run(at(0, 0), ['w']).cursor).toEqual({ row: 0, col: 4 })
  expect(run(at(0, 4), ['w']).cursor).toEqual({ row: 0, col: 8 })
  // O "--" é palavra junto com "oneline" (caminhos e flags ficam inteiros).
  expect(run(at(0, 8), ['w']).cursor).toEqual({ row: 1, col: 2 })
  expect(run(at(1, 2), ['w', 'w']).cursor).toEqual({ row: 1, col: 16 })
  expect(run(at(1, 16), ['w']).cursor).toEqual({ row: 3, col: 0 })
  expect(run(at(3, 0), ['b']).cursor).toEqual({ row: 1, col: 16 })
  expect(run(at(1, 2), ['e']).cursor).toEqual({ row: 1, col: 8 })
  expect(run(at(1, 2), ['b']).cursor).toEqual({ row: 0, col: 8 })
})

test('começo e fim da linha, topo e fim do histórico', () => {
  expect(run(at(1, 10), ['0']).cursor).toEqual({ row: 1, col: 0 })
  expect(run(at(1, 10), ['^']).cursor).toEqual({ row: 1, col: 2 })
  expect(run(at(1, 0), ['$']).cursor).toEqual({ row: 1, col: 24 })
  expect(run(at(2, 5), ['$']).cursor).toEqual({ row: 2, col: 0 })
  expect(run(at(2, 5), ['G']).cursor).toEqual({ row: 3, col: 0 })
  expect(run(at(2, 5), ['g']).cursor).toEqual({ row: 0, col: 0 })
})

test('seleção: v liga, o troca a ponta, Esc desfaz antes de sair; y copia', () => {
  const s = run(at(1, 2), ['v', 'e'])
  expect(selectionRange(s)).toEqual({ start: { row: 1, col: 2 }, end: { row: 1, col: 8 } })
  expect(run(s, ['o']).cursor).toEqual({ row: 1, col: 2 })
  expect(copyModeKey(s, { key: 'y' }, buf)).toEqual({ type: 'copy' })
  expect(copyModeKey(s, { key: 'Enter' }, buf)).toEqual({ type: 'copy' })
  expect(copyModeKey(at(0, 0), { key: 'y' }, buf)).toEqual({ type: 'none' })
  const esc = copyModeKey(s, { key: 'Escape' }, buf)
  expect(esc.type === 'move' && esc.state.anchor).toBeNull()
  expect(copyModeKey(at(0, 0), { key: 'Escape' }, buf)).toEqual({ type: 'exit' })
  expect(copyModeKey(at(0, 0), { key: 'c', ctrlKey: true }, buf)).toEqual({ type: 'exit' })
  expect(copyModeKey(s, { key: 'c', ctrlKey: true }, buf)).toEqual({ type: 'copy' })
})

test('seleção de trás para frente e por linhas', () => {
  const back = run(at(1, 8), ['v', 'k', '0'])
  expect(selectionRange(back)).toEqual({ start: { row: 0, col: 0 }, end: { row: 1, col: 8 } })
  const lines = run(at(1, 5), ['V', 'j'])
  expect(selectionRange(lines)).toEqual({
    start: { row: 1, col: 0 },
    end: { row: 2, col: Number.POSITIVE_INFINITY },
  })
  expect(run(lines, ['v']).lines).toBe(false)
})

test('tamanho da seleção e rolagem', () => {
  expect(selectLength({ row: 1, col: 2 }, { row: 1, col: 8 }, 40)).toBe(7)
  expect(selectLength({ row: 0, col: 38 }, { row: 1, col: 1 }, 40)).toBe(4)
  expect(scrollFor(5, 10, 20)).toBe(5)
  expect(scrollFor(15, 10, 20)).toBe(10)
  expect(scrollFor(35, 10, 20)).toBe(16)
})

test('meia página e página', () => {
  const big: BufferView = { ...buf, length: 100, rows: 20, text: () => 'x' }
  expect(copyModeKey(at(50, 0), { key: 'u', ctrlKey: true }, big)).toMatchObject({ state: { cursor: { row: 40 } } })
  expect(copyModeKey(at(50, 0), { key: 'PageDown' }, big)).toMatchObject({ state: { cursor: { row: 70 } } })
  expect(copyModeKey(at(95, 0), { key: 'f', ctrlKey: true }, big)).toMatchObject({ state: { cursor: { row: 99 } } })
})
