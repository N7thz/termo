import { useState } from 'react'
import { resolveTyped, type Target } from './quickSelect'

/** Onde fica a grade de células do xterm dentro do painel (px). */
export interface CellGeometry {
  left: number
  top: number
  cellW: number
  cellH: number
}

interface Props {
  targets: Target[]
  geometry: CellGeometry
  /** Rótulo completo: `insert` quando foi digitado com Shift (vai para a linha de comando). */
  onPick: (target: Target, insert: boolean) => void
  onClose: () => void
}

/**
 * Rótulos da seleção rápida sobre a tela do terminal. Cada alvo ganha um fundo no tom de destaque e o
 * rótulo por cima das primeiras letras; o teclado fica aqui até escolher, Esc ou clicar fora.
 */
export function QuickSelectOverlay({ targets, geometry: g, onPick, onClose }: Props) {
  const [typed, setTyped] = useState('')
  const [shift, setShift] = useState(false)
  const [miss, setMiss] = useState(false)

  const onKeyDown = (e: React.KeyboardEvent) => {
    e.preventDefault()
    e.stopPropagation()
    if (e.key === 'Escape') return onClose()
    if (e.key === 'Backspace') {
      setTyped((t) => t.slice(0, -1))
      return
    }
    if (!/^[a-z]$/i.test(e.key) || e.ctrlKey || e.altKey || e.metaKey) return
    const next = typed + e.key.toLowerCase()
    const insert = shift || e.shiftKey
    const hit = resolveTyped(targets, next)
    if (hit === 'more') {
      setTyped(next)
      setShift(insert)
      setMiss(false)
    } else if (hit) {
      onPick(hit, insert)
    } else {
      setMiss(true)
      setTyped('')
      setShift(false)
    }
  }

  const fontSize = Math.max(9, Math.round(g.cellH * 0.62))
  return (
    <div
      ref={(el) => el?.focus({ preventScroll: true })}
      tabIndex={-1}
      role="application"
      aria-label={`Seleção rápida: ${targets.length} itens. Digite o rótulo para copiar; com Shift, para pôr na linha de comando. Esc sai.`}
      className="absolute inset-0 z-20 outline-none"
      onKeyDown={onKeyDown}
      onBlur={onClose}
      onMouseDown={(e) => {
        e.preventDefault()
        onClose()
      }}
    >
      {targets.map((t) => {
        const dim = typed !== '' && !t.label.startsWith(typed)
        // Letras já digitadas do rótulo ficam apagadas.
        const done = dim ? 0 : typed.length
        return t.segments.map((s, i) => (
          <span
            key={`${t.label}-${s.row}-${s.from}`}
            aria-hidden
            className={`pointer-events-none absolute rounded-[3px] [transition:opacity_120ms_ease-out] ${dim ? 'opacity-25' : ''}`}
            style={{
              left: g.left + s.from * g.cellW,
              top: g.top + s.row * g.cellH,
              width: (s.to - s.from + 1) * g.cellW,
              height: g.cellH,
              background: 'color-mix(in srgb, var(--accent) 22%, transparent)',
              boxShadow: 'inset 0 -1px 0 color-mix(in srgb, var(--accent) 70%, transparent)',
            }}
          >
            {i === 0 && (
              <span
                className="absolute top-0 left-0 flex h-full items-center rounded-[3px] bg-accent px-[3px] font-mono font-semibold text-on-accent shadow-tip"
                style={{ fontSize, lineHeight: 1 }}
              >
                <span className="opacity-50">{t.label.slice(0, done)}</span>
                {t.label.slice(done)}
              </span>
            )}
          </span>
        ))
      })}
      <div
        role="status"
        className="pointer-events-none absolute top-2 left-1/2 -translate-x-1/2 animate-pop-in rounded-md border border-hairline bg-surface px-2.5 py-1 text-[12px] text-muted shadow-tip motion-reduce:animate-none"
      >
        {miss ? (
          <span className="text-(--tone-red,var(--claude))">Nenhum rótulo com essas letras</span>
        ) : (
          <>
            <kbd className="font-mono text-text">a</kbd> copia · <kbd className="font-mono text-text">Shift+A</kbd> põe
            na linha · <kbd className="font-mono text-text">Esc</kbd> sai
          </>
        )}
      </div>
    </div>
  )
}
