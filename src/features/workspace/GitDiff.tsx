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
      <span aria-hidden className="opacity-70">
        ⎇
      </span>
      <span className="truncate">{name}</span>
      {git.ahead > 0 && <span title={`${git.ahead} commit(s) para enviar`}>↑{git.ahead}</span>}
      {git.behind > 0 && <span title={`${git.behind} commit(s) para receber`}>↓{git.behind}</span>}
      {git.conflicts > 0 && <span title={`${git.conflicts} conflito(s)`}>⚠{git.conflicts}</span>}
    </span>
  )
}
