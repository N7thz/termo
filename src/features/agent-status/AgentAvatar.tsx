import './agentAvatar.css'
import { AGENT_LABEL, type AgentState } from './agentState'

/** Corpo "Terminal" do open-bot-avatar (MIT): uma tela com orelhas, em viewBox 100x100. */
const BODY =
  'M16 16 H84 A6 6 0 0 1 90 22 V26 A4 4 0 0 1 86 30 V74 A8 8 0 0 1 78 82 H22 A8 8 0 0 1 14 74 V30 A4 4 0 0 1 10 26 V22 A6 6 0 0 1 16 16 Z'
const EYES = { x: 50, y: 54, spacing: 16, scale: 1.1 }
const R = 5.5 * EYES.scale

function Eye({ cx, state }: { cx: number; state: Exclude<AgentState, 'off'> }) {
  const cy = EYES.y
  switch (state) {
    case 'done':
      // Olhos felizes (^ ^).
      return (
        <path
          d={`M${cx - R} ${cy + R * 0.4} Q${cx} ${cy - R * 1.4} ${cx + R} ${cy + R * 0.4}`}
          fill="none"
          stroke="currentColor"
          strokeWidth={3.2}
          strokeLinecap="round"
        />
      )
    case 'waiting':
      // Meio fechados, esperando.
      return <ellipse cx={cx} cy={cy + 1} rx={R} ry={R * 0.45} />
    case 'blocked':
      // Arregalados e altos: chamando a atenção.
      return <rect x={cx - R * 0.55} y={cy - R * 1.3} width={R * 1.1} height={R * 2.6} rx={R * 0.55} />
    default:
      return <circle cx={cx} cy={cy} r={R} />
  }
}

/**
 * Avatar do estado do Claude Code numa aba. O corpo usa a cor do Claude do tema e os olhos
 * são vazados com o fundo, então acompanha qualquer tema. Cada estado tem um movimento
 * próprio (ver `agentAvatar.css`), que some com "reduzir movimento".
 */
export function AgentAvatar({
  state,
  size = 16,
  className = '',
}: {
  state: Exclude<AgentState, 'off'>
  size?: number
  className?: string
}) {
  const half = EYES.spacing / 2
  const tone = state === 'blocked' || state === 'waiting' ? 'text-accent' : 'text-claude'
  return (
    <svg
      viewBox="0 0 100 100"
      width={size}
      height={size}
      role="img"
      aria-label={AGENT_LABEL[state]}
      data-state={state}
      className={`agent-avatar flex-none ${tone} ${className}`}
    >
      <title>{AGENT_LABEL[state]}</title>
      <g className="body">
        <path d={BODY} fill="currentColor" />
        <g className="eyes" fill="var(--bg)" style={{ color: 'var(--bg)' }}>
          <Eye cx={EYES.x - half} state={state} />
          <Eye cx={EYES.x + half} state={state} />
        </g>
      </g>
    </svg>
  )
}
