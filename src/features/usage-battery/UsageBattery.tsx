import { Tooltip, TooltipContent, TooltipTrigger } from '@ui-sdk/react/tooltip'
import { useEffect, useState } from 'react'
import { ipc } from '../../lib/ipc'
import { tooltip } from '../../lib/ui'
import { type ClaudeUsage, describe, litSegments, type Mood, moodOf, tightest } from './usage'

const POLL_MS = 15_000
const SEGMENTS = 5

// Só cores do tema: os tons ANSI (--tone-*) e o texto apagado.
const MOOD_COLOR: Record<Mood, string> = {
  happy: 'var(--tone-green, var(--accent))',
  ok: 'var(--tone-yellow, var(--accent))',
  tired: 'var(--tone-red, var(--claude))',
  empty: 'var(--tone-red, var(--claude))',
  unknown: 'var(--muted)',
}

/** Rosto do mascote em pixel art (7×6), um por humor. `x` acende o pixel. */
const FACES: Record<Mood, string[]> = {
  happy: ['.x...x.', '.x...x.', '.......', 'x.....x', '.xxxxx.', '.......'],
  ok: ['.x...x.', '.x...x.', '.......', '.......', '.xxxxx.', '.......'],
  tired: ['.......', 'xx...xx', '.......', '.......', '..xxx..', '.x...x.'],
  empty: ['x.x.x.x', '.x...x.', 'x.x.x.x', '.......', '..xxx..', '.x...x.'],
  unknown: ['.......', '.x...x.', '.......', '.......', '..xxx..', '.......'],
}

function Mascot({ mood }: { mood: Mood }) {
  const px = FACES[mood].flatMap((row, y) => [...row].map((c, x) => (c === 'x' ? { x, y } : null)).filter(Boolean))
  return (
    <svg width={14} height={12} viewBox="0 0 7 6" shapeRendering="crispEdges" aria-hidden className="flex-none">
      {px.map((p) => p && <rect key={`${p.x}-${p.y}`} x={p.x} y={p.y} width={1} height={1} fill="currentColor" />)}
    </svg>
  )
}

function Battery({ level, color }: { level: number | null; color: string }) {
  const lit = level == null ? 0 : litSegments(level, SEGMENTS)
  return (
    <svg width={26} height={12} viewBox="0 0 26 12" shapeRendering="crispEdges" aria-hidden className="flex-none">
      <rect x={0.5} y={0.5} width={22} height={11} fill="none" stroke="currentColor" strokeOpacity={0.6} />
      <rect x={23} y={3.5} width={2} height={5} fill="currentColor" fillOpacity={0.6} />
      {Array.from({ length: SEGMENTS }, (_, i) => (
        <rect
          // biome-ignore lint/suspicious/noArrayIndexKey: os segmentos são fixos
          key={i}
          x={2 + i * 4}
          y={2}
          width={3}
          height={8}
          fill={i < lit ? color : 'currentColor'}
          fillOpacity={i < lit ? 1 : 0.12}
        />
      ))}
    </svg>
  )
}

/**
 * Bateria em pixel art com o limite de uso do Claude que está mais perto de acabar (janela de 5 h ou
 * semana) e um mascote que muda de humor com a carga. Os detalhes ficam no tooltip.
 */
export function UsageBattery() {
  const [usage, setUsage] = useState<ClaudeUsage | null>(null)
  const [now, setNow] = useState(() => Date.now())

  useEffect(() => {
    let alive = true
    const load = () =>
      ipc
        .claudeUsage()
        .then((u) => {
          if (!alive) return
          setUsage(u)
          setNow(Date.now())
        })
        .catch(() => {})
    void load()
    const timer = window.setInterval(load, POLL_MS)
    return () => {
      alive = false
      window.clearInterval(timer)
    }
  }, [])

  const top = tightest(usage, now)
  const mood = moodOf(top?.level ?? null)
  const color = MOOD_COLOR[mood]
  const label = top ? `${top.level}%` : '—'
  const summary = top ? `Uso do Claude: ${top.level}% livre (${top.which})` : 'Uso do Claude: sem dados ainda'

  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <span
            className="inline-flex h-7 items-center gap-1.5 rounded-lg px-2 text-[11.5px] text-muted tabular-nums"
            role="img"
            aria-label={summary}
          />
        }
      >
        <span style={{ color: mood === 'unknown' ? undefined : color }}>
          <Mascot mood={mood} />
        </span>
        <Battery level={top?.level ?? null} color={color} />
        <span>{label}</span>
      </TooltipTrigger>
      <TooltipContent className={tooltip} sideOffset={6}>
        <div className="flex flex-col gap-0.5">
          {usage && (usage.fiveHour || usage.sevenDay) ? (
            <>
              <span>{describe('5 h', usage.fiveHour, now)}</span>
              <span>{describe('Semana', usage.sevenDay, now)}</span>
            </>
          ) : usage && !usage.tracking ? (
            <span>Você tem um statusLine próprio no Claude Code; o Termo não lê os limites.</span>
          ) : (
            <span>Abra o Claude Code numa aba e mande uma mensagem para ler os limites.</span>
          )}
        </div>
      </TooltipContent>
    </Tooltip>
  )
}
