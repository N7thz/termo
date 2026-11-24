import { formatSeconds, type TabFinished } from './notifications'

/** Marcas de uma aba em segundo plano; somem quando ela é aberta. */
export interface TabAlertState {
  errors: number
  warnings: number
  /** Um comando demorado terminou enquanto a aba estava escondida. */
  finished?: TabFinished
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

const CROSS = (
  <svg viewBox="0 0 16 16" width="10" height="10" aria-hidden="true">
    <path d="M4.5 4.5l7 7M11.5 4.5l-7 7" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
  </svg>
)

/**
 * Indicador da aba em segundo plano: comando demorado que terminou (✓ verde ou ✕ vermelho), contador de
 * erros novos (vermelho) ou ponto de aviso (amarelo). As cores vêm do tema do terminal.
 */
export function TabAlert({
  alert,
  colors,
}: {
  alert?: TabAlertState
  colors: { red?: string; yellow?: string; green?: string }
}) {
  if (!alert) return null
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
