/**
 * Modo de cópia pelo teclado (como o Copy Mode do WezTerm e o mark mode do Windows Terminal): um cursor
 * próprio anda pela saída e pelo histórico de rolagem, `v` começa a seleção (`V` por linhas) e `y` ou
 * Enter copiam. Teclas do vim e as setas.
 *
 * Funções puras sobre um "buffer" mínimo; a ligação com o xterm fica no `CopyModeOverlay`.
 */

export interface Pos {
  /** Linha absoluta do buffer (0 = a mais antiga do histórico). */
  row: number
  col: number
}

export interface CopyState {
  cursor: Pos
  /** Onde a seleção começou (`null`: só andando). */
  anchor: Pos | null
  /** Seleção por linhas inteiras (`V`). */
  lines: boolean
}

/** O que o modo precisa saber do buffer. */
export interface BufferView {
  /** Total de linhas (histórico + tela). */
  length: number
  cols: number
  /** Linhas visíveis (para PageUp/PageDown e Ctrl+U/D). */
  rows: number
  /** Texto da linha, com uma célula por caractere (`''` fora do buffer). */
  text: (row: number) => string
}

export type CopyAction = { type: 'move'; state: CopyState } | { type: 'copy' } | { type: 'exit' } | { type: 'none' }

const clampPos = (p: Pos, b: BufferView): Pos => ({
  row: Math.min(Math.max(0, p.row), Math.max(0, b.length - 1)),
  col: Math.min(Math.max(0, p.col), Math.max(0, b.cols - 1)),
})

/** Última coluna com texto na linha (0 se vazia). */
function lineEnd(b: BufferView, row: number): number {
  const t = b.text(row).replace(/\s+$/, '')
  return Math.max(0, t.length - 1)
}

const firstNonBlank = (b: BufferView, row: number) => Math.max(0, b.text(row).search(/\S/))

type CharClass = 0 | 1 | 2
/** 0 = espaço, 1 = palavra (letras, números, _ e caracteres de caminho), 2 = pontuação. */
function classOf(ch: string | undefined): CharClass {
  if (ch == null || /\s/.test(ch)) return 0
  return /[\p{L}\p{N}_\-./\\:~]/u.test(ch) ? 1 : 2
}

/** `w`: começo da próxima palavra, descendo de linha se precisar. */
function nextWord(b: BufferView, p: Pos): Pos {
  let { row, col } = p
  let line = b.text(row)
  const start = classOf(line[col])
  // Sai da palavra atual.
  while (col < line.length && start !== 0 && classOf(line[col]) === start) col++
  for (;;) {
    while (col < line.length && classOf(line[col]) === 0) col++
    if (col < line.length) return { row, col }
    if (row >= b.length - 1) return { row, col: lineEnd(b, row) }
    row++
    col = 0
    line = b.text(row)
  }
}

/** `b`: começo desta palavra ou da anterior, subindo de linha se precisar. */
function prevWord(b: BufferView, p: Pos): Pos {
  let { row, col } = p
  let line = b.text(row)
  col--
  for (;;) {
    while (col >= 0 && classOf(line[col]) === 0) col--
    if (col >= 0) break
    if (row === 0) return { row: 0, col: 0 }
    row--
    line = b.text(row)
    col = line.length - 1
  }
  const cls = classOf(line[col])
  while (col > 0 && classOf(line[col - 1]) === cls) col--
  return { row, col }
}

/** `e`: fim desta palavra ou da próxima. */
function wordEnd(b: BufferView, p: Pos): Pos {
  let { row, col } = p
  let line = b.text(row)
  col++
  for (;;) {
    while (col < line.length && classOf(line[col]) === 0) col++
    if (col < line.length) break
    if (row >= b.length - 1) return { row, col: lineEnd(b, row) }
    row++
    col = 0
    line = b.text(row)
  }
  const cls = classOf(line[col])
  while (col < line.length - 1 && classOf(line[col + 1]) === cls) col++
  return { row, col }
}

export interface KeyLike {
  key: string
  ctrlKey?: boolean
  shiftKey?: boolean
  altKey?: boolean
}

