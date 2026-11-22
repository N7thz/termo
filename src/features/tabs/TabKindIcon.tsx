import { SquareTerminal } from 'lucide-react'
import type { SessionKind } from '../../shared/types'
import { ClaudeIcon } from './ClaudeIcon'

/** Ícone do tipo da aba (shell ou Claude Code), já na cor de cada um. */
export function TabKindIcon({
  kind,
  size = 13,
  className = '',
}: {
  kind: SessionKind
  size?: number
  className?: string
}) {
  return kind === 'claude' ? (
    <ClaudeIcon size={size} className={`flex-none text-claude ${className}`} />
  ) : (
    <SquareTerminal aria-hidden size={size} className={`flex-none text-accent ${className}`} />
  )
}
