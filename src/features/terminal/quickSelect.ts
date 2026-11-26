/**
 * Seleção rápida por dicas (como o Quick Select do WezTerm e os hints do Kitty): acha na tela os
 * trechos que costumam ser copiados (URLs, caminhos, hashes do git, UUIDs, IPs, números longos) e dá a
 * cada um um rótulo de uma ou duas letras. Digitar o rótulo copia; com Shift, põe na linha de comando.
 *
 * Funções puras: a leitura da tela do xterm fica em `readScreen`, que só depende da API pública.
 */
import type { Terminal } from '@xterm/xterm'

export type TargetKind = 'url' | 'path' | 'uuid' | 'ip' | 'hash' | 'number'

/** Célula da tela visível: linha a partir do topo da área visível e coluna. */
export interface Cell {
  row: number
  col: number
}

/** Uma linha lógica da tela (linhas quebradas juntas); `cells[i]` é a célula de `text[i]`. */
export interface ScreenLine {
  text: string
  cells: Cell[]
}

/** Pedaço de um alvo numa linha da tela (alvos que quebram de linha têm mais de um). */
export interface Segment {
  row: number
  from: number
  to: number
}

export interface Target {
  text: string
  kind: TargetKind
  label: string
  segments: Segment[]
}

/** Home row primeiro: os rótulos mais fáceis de digitar vêm antes. */
export const ALPHABET = 'asdfjklghqwertyuiopzxcvbnm'
/** Com duas letras cabem 676 rótulos; uma tela cheia não passa disso. */
export const MAX_TARGETS = ALPHABET.length * ALPHABET.length

