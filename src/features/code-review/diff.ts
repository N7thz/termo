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
      cur = { header: line, lines: [] }
      hunks.push(cur)
      oldNo = Number(m[1])
      newNo = Number(m[2])
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
