import './clawdStage.css'
import { AGENT_LABEL, type AgentState } from './agentState'

/**
 * Palco do Clawd em cima da barra da aba do Claude: o mascote fica em pé na barra, como na caixa de
 * mensagem do app do Claude, e cada estado vira uma cena (CSS em `clawdStage.css`):
 *
 * - pronto: parado, pisca e de vez em quando vira de lado para olhar;
 * - pensando: braço levantado e uma lâmpada piscando em cima da cabeça;
 * - trabalhando: anda de um lado para o outro, de perfil, e para no meio examinando com uma lupa, de olhos
 *   apertados;
 * - esperando você: de frente, respirando e piscando;
 * - pedindo permissão: pula acenando, com um "!" em cima;
 * - terminou: comemora com embaixadinhas.
 *
 * Desenho próprio em pixel art (retângulos numa grade), na cor do Claude do tema; os olhos e os detalhes
 * usam o fundo e o texto do tema. Com "reduzir movimento", fica parado de frente.
 */

type R = readonly [x: number, y: number, w: number, h: number]

const rects = (list: readonly R[], cls?: string) =>
  list.map(([x, y, w, h]) => <rect key={`${x},${y},${w},${h}`} className={cls} x={x} y={y} width={w} height={h} />)

/** De frente: o corpo, os braços dos lados, quatro pernas e os olhos vazados. */
const FRONT_BODY: R[] = [[3, 0, 12, 8]]
const FRONT_ARM_L: R[] = [[1, 4, 2, 2]]
const FRONT_ARM_R: R[] = [[15, 4, 2, 2]]
/** Braço direito levantado (pensando). */
const FRONT_ARM_UP: R[] = [[15, -2, 2, 6]]
const FRONT_LEGS_A: R[] = [
  [4, 8, 1, 2],
  [11, 8, 1, 2],
]
const FRONT_LEGS_B: R[] = [
  [6, 8, 1, 2],
  [13, 8, 1, 2],
]
const FRONT_EYES: R[] = [
  [5, 2, 1, 2],
  [12, 2, 1, 2],
]

/** Olhos apertados, concentrado (trabalhando, com a lupa). */
const FOCUS_EYES: R[] = [
  [5, 2, 3, 1],
  [6, 3, 2, 1],
  [10, 2, 3, 1],
  [10, 3, 2, 1],
]
/** Lupa na mão direita: aro, lente e o brilho que gira dentro dela. */
const LOUPE_RING: R[] = [
  [17, 1, 3, 1],
  [16, 2, 1, 3],
  [20, 2, 1, 3],
  [17, 5, 3, 1],
  [16, 5, 1, 2],
]
const LOUPE_LENS: R[] = [[17, 2, 3, 3]]
const LOUPE_GLINT: R[] = [[17, 2, 1, 1]]

/** De perfil, olhando para a direita (virado com scaleX(-1) para a esquerda). */
const SIDE_BODY: R[] = [[4, 0, 11, 8]]
const SIDE_ARMS: R[] = [
  [2, 4, 2, 2],
  [15, 4, 2, 2],
]
const SIDE_LEGS_A: R[] = [
  [5, 8, 1, 2],
  [10, 8, 1, 2],
]
const SIDE_LEGS_B: R[] = [
  [7, 8, 1, 2],
  [12, 8, 1, 2],
]
const SIDE_EYE: R[] = [[12, 2, 1, 2]]

/** Lâmpada (pensando), em cima da cabeça. */
const BULB_GLASS: R[] = [
  [7, -11, 4, 1],
  [6, -10, 6, 4],
  [7, -6, 4, 1],
]
const BULB_SHINE: R[] = [[7, -10, 1, 2]]
const BULB_BASE: R[] = [
  [8, -5, 2, 1],
  [8, -4, 2, 1],
]

/** "!" do pedido de permissão. */
const BANG: R[] = [
  [8, -9, 2, 4],
  [8, -4, 2, 1],
]

/** Bola quadriculada (terminou): 3×3, com o "xadrez" em duas casas. */
const BALL: R[] = [[0, 0, 3, 3]]
const BALL_DARK: R[] = [
  [1, 0, 1, 1],
  [0, 1, 1, 1],
  [2, 1, 1, 1],
  [1, 2, 1, 1],
]

