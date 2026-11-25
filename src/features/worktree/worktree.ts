/** Cópia isolada do repositório (`git worktree`), como o `worktree.rs` devolve. */
export interface Worktree {
  /** Pasta da cópia, no formato do Windows. */
  path: string
  /** Branch da cópia; `null` com HEAD destacado. */
  branch: string | null
  main: boolean
  /** Commits que a branch da pasta principal ainda não tem. */
  ahead: number
  /** Arquivos alterados ou novos ainda não commitados. */
  dirty: number
}

export interface WorktreeList {
  mainPath: string
  mainBranch: string | null
  worktrees: Worktree[]
}

/** Prefixo das branches criadas pelo Termo (igual ao `BRANCH_PREFIX` do Rust). */
export const BRANCH_PREFIX = 'termo/'
export const MAX_WORKTREE_NAME = 40

/** "Corrige o login!" vira "corrige-o-login": o nome da pasta e da branch `termo/<nome>`. */
export function worktreeSlug(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, '-')
    .replace(/^[-.]+|[-.]+$/g, '')
    .replace(/-{2,}/g, '-')
    .slice(0, MAX_WORKTREE_NAME)
    .replace(/[-.]+$/g, '')
}

/** Nome curto para mostrar: a última pasta do caminho. */
export function worktreeName(path: string): string {
  return path.split(/[\\/]/).filter(Boolean).pop() ?? path
}

/** A pasta está dentro da cópia (ou é ela)? Serve para fechar as abas antes de remover a cópia. */
export function isInside(dir: string | null | undefined, root: string): boolean {
  if (!dir) return false
  const norm = (s: string) => s.replace(/\//g, '\\').replace(/\\+$/, '').toLowerCase()
  const d = norm(dir)
  const r = norm(root)
  return d === r || d.startsWith(`${r}\\`)
}

/** "2 commits · 3 não commitados", "sem alterações". */
export function worktreeSummary(w: Pick<Worktree, 'ahead' | 'dirty'>): string {
  const parts: string[] = []
  if (w.ahead > 0) parts.push(`${w.ahead} commit${w.ahead === 1 ? '' : 's'}`)
  if (w.dirty > 0) parts.push(`${w.dirty} não commitado${w.dirty === 1 ? '' : 's'}`)
  return parts.length ? parts.join(' · ') : 'sem alterações'
}
