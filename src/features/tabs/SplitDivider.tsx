import type { PointerEvent } from 'react'

/**
 * Divisor da tela dividida: um fio de 1px com uma área de 8px para arrastar. Acompanha o ponteiro 1:1
 * (com captura, continua mesmo saindo do fio) e fica entre 20% e 80%. Duplo clique volta a 50%.
 */
export function SplitDivider({ ratio, onRatio }: { ratio: number; onRatio: (ratio: number) => void }) {
  const start = (e: PointerEvent<HTMLDivElement>) => {
    const host = e.currentTarget.parentElement
    if (!host) return
    e.preventDefault()
    e.currentTarget.setPointerCapture(e.pointerId)
    const rect = host.getBoundingClientRect()
    const move = (ev: globalThis.PointerEvent) => onRatio((ev.clientX - rect.left) / rect.width)
    const up = () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
  }

  return (
    // biome-ignore lint/a11y/useSemanticElements: divisor arrastável; um <hr> não recebe ponteiro assim.
    <div
      role="separator"
      aria-orientation="vertical"
      aria-label="Redimensionar a tela dividida"
      aria-valuenow={Math.round(ratio * 100)}
      tabIndex={-1}
      className="group/split absolute inset-y-0 z-5 flex w-2 -translate-x-1/2 cursor-col-resize justify-center"
      style={{ left: `${ratio * 100}%` }}
      onPointerDown={start}
      onDoubleClick={() => onRatio(0.5)}
    >
      <span className="h-full w-px bg-hairline [transition:background-color_140ms_ease-out,width_140ms_ease-out] group-hover/split:w-0.5 group-hover/split:bg-accent group-active/split:bg-accent" />
    </div>
  )
}