/** Brilhos em volta (terminou). */
const SPARKS: R[] = [
  [0, -4, 1, 1],
  [-1, -3, 3, 1],
  [0, -2, 1, 1],
  [17, -6, 1, 1],
  [16, -5, 3, 1],
  [17, -4, 1, 1],
]

function Front({ armUp = false }: { armUp?: boolean }) {
  return (
    <g className="front">
      <g className="legs-a">{rects(FRONT_LEGS_A)}</g>
      <g className="legs-b">{rects(FRONT_LEGS_B)}</g>
      <g className="torso">
        {rects(FRONT_BODY)}
        {rects(FRONT_ARM_L)}
        <g className="arm-r">{rects(armUp ? FRONT_ARM_UP : FRONT_ARM_R)}</g>
        <g className="eyes">{rects(FRONT_EYES)}</g>
        <g className="lids">{rects(FRONT_EYES)}</g>
      </g>
    </g>
  )
}

/** De frente, parado, examinando com a lupa (a outra metade da cena de trabalho). */
function Inspect() {
  return (
    <g className="inspect">
      {rects(FRONT_LEGS_A)}
      {rects(FRONT_LEGS_B)}
      <g className="torso">
        {rects(FRONT_BODY)}
        {rects(FRONT_ARM_L)}
        {rects(FRONT_ARM_R)}
        <g className="eyes">{rects(FOCUS_EYES)}</g>
        <g className="loupe">
          <g className="loupe-lens">{rects(LOUPE_LENS)}</g>
          <g className="loupe-ring">{rects(LOUPE_RING)}</g>
          <g className="loupe-glint">{rects(LOUPE_GLINT)}</g>
        </g>
      </g>
    </g>
  )
}

function Side() {
  return (
    <g className="side">
      <g className="legs-a">{rects(SIDE_LEGS_A)}</g>
      <g className="legs-b">{rects(SIDE_LEGS_B)}</g>
      <g className="torso">
        {rects(SIDE_BODY)}
        {rects(SIDE_ARMS)}
        <g className="eyes">{rects(SIDE_EYE)}</g>
      </g>
    </g>
  )
}

/** O estado que veio do backend (texto) tem cena? `off` e valores desconhecidos não têm. */
export function hasScene(state: string | null | undefined): state is Exclude<AgentState, 'off'> {
  return state != null && state !== 'off' && Object.hasOwn(AGENT_LABEL, state)
}

/** Largura do palco em unidades da grade; o Clawd tem 18 de largura e anda pelo resto. */
const STAGE_W = 64
const STAGE_H = 22
/** Pixels por unidade da grade. */
const UNIT = 1.25

export function ClawdStage({ state }: { state: Exclude<AgentState, 'off'> }) {
  return (
    <svg
      viewBox={`0 0 ${STAGE_W} ${STAGE_H}`}
      width={STAGE_W * UNIT}
      height={STAGE_H * UNIT}
      shapeRendering="crispEdges"
      role="img"
      aria-label={`Clawd: ${AGENT_LABEL[state].toLowerCase()}`}
      data-state={state}
      className="clawd-stage flex-none text-claude"
    >
      <title>{AGENT_LABEL[state]}</title>
      {/* Em pé na base do palco (a borda de cima da barra). */}
      <g transform={`translate(0 ${STAGE_H - 10})`}>
        <g className="walker">
          <g className="facing" fill="currentColor">
            {state === 'working' ? (
              <>
                <Side />
                <Inspect />
              </>
            ) : (
              <>
                <Front armUp={state === 'thinking'} />
                {state === 'idle' && <Side />}
              </>
            )}
          </g>
          {state === 'thinking' && (
            <g className="bulb">
              <g className="glass">{rects(BULB_GLASS)}</g>
              <g className="shine">{rects(BULB_SHINE)}</g>
              <g className="base">{rects(BULB_BASE)}</g>
            </g>
          )}
          {state === 'blocked' && <g className="bang">{rects(BANG)}</g>}
          {state === 'done' && (
            <>
              <g className="ball">
                {rects(BALL, 'ball-light')}
                {rects(BALL_DARK, 'ball-dark')}
              </g>
              <g className="sparks">{rects(SPARKS)}</g>
            </>
          )}
        </g>
      </g>
    </svg>
  )
}