/** O que uma tecla faz no modo de cópia. */
export function copyModeKey(s: CopyState, e: KeyLike, b: BufferView): CopyAction {
  const move = (cursor: Pos, patch: Partial<CopyState> = {}): CopyAction => ({
    type: 'move',
    state: { ...s, ...patch, cursor: clampPos(cursor, b) },
  })
  const { row, col } = s.cursor
  const half = Math.max(1, Math.floor(b.rows / 2))
  if (e.ctrlKey) {
    switch (e.key.toLowerCase()) {
      case 'u':
        return move({ row: row - half, col })
      case 'd':
        return move({ row: row + half, col })
      case 'b':
        return move({ row: row - b.rows, col })
      case 'f':
        return move({ row: row + b.rows, col })
      case 'c':
        return s.anchor ? { type: 'copy' } : { type: 'exit' }
      default:
        return { type: 'none' }
    }
  }
  if (e.altKey) return { type: 'none' }
  switch (e.key) {
    case 'Escape':
    case 'q':
      // Esc com seleção só desfaz a seleção; sem ela, sai.
      return s.anchor ? { type: 'move', state: { ...s, anchor: null, lines: false } } : { type: 'exit' }
    case 'ArrowLeft':
    case 'h':
      return move({ row, col: col - 1 })
    case 'ArrowRight':
    case 'l':
      return move({ row, col: col + 1 })
    case 'ArrowUp':
    case 'k':
      return move({ row: row - 1, col })
    case 'ArrowDown':
    case 'j':
      return move({ row: row + 1, col })
    case 'w':
    case 'W':
      return move(nextWord(b, s.cursor))
    case 'b':
    case 'B':
      return move(prevWord(b, s.cursor))
    case 'e':
    case 'E':
      return move(wordEnd(b, s.cursor))
    case '0':
    case 'Home':
      return move({ row, col: 0 })
    case '^':
      return move({ row, col: firstNonBlank(b, row) })
    case '$':
    case 'End':
      return move({ row, col: lineEnd(b, row) })
    case 'g':
      return move({ row: 0, col: 0 })
    case 'G':
      return move({ row: b.length - 1, col: 0 })
    case 'PageUp':
      return move({ row: row - b.rows, col })
    case 'PageDown':
      return move({ row: row + b.rows, col })
    case 'v':
    case ' ':
      // Liga/desliga a seleção por caracteres (ou troca de por linhas para por caracteres).
      if (s.anchor && !s.lines) return { type: 'move', state: { ...s, anchor: null } }
      return { type: 'move', state: { ...s, anchor: s.anchor ?? s.cursor, lines: false } }
    case 'V':
      if (s.anchor && s.lines) return { type: 'move', state: { ...s, anchor: null, lines: false } }
      return { type: 'move', state: { ...s, anchor: s.anchor ?? s.cursor, lines: true } }
    case 'o':
      // Troca a ponta da seleção que anda.
      return s.anchor ? { type: 'move', state: { ...s, anchor: s.cursor, cursor: s.anchor } } : { type: 'none' }
    case 'y':
    case 'Enter':
      return s.anchor ? { type: 'copy' } : { type: 'none' }
    default:
      return { type: 'none' }
  }
}

/** A seleção em ordem (início antes do fim), ou `null` sem seleção. */
export function selectionRange(s: CopyState): { start: Pos; end: Pos } | null {
  if (!s.anchor) return null
  const [a, c] = [s.anchor, s.cursor]
  const before = a.row < c.row || (a.row === c.row && a.col <= c.col)
  const [start, end] = before ? [a, c] : [c, a]
  return s.lines
    ? { start: { row: start.row, col: 0 }, end: { row: end.row, col: Number.POSITIVE_INFINITY } }
    : { start, end }
}

/** Quantas células o `term.select(col, row, length)` precisa para ir do início ao fim (inclusive). */
export function selectLength(start: Pos, end: Pos, cols: number): number {
  return (end.row - start.row) * cols + (end.col - start.col) + 1
}

/** Primeira linha visível para o cursor ficar na tela, mexendo o mínimo possível. */
export function scrollFor(cursorRow: number, viewportY: number, rows: number): number {
  if (cursorRow < viewportY) return cursorRow
  if (cursorRow >= viewportY + rows) return cursorRow - rows + 1
  return viewportY
}
