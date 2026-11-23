/**
 * Partes puras do painel de code review: tipos do backend (src-tauri/src/review.rs), o parser do diff
 * unificado e o texto mandado ao Claude Code com os comentários.
 */

export type FileStatus = 'modified' | 'added' | 'deleted' | 'untracked' | 'conflict'
export type Staged = 'none' | 'partial' | 'full'

export interface ChangedFile {
  /** Relativo à raiz do repositório, com `/`. */
  path: string
  status: FileStatus
  staged: Staged
  added: number
  removed: number
  binary: boolean
}

export interface ReviewStatus {
  root: string
  branch: string | null
  files: ChangedFile[]
}

export interface FileDiff {
  diff: string
  binary: boolean
  truncated: boolean
}

export interface DiffLine {
  type: 'add' | 'del' | 'ctx'
  /** Número da linha no arquivo antigo (ausente nas adicionadas). */
  oldNo: number | null
  /** Número da linha no arquivo novo (ausente nas removidas). */
  newNo: number | null
  text: string
}

export interface Hunk {
  header: string
  /** Onde o trecho começa no arquivo novo (no antigo, se o arquivo foi apagado). */
  start: number
  /** O que o git põe depois do `@@` (a função ou a linha em volta); vazio quando não há. */
  context: string
  lines: DiffLine[]
}

/** Separa o diff unificado de um arquivo em trechos (hunks), com os números de linha de cada lado. */
export function parseDiff(diff: string): Hunk[] {
  const hunks: Hunk[] = []
  let cur: Hunk | null = null
  let oldNo = 0
  let newNo = 0
  for (const raw of diff.split('\n')) {
    const line = raw.endsWith('\r') ? raw.slice(0, -1) : raw
    const m = /^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@(.*)$/.exec(line)
    if (m) {
      oldNo = Number(m[1])
      newNo = Number(m[2])
      cur = { header: line, start: newNo || oldNo || 1, context: m[3].trim(), lines: [] }
      hunks.push(cur)
      continue
    }
    if (!cur) continue
    if (line.startsWith('+')) cur.lines.push({ type: 'add', oldNo: null, newNo: newNo++, text: line.slice(1) })
    else if (line.startsWith('-')) cur.lines.push({ type: 'del', oldNo: oldNo++, newNo: null, text: line.slice(1) })
    else if (line.startsWith(' ')) cur.lines.push({ type: 'ctx', oldNo: oldNo++, newNo: newNo++, text: line.slice(1) })
    // "\ No newline at end of file" e linhas vazias do fim ficam de fora.
  }
  return hunks
}

/** Pedaço de uma linha alterada; `changed` marca o que mudou em relação à linha par. */
export interface Segment {
  text: string
  changed: boolean
}

/** Palavras, espaços e cada símbolo separado: a unidade do realce dentro da linha. */
function tokens(s: string): string[] {
  return s.match(/[\p{L}\p{N}_]+|\s+|[^\p{L}\p{N}_\s]/gu) ?? []
}

/** Linhas com mais pedaços que isso não ganham realce (o LCS é quadrático). */
const MAX_TOKENS = 400

function merge(parts: Segment[]): Segment[] {
  const out: Segment[] = []
  for (const p of parts) {
    const last = out[out.length - 1]
    if (last && last.changed === p.changed) last.text += p.text
    else out.push({ ...p })
  }
  return out
}

/**
 * Realce dentro da linha: compara a linha removida com a adicionada por palavras (LCS) e marca o que mudou
 * de cada lado. `null` quando as linhas são diferentes demais (menos da metade em comum) ou longas demais:
 * aí o realce só atrapalharia.
 */
export function wordDiff(before: string, after: string): { old: Segment[]; new: Segment[] } | null {
  const a = tokens(before)
  const b = tokens(after)
  if (!a.length || !b.length || a.length > MAX_TOKENS || b.length > MAX_TOKENS) return null
  const n = a.length
  const m = b.length
  // lcs[i][j]: tamanho do LCS de a[i..] e b[j..].
  const lcs: Uint16Array[] = Array.from({ length: n + 1 }, () => new Uint16Array(m + 1))
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      lcs[i][j] = a[i] === b[j] ? lcs[i + 1][j + 1] + 1 : Math.max(lcs[i + 1][j], lcs[i][j + 1])
    }
  }
  const old: Segment[] = []
  const neu: Segment[] = []
  let same = 0
  let i = 0
  let j = 0
  while (i < n && j < m) {
    if (a[i] === b[j]) {
      if (a[i].trim()) same += a[i].length
      old.push({ text: a[i++], changed: false })
      neu.push({ text: b[j++], changed: false })
    } else if (lcs[i + 1][j] >= lcs[i][j + 1]) old.push({ text: a[i++], changed: true })
    else neu.push({ text: b[j++], changed: true })
  }
  while (i < n) old.push({ text: a[i++], changed: true })
  while (j < m) neu.push({ text: b[j++], changed: true })
  const size = Math.max(before.trim().length, after.trim().length)
  if (size === 0 || same / size < 0.5) return null
  return { old: merge(old), new: merge(neu) }
}

