import type { PointerEvent } from 'react'
import type { Rect, SplitDir } from './splitTree'

/**
 * Divisor de uma divisão da tela: um fio de 1px com uma área de 8px para arrastar. `rect` é o espaço da
 * divisão inteira (em frações do cartão) e o fio fica em `ratio` dele: em pé quando os painéis estão lado
 * a lado (`row`), deitado quando um está em cima do outro (`col`). Acompanha o ponteiro 1:1 (com captura,
 * continua mesmo saindo do fio) e fica entre 10% e 90%. Duplo clique volta a 50%.
 */
export function SplitDivider({
  dir,
  rect,
  ratio,
  onRatio,
}: {
  dir: SplitDir
  rect: Rect
  ratio: number
  onRatio: (ratio: number) => void
}) {
  const row = dir === 'row'
  const start = (e: PointerEvent<HTMLDivElement>) => {
    const host = e.currentTarget.parentElement
    if (!host) return
    e.preventDefault()
    e.currentTarget.setPointerCapture(e.pointerId)
    const box = host.getBoundingClientRect()
    const move = (ev: globalThis.PointerEvent) =>
      onRatio(
        row
          ? ((ev.clientX - box.left) / box.width - rect.x) / rect.w
          : ((ev.clientY - box.top) / box.height - rect.y) / rect.h,
      )
    const up = () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
  }

  const pct = (n: number) => `${n * 100}%`
  const style = row
    ? { left: pct(rect.x + rect.w * ratio), top: pct(rect.y), height: pct(rect.h) }
    : { top: pct(rect.y + rect.h * ratio), left: pct(rect.x), width: pct(rect.w) }

  return (
    // biome-ignore lint/a11y/useSemanticElements: divisor arrastável; um <hr> não recebe ponteiro assim.
    <div
      role="separator"
      aria-orientation={row ? 'vertical' : 'horizontal'}
      aria-label="Redimensionar a tela dividida"
      aria-valuenow={Math.round(ratio * 100)}
      tabIndex={-1}
      className={`group/split absolute z-5 flex justify-center ${
        row ? 'w-2 -translate-x-1/2 cursor-col-resize' : 'h-2 -translate-y-1/2 cursor-row-resize flex-col'
      }`}
      style={style}
      onPointerDown={start}
      onDoubleClick={() => onRatio(0.5)}
    >
      <span
        className={`bg-hairline [transition:background-color_140ms_ease-out,width_140ms_ease-out,height_140ms_ease-out] group-hover/split:bg-accent group-active/split:bg-accent ${
          row ? 'h-full w-px group-hover/split:w-0.5' : 'h-px w-full group-hover/split:h-0.5'
        }`}
      />
    </div>
  )
}