// Ordem = prioridade quando dois padrões pegam o mesmo trecho (a URL ganha do caminho dentro dela).
const PATTERNS: [TargetKind, RegExp][] = [
  ['url', /\b(?:https?|ftp|file):\/\/[^\s<>"'`]+/g],
  ['uuid', /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi],
  // C:\x, C:/x, \\servidor\x, ~/x, ./x, ../x, a/b/c (com :linha:coluna opcionais).
  ['path', /(?:[A-Za-z]:[\\/]|\\\\|~[\\/]|\.{1,2}[\\/]|(?<![\w.:/\\-])(?=[\w.@+-]+[\\/][\w.@+-]))[^\s"'<>|*?`,;]*/g],
  ['ip', /\b(?:(?:\d{1,3}\.){3}\d{1,3}|localhost)(?::\d{1,5})?\b/g],
  ['hash', /\b[0-9a-f]{7,40}\b/g],
  ['number', /\b\d{4,}\b/g],
]

/** Tira pontuação do fim (fim de frase, parêntese de fora) sem cortar um parêntese que abriu dentro. */
function trimEnd(text: string): string {
  let t = text
  for (;;) {
    const last = t.at(-1)
    if (!last) return t
    if ('.,;:!?\'"'.includes(last)) t = t.slice(0, -1)
    else if (')]}'.includes(last)) {
      const open = { ')': '(', ']': '[', '}': '{' }[last] as string
      if (t.split(open).length < t.split(last).length) t = t.slice(0, -1)
      else return t
    } else return t
  }
}

/** Hash do git: tem dígito e letra (palavras como "defaced" e números puros ficam de fora). */
const looksLikeHash = (t: string) => /\d/.test(t) && /[a-f]/i.test(t)

interface Match {
  kind: TargetKind
  start: number
  end: number
  priority: number
}

/** Trechos de uma linha, sem sobreposição: o de maior prioridade e, empatado, o mais longo. */
export function matchLine(text: string): { kind: TargetKind; start: number; end: number }[] {
  const found: Match[] = []
  PATTERNS.forEach(([kind, re], priority) => {
    for (const m of text.matchAll(re)) {
      const raw = m[0]
      const value = kind === 'url' || kind === 'path' ? trimEnd(raw) : raw
      if (kind === 'path' && !/[\\/]/.test(value)) continue
      if (kind === 'path' && value.length < 3) continue
      if (kind === 'hash' && !looksLikeHash(value)) continue
      if (!value) continue
      const start = m.index ?? 0
      found.push({ kind, start, end: start + value.length, priority })
    }
  })
  found.sort((a, b) => a.priority - b.priority || b.end - b.start - (a.end - a.start) || a.start - b.start)
  const kept: Match[] = []
  for (const m of found) {
    if (kept.some((k) => m.start < k.end && k.start < m.end)) continue
    kept.push(m)
  }
  return kept.sort((a, b) => a.start - b.start).map(({ kind, start, end }) => ({ kind, start, end }))
}

/** Rótulos sem um ser prefixo de outro: uma letra até 26 alvos, duas acima disso. */
export function makeLabels(n: number): string[] {
  const count = Math.min(n, MAX_TARGETS)
  if (count <= ALPHABET.length) return [...ALPHABET.slice(0, count)]
  const out: string[] = []
  for (const a of ALPHABET) for (const b of ALPHABET) if (out.length < count) out.push(a + b)
  return out
}

function segmentsOf(cells: Cell[]): Segment[] {
  const out: Segment[] = []
  for (const c of cells) {
    const last = out.at(-1)
    if (last && last.row === c.row) last.to = Math.max(last.to, c.col)
    else out.push({ row: c.row, from: c.col, to: c.col })
  }
  return out
}

/**
 * Alvos da tela com rótulo. O mesmo texto em vários lugares tem o mesmo rótulo; os mais de baixo (a
 * saída mais recente) ganham os rótulos mais fáceis.
 */
export function findTargets(lines: readonly ScreenLine[]): Target[] {
  const all: Omit<Target, 'label'>[] = []
  for (const line of lines) {
    for (const m of matchLine(line.text)) {
      const cells = line.cells.slice(m.start, m.end)
      if (cells.length === 0) continue
      all.push({ text: line.text.slice(m.start, m.end), kind: m.kind, segments: segmentsOf(cells) })
    }
  }
  const order: string[] = []
  for (let i = all.length - 1; i >= 0; i--) if (!order.includes(all[i].text)) order.push(all[i].text)
  const labels = makeLabels(order.length)
  const labelOf = new Map(order.slice(0, labels.length).map((t, i) => [t, labels[i]]))
  return all.flatMap((t) => {
    const label = labelOf.get(t.text)
    return label ? [{ ...t, label }] : []
  })
}

/** O que fazer com o que foi digitado: completar um rótulo, esperar mais uma letra ou não bater com nada. */
export function resolveTyped(targets: readonly Target[], typed: string): Target | 'more' | null {
  const t = typed.toLowerCase()
  const exact = targets.find((x) => x.label === t)
  if (exact) return exact
  return targets.some((x) => x.label.startsWith(t)) ? 'more' : null
}

/**
 * A tela visível do xterm como linhas lógicas (linhas quebradas pelo terminal viram uma só), com a
 * célula de cada caractere. Caracteres largos (CJK, emoji) ocupam a célula onde começam.
 */
export function readScreen(term: Terminal): ScreenLine[] {
  const buf = term.buffer.active
  const out: ScreenLine[] = []
  for (let row = 0; row < term.rows; row++) {
    const line = buf.getLine(buf.viewportY + row)
    if (!line) continue
    let text = ''
    const cells: Cell[] = []
    for (let col = 0; col < term.cols; col++) {
      const cell = line.getCell(col)
      if (!cell || cell.getWidth() === 0) continue
      const chars = cell.getChars() || ' '
      text += chars
      for (let i = 0; i < chars.length; i++) cells.push({ row, col })
    }
    const prev = out.at(-1)
    if (line.isWrapped && prev) {
      prev.text += text
      prev.cells.push(...cells)
    } else {
      out.push({ text, cells })
    }
  }
  return out
}
