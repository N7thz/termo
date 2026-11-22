import { ImageOff, LoaderCircle, X } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { ipc } from '../../lib/ipc'

/** Onde o popover abre, em px dentro da área do terminal: alinhado à direita do botão, embaixo dele. */
export interface ImagePreviewAnchor {
  right: number
  top: number
}

type Thumb = { state: 'loading' } | { state: 'ok'; src: string; bytes: number } | { state: 'error'; message: string }

const fileName = (path: string) => path.split(/[\\/]/).pop() ?? path
const size = (bytes: number) =>
  bytes < 1024
    ? `${bytes} B`
    : bytes < 1024 * 1024
      ? `${Math.round(bytes / 1024)} KB`
      : `${(bytes / 1024 / 1024).toFixed(1)} MB`

/**
 * Miniaturas das imagens citadas por um comando (botão da imagem na barra do bloco). Cada uma é lida
 * pelo backend quando o popover abre; o clique abre no visualizador padrão do Windows.
 * Esc ou clique fora fecham.
 */
export function ImagePreview({
  paths,
  anchor,
  onClose,
}: {
  paths: readonly string[]
  anchor: ImagePreviewAnchor
  onClose: () => void
}) {
  const [thumbs, setThumbs] = useState<Record<string, Thumb>>({})
  const boxRef = useRef<HTMLDivElement>(null)
  const closeRef = useRef(onClose)
  closeRef.current = onClose

  useEffect(() => {
    let alive = true
    setThumbs(Object.fromEntries(paths.map((p) => [p, { state: 'loading' } as Thumb])))
    for (const p of paths) {
      ipc.imagePreview(p).then(
        (r) => alive && setThumbs((t) => ({ ...t, [p]: { state: 'ok', src: r.dataUrl, bytes: r.bytes } })),
        (e) => alive && setThumbs((t) => ({ ...t, [p]: { state: 'error', message: String(e) } })),
      )
    }
    return () => {
      alive = false
    }
  }, [paths])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && closeRef.current()
    const onDown = (e: PointerEvent) => {
      if (!boxRef.current?.contains(e.target as Node)) closeRef.current()
    }
    window.addEventListener('keydown', onKey, true)
    window.addEventListener('pointerdown', onDown, true)
    boxRef.current?.focus()
    return () => {
      window.removeEventListener('keydown', onKey, true)
      window.removeEventListener('pointerdown', onDown, true)
    }
  }, [])

  return (
    <div
      ref={boxRef}
      role="dialog"
      aria-label="Imagens do comando"
      tabIndex={-1}
      className="absolute z-30 flex max-h-[min(440px,70%)] w-[min(392px,calc(100%-24px))] origin-top-right animate-fade-in flex-col rounded-[10px] border border-hairline bg-material-thick font-sans text-[12px] text-text shadow-pop outline-none backdrop-blur-[28px] motion-reduce:animate-none reduced-transparency:bg-surface"
      style={{ right: anchor.right, top: anchor.top }}
    >
      <div className="flex flex-none items-center gap-2 px-3 pt-2.5 pb-2">
        <span className="flex-1 font-semibold">
          {paths.length === 1 ? '1 imagem' : `${paths.length} imagens`}
          <span className="pl-1.5 font-normal text-muted">· clique para abrir</span>
        </span>
        <button
          type="button"
          aria-label="Fechar"
          className="grid size-6 place-items-center rounded-md text-muted hover:bg-surface-hover hover:text-text focus-visible:outline-2 focus-visible:outline-accent"
          onClick={onClose}
        >
          <X size={13} />
        </button>
      </div>
      <div className="grid min-h-0 grid-cols-3 gap-2 overflow-y-auto px-3 pb-3">
        {paths.map((p) => {
          const t = thumbs[p] ?? { state: 'loading' }
          return (
            <button
              key={p}
              type="button"
              title={t.state === 'error' ? `${p}\n${t.message}` : p}
              className="group flex min-w-0 flex-col gap-1 rounded-lg p-1 text-left outline-none hover:bg-surface-hover focus-visible:outline-2 focus-visible:outline-accent"
              onClick={() => void ipc.imageOpen(p).catch(() => undefined)}
            >
              <span className="grid aspect-square w-full place-items-center overflow-hidden rounded-md border border-hairline bg-bg">
                {t.state === 'ok' ? (
                  <img src={t.src} alt="" className="size-full object-contain" draggable={false} />
                ) : t.state === 'loading' ? (
                  <LoaderCircle aria-hidden size={16} className="animate-spin text-muted motion-reduce:animate-none" />
                ) : (
                  <ImageOff aria-hidden size={16} className="text-muted" />
                )}
              </span>
              <span className="truncate px-0.5 text-[11.5px]">{fileName(p)}</span>
              {t.state === 'ok' && <span className="px-0.5 text-[10.5px] text-muted">{size(t.bytes)}</span>}
            </button>
          )
        })}
      </div>
    </div>
  )
}
