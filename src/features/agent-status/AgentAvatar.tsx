import './agentAvatar.css'
import { AGENT_LABEL, type AgentState } from './agentState'

/**
 * Clawd, o mascote do Claude Code, no mesmo desenho do terminal (`▐▛███▜▌` / `▝▜█████▛▘` / `▘▘ ▝▝`).
 * Cada caractere de bloco tem 2×2 "quadrantes"; aqui cada quadrante é um pixel de 1×2 (a célula do
 * terminal é duas vezes mais alta que larga). A grade tem 18 colunas e 5 linhas de quadrantes.
 */
type Px = readonly [x: number, y: number, w: number]

/** Corpo: o retângulo principal, inteiro (os olhos são desenhados por cima, para poderem se mexer). */
const BODY: Px[] = [
  [3, 0, 12],
  [3, 1, 12],
  [3, 2, 12],
  [3, 3, 12],
]
/** Braços: as pontas que saem dos lados na terceira linha. */
const ARM_LEFT: Px[] = [[1, 2, 2]]
const ARM_RIGHT: Px[] = [[15, 2, 2]]
/** Pernas: quatro, em dois pares que se alternam ao andar. */
const LEGS_A: Px[] = [
  [4, 4, 1],
  [11, 4, 1],
]
const LEGS_B: Px[] = [
  [6, 4, 1],
  [13, 4, 1],
]
/** Olhos: os buracos do corpo (preenchidos com o fundo, então somem nos piscares). */
const EYES: Px[] = [
  [5, 1, 1],
  [12, 1, 1],
]

const H = 2
const rects = (list: readonly Px[]) =>
  list.map(([x, y, w]) => <rect key={`${x}-${y}`} x={x} y={y * H} width={w} height={H} />)

/**
 * Avatar do estado do Claude Code numa aba: o Clawd em pixel art, na cor do Claude do tema, com os olhos
 * vazados no fundo (acompanha qualquer tema). Cada estado tem um movimento próprio (`agentAvatar.css`):
 * pisca quando pronto, olha de lado pensando, anda trabalhando, balança os braços pedindo permissão e
 * pula ao terminar. Tudo para com "reduzir movimento".
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
  const tone = state === 'blocked' || state === 'waiting' ? 'text-accent' : 'text-claude'
  return (
    <svg
      // 18×10 de desenho, centralizado num quadrado para alinhar com os outros ícones das abas.
      viewBox="0 -4 18 18"
      width={size}
      height={size}
      shapeRendering="crispEdges"
      role="img"
      aria-label={AGENT_LABEL[state]}
      data-state={state}
      className={`agent-avatar flex-none ${tone} ${className}`}
    >
      <title>{AGENT_LABEL[state]}</title>
      <g className="clawd" fill="currentColor">
        <g className="legs-a">{rects(LEGS_A)}</g>
        <g className="legs-b">{rects(LEGS_B)}</g>
        <g className="torso">
          {rects(BODY)}
          <g className="arm-left">{rects(ARM_LEFT)}</g>
          <g className="arm-right">{rects(ARM_RIGHT)}</g>
          <g className="eyes" fill="var(--bg)">
            {rects(EYES)}
          </g>
          {/* Pálpebra: cobre os olhos com a cor do corpo no piscar. */}
          <g className="lids">{rects(EYES)}</g>
        </g>
      </g>
    </svg>
  )
}
