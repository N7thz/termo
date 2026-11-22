import { SquareTerminal } from 'lucide-react'
import type { SessionKind } from '../../shared/types'
import { AgentAvatar } from '../agent-status/AgentAvatar'
import type { AgentState } from '../agent-status/agentState'
import { ClaudeIcon } from './ClaudeIcon'

/** Ícone do tipo da aba (shell ou Claude Code), já na cor de cada um. */
export function TabKindIcon({
  kind,
  size = 13,
  className = '',
  agent,
}: {
  kind: SessionKind
  size?: number
  className?: string
  /** Estado do Claude Code da aba: com ele, o ícone vira o avatar animado. */
  agent?: AgentState
}) {
  if (kind === 'claude' && agent && agent !== 'off')
    return <AgentAvatar state={agent} size={size + 3} className={className} />
  return kind === 'claude' ? (
    <ClaudeIcon size={size} className={`flex-none text-claude ${className}`} />
  ) : (
    <SquareTerminal aria-hidden size={size} className={`flex-none text-accent ${className}`} />
  )
}
