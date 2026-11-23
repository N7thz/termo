import type { SessionKind } from '../../shared/types'
import { AgentAvatar } from '../agent-status/AgentAvatar'
import type { AgentState } from '../agent-status/agentState'
import { ModeIcon } from '../shell-profiles/ModeIcon'
import { modeOf } from '../shell-profiles/modes'

/** Ícone do modo da aba (PowerShell, cmd, WSL ou Claude Code), já na cor de cada um. */
export function TabKindIcon({
  kind,
  shell,
  size = 13,
  className = '',
  agent,
}: {
  kind: SessionKind
  /** Id do shell da aba (`pwsh`, `cmd`, `wsl:Ubuntu`...). Sem ele, o ícone do PowerShell 7. */
  shell?: string
  size?: number
  className?: string
  /** Estado do Claude Code da aba: com ele, o ícone vira o avatar animado. */
  agent?: AgentState
}) {
  if (kind === 'claude' && agent && agent !== 'off')
    return <AgentAvatar state={agent} size={size + 3} className={className} />
  return <ModeIcon mode={modeOf(kind, shell)} size={size} className={className} />
}
