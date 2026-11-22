import { ArrowDown, ArrowUp, GitBranch as GitBranchIcon, TriangleAlert } from 'lucide-react'
import type { GitInfo } from '../../shared/types'
import { compactCount } from './format'

export interface DiffColors {
  added?: string
  removed?: string
}

/** `+2008 −27` com as cores de adição/remoção do tema; some quando não há alteração. */
export function GitDiff({
  git,
  colors,
  className = '',
}: {
  git: GitInfo | null
  colors: DiffColors
  className?: string
}) {
  if (!git || (git.added === 0 && git.removed === 0 && git.untracked === 0)) return null
  const files = git.changed + git.untracked
  return (
    <span
      className={`inline-flex items-center gap-1.5 font-mono text-[11px] tabular-nums ${className}`}
      title={`${git.added} linha(s) adicionada(s), ${git.removed} removida(s) em ${files} arquivo(s) não commitado(s)${git.untracked ? ` (${git.untracked} novo(s))` : ''}`}
    >
      <span style={{ color: colors.added }}>+{compactCount(git.added)}</span>
      <span style={{ color: colors.removed }}>−{compactCount(git.removed)}</span>
    </span>
  )
}

/** Branch (ou commit) com ↑ à frente e ↓ atrás do remoto. */
export function GitBranch({ git, className = '' }: { git: GitInfo; className?: string }) {
  const name = git.branch ?? (git.commit ? `@${git.commit}` : 'sem commits')
  return (
    <span className={`inline-flex min-w-0 items-center gap-1 ${className}`} title={`Branch: ${name}`}>
      <GitBranchIcon aria-hidden size={12} className="flex-none opacity-70" />
      <span className="truncate">{name}</span>
      {git.ahead > 0 && (
        <span className="inline-flex items-center" title={`${git.ahead} commit(s) para enviar`}>
          <ArrowUp aria-hidden size={11} />
          {git.ahead}
        </span>
      )}
      {git.behind > 0 && (
        <span className="inline-flex items-center" title={`${git.behind} commit(s) para receber`}>
          <ArrowDown aria-hidden size={11} />
          {git.behind}
        </span>
      )}
      {git.conflicts > 0 && (
        <span className="inline-flex items-center gap-0.5" title={`${git.conflicts} conflito(s)`}>
          <TriangleAlert aria-hidden size={11} />
          {git.conflicts}
        </span>
      )}
    </span>
  )
}
