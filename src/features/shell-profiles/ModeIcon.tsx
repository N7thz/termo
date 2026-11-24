import { Container, DollarSign, Server, SquareChevronRight, SquareTerminal, Terminal } from 'lucide-react'
import { ClaudeIcon } from '../tabs/ClaudeIcon'
import { MODE_TONE, type TerminalMode } from './modes'

/** Ícone do modo da aba, já no tom dele. Formas diferentes para não depender só da cor. */
export function ModeIcon({
  mode,
  size = 13,
  className = '',
}: {
  mode: TerminalMode
  size?: number
  className?: string
}) {
  const style = { color: MODE_TONE[mode] }
  const cls = `flex-none ${className}`
  switch (mode) {
    case 'claude':
      return <ClaudeIcon size={size} className={`${cls} text-claude`} />
    case 'powershell':
      return <Terminal aria-hidden size={size} className={cls} style={style} />
    case 'cmd':
      return <SquareChevronRight aria-hidden size={size} className={cls} style={style} />
    case 'bash':
      return <DollarSign aria-hidden size={size} className={cls} style={style} />
    case 'wsl':
      return <Container aria-hidden size={size} className={cls} style={style} />
    case 'ssh':
      return <Server aria-hidden size={size} className={cls} style={style} />
    default:
      return <SquareTerminal aria-hidden size={size} className={cls} style={style} />
  }
}
