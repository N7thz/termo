import { type KeyboardEvent, type PointerEvent, useCallback, useState } from 'react'

/** Largura guardada no navegador (por janela não faz diferença: é preferência de layout). */
export function useStoredWidth(key: string, fallback: number, min: number) {
  const [width, setWidth] = useState(() => {
    try {
      const n = Number(localStorage.getItem(key))
      return Number.isFinite(n) && n >= min ? n : fallback
    } catch {
      return fallback
    }
  })
  const commit = useCallback(
    (value: number) => {
      setWidth(value)
      try {
        localStorage.setItem(key, String(Math.round(value)))
      } catch {}
    },
    [key],
  )
  return [width, setWidth, commit] as const
}

type Props = {
  /** Borda do cartão onde fica a alça: `right` na lateral, `left` nos painéis da direita. */
  side: 'left' | 'right'
  label: string
  width: number
  min: number
  /** Máximo calculado na hora, para acompanhar o tamanho da janela. */
  max: () => number
  fallback: number
  /** Durante o arraste (atualiza a tela). */
  onWidth: (width: number) => void
  /** Ao soltar, nas setas e no duplo clique (grava). */
  onCommit: (width: number) => void
  onDragging?: (dragging: boolean) => void
}

const STEP = 16

/**
 * Alça de redimensionar na borda de um cartão: acompanha o ponteiro 1:1 com captura, respeita mínimo e
 * máximo, aceita setas do teclado (Shift = passo maior) e volta ao padrão com duplo clique.
 */
export function ResizeEdge({ side, label, width, min, max, fallback, onWidth, onCommit, onDragging }: Props) {
  const clamp = (n: number) => Math.round(Math.min(Math.max(min, max()), Math.max(min, n)))

  const start = (e: PointerEvent<HTMLDivElement>) => {
    const host = e.currentTarget.parentElement
    if (!host || e.button !== 0) return
    e.preventDefault()
    e.currentTarget.setPointerCapture(e.pointerId)
    const rect = host.getBoundingClientRect()
    const at = (x: number) => clamp(side === 'right' ? x - rect.left : rect.right - x)
    let last = width
    onDragging?.(true)
    document.body.style.cursor = 'col-resize'
    const move = (ev: globalThis.PointerEvent) => {
      last = at(ev.clientX)
      onWidth(last)
    }
    const up = () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
      document.body.style.cursor = ''
      onDragging?.(false)
      onCommit(last)
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
  }

  const key = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return
    e.preventDefault()
    const grow = (e.key === 'ArrowRight') === (side === 'right')
    const step = e.shiftKey ? STEP * 4 : STEP
    onCommit(clamp(width + (grow ? step : -step)))
  }

  return (
    // biome-ignore lint/a11y/useSemanticElements: alça arrastável; um <hr> não recebe ponteiro nem foco assim.
    <div
      role="separator"
      aria-orientation="vertical"
      aria-label={label}
      aria-valuenow={Math.round(width)}
      aria-valuemin={min}
      tabIndex={0}
      title={`${label} (duplo clique volta ao padrão)`}
      className={`group/edge absolute inset-y-3 z-10 flex w-2 cursor-col-resize outline-none ${
        side === 'right' ? 'right-0 justify-end' : 'left-0 justify-start'
      }`}
      onPointerDown={start}
      onKeyDown={key}
      onDoubleClick={() => onCommit(clamp(fallback))}
    >
      <span className="h-full w-0.5 rounded-full bg-accent opacity-0 transition-opacity duration-150 group-hover/edge:opacity-60 group-focus-visible/edge:opacity-100 group-active/edge:opacity-100" />
    </div>
  )
}
