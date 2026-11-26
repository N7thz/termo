import type { Progress } from '../terminal/programOsc'
import { formatSeconds, type TabFinished } from './notifications'

/** Marcas de uma aba em segundo plano; somem quando ela é aberta. */
export interface TabAlertState {
  errors: number
  warnings: number
  /** Um comando demorado terminou enquanto a aba estava escondida. */
  finished?: TabFinished
  /** Linha que disparou uma regra com a bandeira ligada (gatilho) enquanto a aba estava escondida. */
  trigger?: string
}

const CHECK = (
  <svg viewBox="0 0 16 16" width="10" height="10" aria-hidden="true">
    <path
      d="M3.5 8.5l3 3 6-7"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.2"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
)

const FLAG = (
  <svg viewBox="0 0 16 16" width="11" height="11" aria-hidden="true">
    <path
      d="M4 14V2.5M4 3h7.5l-1.8 2.8L11.5 8.5H4"
      fill="currentColor"
      fillOpacity="0.25"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinejoin="round"
      strokeLinecap="round"
    />
  </svg>
)

const CROSS = (
  <svg viewBox="0 0 16 16" width="10" height="10" aria-hidden="true">
    <path d="M4.5 4.5l7 7M11.5 4.5l-7 7" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
  </svg>
)

const PROGRESS_LABEL = { normal: 'Progresso', error: 'Erro', paused: 'Pausado', indeterminate: 'Trabalhando' } as const

/**
 * Anel de progresso mandado pelo programa da aba (OSC 9;4): cheio até o valor, girando quando o
 * programa não diz quanto falta, vermelho no erro e amarelo pausado.
 */
export function ProgressRing({ progress, colors }: { progress: Progress; colors: { red?: string; yellow?: string } }) {
  const r = 5.5
  const length = 2 * Math.PI * r
  const spin = progress.state === 'indeterminate'
  const fill = spin ? 0.3 : progress.value / 100
  const color = progress.state === 'error' ? colors.red : progress.state === 'paused' ? colors.yellow : 'var(--accent)'
  const label = `${PROGRESS_LABEL[progress.state]}${spin ? '' : ` · ${progress.value}%`}`
  return (
    <svg
      viewBox="0 0 14 14"
      width="14"
      height="14"
      className={`shrink-0 ${spin ? 'animate-spin motion-reduce:animate-none' : ''}`}
      role="img"
      aria-label={label}
    >
      <title>{label}</title>
      <circle cx="7" cy="7" r={r} fill="none" stroke="currentColor" strokeOpacity="0.18" strokeWidth="2" />
      <circle
        cx="7"
        cy="7"
        r={r}
        fill="none"
        stroke={color}
        strokeWidth="2"
        strokeLinecap="round"
        strokeDasharray={`${fill * length} ${length}`}
        transform="rotate(-90 7 7)"
        className="[transition:stroke-dasharray_240ms_ease-out] motion-reduce:transition-none"
      />
    </svg>
  )
}

/**
 * Indicador da aba em segundo plano: comando demorado que terminou (✓ verde ou ✕ vermelho), contador de
 * erros novos (vermelho) ou ponto de aviso (amarelo). As cores vêm do tema do terminal.
 */
export function TabAlert({
  alert,
  progress,
  colors,
}: {
  alert?: TabAlertState
  /** Progresso do programa da aba (OSC 9;4); aparece antes das outras marcas, mesmo com a aba aberta. */
  progress?: Progress
  colors: { red?: string; yellow?: string; green?: string }
}) {
  if (progress) {
    return (
      <>
        <ProgressRing progress={progress} colors={colors} />
        <TabAlert alert={alert} colors={colors} />
      </>
    )
  }
  if (!alert) return null
  if (alert.trigger) {
    const label = `Apareceu: ${alert.trigger}`
    return (
      <>
        <span
          className="grid size-4 shrink-0 animate-fade-in place-items-center text-accent motion-reduce:animate-none"
          title={label}
          role="img"
          aria-label={label}
        >
          {FLAG}
        </span>
        <TabAlert alert={{ ...alert, trigger: undefined }} colors={colors} />
      </>
    )
  }
  const done = alert.finished
  const doneLabel = done
    ? `${done.ok ? 'Terminou' : 'Falhou'}: ${done.command} · ${formatSeconds(done.durationMs)}`
    : ''
  const finished = done && (
    <span
      className="grid size-4 shrink-0 animate-fade-in place-items-center rounded-full motion-reduce:animate-none"
      style={{ color: done.ok ? colors.green : colors.red }}
      title={doneLabel}
      role="img"
      aria-label={doneLabel}
    >
      {done.ok ? CHECK : CROSS}
    </span>
  )
  if (alert.errors > 0) {
    return (
      <>
        {finished}
        <span
          className="min-w-4 rounded-full px-1 text-center font-mono text-[10px] leading-4 font-semibold text-white"
          style={{ background: colors.red }}
          title={`${alert.errors} erro(s) novo(s)`}
        >
          {alert.errors > 99 ? '99+' : alert.errors}
        </span>
      </>
    )
  }
  if (finished) return finished
  if (alert.warnings === 0) return null
  return (
    <span
      className="size-2 rounded-full"
      style={{ background: colors.yellow }}
      title={`${alert.warnings} aviso(s) novo(s)`}
      role="img"
      aria-label={`${alert.warnings} aviso(s) novo(s)`}
    />
  )
}