/**
 * Realce de cada linha do trecho: em cada bloco de removidas seguido de adicionadas, a i-ésima removida é
 * comparada com a i-ésima adicionada. As linhas sem par (ou sem realce) ficam `undefined`.
 */
export function lineSegments(lines: readonly DiffLine[]): (Segment[] | undefined)[] {
  const out: (Segment[] | undefined)[] = new Array(lines.length).fill(undefined)
  let k = 0
  while (k < lines.length) {
    if (lines[k].type !== 'del') {
      k++
      continue
    }
    const dels: number[] = []
    while (k < lines.length && lines[k].type === 'del') dels.push(k++)
    const adds: number[] = []
    while (k < lines.length && lines[k].type === 'add') adds.push(k++)
    for (let p = 0; p < Math.min(dels.length, adds.length); p++) {
      const d = wordDiff(lines[dels[p]].text, lines[adds[p]].text)
      if (!d) continue
      out[dels[p]] = d.old
      out[adds[p]] = d.new
    }
  }
  return out
}

/** Um comentário feito numa linha do diff. */
export interface ReviewComment {
  id: string
  path: string
  /** Linha no arquivo novo (ou no antigo, para linha removida). */
  line: number
  side: 'new' | 'old'
  /** O código da linha comentada, para o Claude achar o lugar mesmo se o arquivo mudar. */
  code: string
  text: string
}

/** Chave de uma linha do diff, para prender o comentário a ela. */
export function lineKey(path: string, l: DiffLine): string {
  return l.type === 'del' ? `${path}:old:${l.oldNo}` : `${path}:new:${l.newNo}`
}

/** Pedido ao Claude Code com os comentários, agrupados por arquivo e em ordem de linha. */
export function commentsPrompt(comments: readonly ReviewComment[]): string {
  const byFile = new Map<string, ReviewComment[]>()
  for (const c of comments) byFile.set(c.path, [...(byFile.get(c.path) ?? []), c])
  const parts = ['Revisei as alterações não commitadas e deixei estes comentários. Aplique cada um:']
  for (const [path, list] of [...byFile.entries()].sort(([a], [b]) => a.localeCompare(b))) {
    parts.push('', `${path}:`)
    for (const c of [...list].sort((a, b) => a.line - b.line)) {
      const where = c.side === 'old' ? `linha ${c.line} (removida)` : `linha ${c.line}`
      const code = c.code.trim() ? ` \`${c.code.trim().slice(0, 120)}\`` : ''
      parts.push(`- ${where}${code}: ${c.text.trim()}`)
    }
  }
  return parts.join('\n')
}

/** Pedido de revisão completa ao Claude Code (ele mesmo lê o `git diff`). */
export function reviewPrompt(files: readonly ChangedFile[]): string {
  const list = files.map((f) => `- ${f.path} (${STATUS_LABEL[f.status]}, +${f.added} −${f.removed})`).join('\n')
  return [
    'Faça um code review das alterações não commitadas deste repositório (rode `git diff HEAD` e leia os arquivos novos).',
    'Aponte bugs, casos que quebram, problemas de segurança e o que pode ser simplificado, do mais grave para o menos grave, citando arquivo e linha. Não altere nada ainda.',
    '',
    'Arquivos:',
    list,
  ].join('\n')
}

export const STATUS_LABEL: Record<FileStatus, string> = {
  modified: 'modificado',
  added: 'novo',
  deleted: 'apagado',
  untracked: 'novo, fora do git',
  conflict: 'em conflito',
}

/** Letra do status, como no `git status` curto. */
export const STATUS_LETTER: Record<FileStatus, string> = {
  modified: 'M',
  added: 'A',
  deleted: 'D',
  untracked: 'U',
  conflict: '!',
}

/** Pasta e nome separados, para mostrar o nome em destaque. */
export function splitPath(path: string): { dir: string; name: string } {
  const i = path.lastIndexOf('/')
  return i < 0 ? { dir: '', name: path } : { dir: path.slice(0, i + 1), name: path.slice(i + 1) }
}
