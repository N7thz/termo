import {
  ScrollArea,
  ScrollAreaContent,
  ScrollAreaCorner,
  ScrollAreaScrollbar,
  ScrollAreaThumb,
  ScrollAreaViewport,
} from '@ui-sdk/react/scroll-area'
import type { PointerEventHandler, ReactNode, Ref, UIEventHandler } from 'react'

// Barra fina sobre a borda do conteúdo: aparece com o ponteiro em cima ou rolando (o padrão `hover`),
// na cor das bordas do tema, e engrossa um pouco sob o ponteiro para ficar fácil de pegar.
const SCROLLBAR =
  'z-10 flex touch-none p-[3px] opacity-0 select-none [transition:opacity_180ms_ease-out,padding_120ms_ease-out] data-visible:opacity-100 motion-reduce:transition-none data-[orientation=horizontal]:h-[11px] data-[orientation=horizontal]:flex-col data-[orientation=vertical]:w-[11px] hover:p-[2px] data-dragging:p-[2px]'
const THUMB =
  'rounded-full bg-[color-mix(in_srgb,var(--text)_22%,transparent)] [transition:background-color_140ms_ease-out] hover:bg-[color-mix(in_srgb,var(--text)_38%,transparent)] data-dragging:bg-[color-mix(in_srgb,var(--text)_46%,transparent)] data-[orientation=horizontal]:h-full data-[orientation=vertical]:w-full'

interface Props {
  /** Tamanho e posição da área (ex.: `min-h-0 flex-1`, `absolute inset-0`). */
  className?: string
  /** O próprio rolador: por padrão ocupa o que sobra da área; num menu, leva a altura máxima. */
  viewportClassName?: string
  /** Disposição e espaçamento do conteúdo (ex.: `flex flex-col gap-3 px-4 py-3`). */
  contentClassName?: string
  /** O elemento que rola de verdade (scrollTop, scrollIntoView, querySelector). */
  viewportRef?: Ref<HTMLDivElement>
  onScroll?: UIEventHandler<HTMLDivElement>
  onPointerLeave?: PointerEventHandler<HTMLDivElement>
  /** Também rola na horizontal, com a barra de baixo. */
  horizontal?: boolean
  /** Nome da região para leitores de tela (só nas áreas grandes, como páginas). */
  label?: string
  /** `aria-live` do conteúdo (ex.: a resposta da IA chegando). */
  live?: 'polite'
  children: ReactNode
}

/**
 * Área com rolagem do app, com as barras do UI SDK (ScrollArea) no visual do tema. O navegador continua
 * rolando: roda, teclado, toque e a busca da página funcionam como antes.
 */
export function Scroller({
  className = '',
  viewportClassName = 'min-h-0 flex-1',
  contentClassName,
  viewportRef,
  onScroll,
  onPointerLeave,
  horizontal = false,
  label,
  live,
  children,
}: Props) {
  return (
    // Coluna flexível: o rolador ocupa o que sobra da área (ou só o que precisa, até a altura dela).
    <ScrollArea className={`flex flex-col ${className}`} onPointerLeave={onPointerLeave}>
      <ScrollAreaViewport
        ref={viewportRef}
        className={`outline-none ${viewportClassName}`}
        onScroll={onScroll}
        role={label ? 'region' : undefined}
        aria-label={label}
      >
        <ScrollAreaContent className={contentClassName} aria-live={live}>
          {children}
        </ScrollAreaContent>
      </ScrollAreaViewport>
      <ScrollAreaScrollbar orientation="vertical" className={SCROLLBAR}>
        <ScrollAreaThumb className={THUMB} />
      </ScrollAreaScrollbar>
      {horizontal && (
        <>
          <ScrollAreaScrollbar orientation="horizontal" className={SCROLLBAR}>
            <ScrollAreaThumb className={THUMB} />
          </ScrollAreaScrollbar>
          <ScrollAreaCorner />
        </>
      )}
    </ScrollArea>
  )
}
