import type { Terminal } from '@xterm/xterm'
import { useEffect, useMemo, useState } from 'react'
import { type BufferView, type CopyState, copyModeKey, scrollFor, selectionRange, selectLength } from './copyMode'
import type { CellGeometry } from './QuickSelectOverlay'

interface Props {
  term: Terminal
  geometry: CellGeometry
  /** Saiu do modo: com o texto copiado, ou `null` (Esc, clique fora). */
  onDone: (copied: string | null) => void
}

/** O buffer do xterm na forma que o `copyMode` entende (uma célula por caractere). */
function bufferView(term: Terminal): BufferView {
  const buf = term.buffer.active
  return {
    length: buf.length,
    cols: term.cols,
    rows: term.rows,
    text: (row) => {
      const line = buf.getLine(row)
      if (!line) return ''
      let out = ''
      for (let col = 0; col < term.cols; col++) {
        const cell = line.getCell(col)
        // Caractere largo: a segunda célula vira espaço, para as colunas baterem com a tela.
        out += cell ? (cell.getChars() || ' ').slice(0, 1) : ' '
      }
      return out
    },
  }
}

/**
 * Modo de cópia: cursor próprio (um bloco no tom de destaque) andando pela saída e pelo histórico,
 * seleção desenhada pelo próprio xterm e uma faixa com as teclas. A rolagem segue o cursor.
 */
export function CopyModeOverlay({ term, geometry: g, onDone }: Props) {
  const view = useMemo(() => bufferView(term), [term])
  const [state, setState] = useState<CopyState>(() => {
    const buf = term.buffer.active
    const cursorRow = buf.baseY + buf.cursorY
    // Com a tela rolada para cima, começa na última linha visível em vez de pular para o fim.
    const visible = cursorRow >= buf.viewportY && cursorRow < buf.viewportY + term.rows
    return {
      cursor: visible ? { row: cursorRow, col: buf.cursorX } : { row: buf.viewportY + term.rows - 1, col: 0 },
      anchor: null,
      lines: false,
    }
  })
  // A rolagem pelo mouse também redesenha o cursor no lugar certo.
  const [, setTick] = useState(0)
  useEffect(() => {
    const d = term.onScroll(() => setTick((t) => t + 1))
    return () => d.dispose()
  }, [term])

  // Seleção do xterm acompanha a do modo; rolagem segue o cursor.
  useEffect(() => {
    const range = selectionRange(state)
    if (!range) term.clearSelection()
    else if (state.lines) term.selectLines(range.start.row, range.end.row)
    else term.select(range.start.col, range.start.row, selectLength(range.start, range.end, term.cols))
    const buf = term.buffer.active
    const top = scrollFor(state.cursor.row, buf.viewportY, term.rows)
    if (top !== buf.viewportY) term.scrollToLine(top)
  }, [state, term])

  const finish = (copy: boolean) => {
    const text = copy ? term.getSelection() : ''
    term.clearSelection()
    onDone(copy && text ? text : null)
  }

  const onKeyDown = (e: React.KeyboardEvent) => {
    e.preventDefault()
    e.stopPropagation()
    const action = copyModeKey(state, e, view)
    if (action.type === 'move') setState(action.state)
    else if (action.type === 'copy') finish(true)
    else if (action.type === 'exit') finish(false)
  }

  const viewportY = term.buffer.active.viewportY
  const row = state.cursor.row - viewportY
  const selecting = state.anchor != null
  return (
    <div
      ref={(el) => el?.focus({ preventScroll: true })}
      tabIndex={-1}
      role="application"
      aria-label="Modo de cópia: setas ou h j k l andam, w b e por palavra, v seleciona, V por linhas, y copia, Esc sai."
      className="pointer-events-none absolute inset-0 z-20 outline-none"
      onKeyDown={onKeyDown}
      onBlur={() => finish(false)}
    >
      {row >= 0 && row < term.rows && (
        <span
          aria-hidden
          className="absolute rounded-[2px] border-2 border-accent bg-[color-mix(in_srgb,var(--accent)_35%,transparent)] motion-safe:[transition:left_60ms_ease-out,top_60ms_ease-out]"
          style={{
            left: g.left + state.cursor.col * g.cellW,
            top: g.top + row * g.cellH,
            width: g.cellW,
            height: g.cellH,
          }}
        />
      )}
      <div
        role="status"
        className="absolute right-3 bottom-3 flex animate-pop-in items-center gap-2 rounded-md border border-hairline bg-surface px-2.5 py-1 text-[12px] text-muted shadow-tip motion-reduce:animate-none"
      >
        <span className="font-[560] text-text">
          {selecting ? (state.lines ? 'Selecionando linhas' : 'Selecionando') : 'Modo de cópia'}
        </span>
        <span>
          <kbd className="font-mono text-text">v</kbd> seleciona · <kbd className="font-mono text-text">V</kbd> linhas ·{' '}
          <kbd className="font-mono text-text">y</kbd> copia · <kbd className="font-mono text-text">Esc</kbd>{' '}
          {selecting ? 'desfaz' : 'sai'}
        </span>
      </div>
    </div>
  )
}
