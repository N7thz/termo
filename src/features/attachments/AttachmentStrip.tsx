import { FileText, ImageOff, LoaderCircle, X } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { ipc } from '../../lib/ipc'
import { type Attachment, fileName } from './attachments'

type Thumb = { state: 'ok'; src: string } | { state: 'error' }

/**
 * Faixa acima da linha de comando com os arquivos que entraram nela (imagem colada ou arquivos
 * arrastados). Imagens mostram a miniatura; o clique abre no visualizador do Windows. O X só
 * dispensa a prévia: o caminho já escrito na linha continua lá.
 */
export function AttachmentStrip({
  items,
  error,
  onDismiss,
  onDismissError,
}: {
  items: readonly Attachment[]
  /** Aviso curto (falha ao salvar a imagem colada, por exemplo). */
  error: string | null
  onDismiss: (path: string) => void
  onDismissError: () => void
}) {
  const [thumbs, setThumbs] = useState<Record<string, Thumb>>({})
  // Cada imagem é lida uma vez só; o resultado fica mesmo que a faixa mude no meio da leitura.
  const requested = useRef(new Set<string>())
  const mounted = useRef(true)
  useEffect(
    () => () => {
      mounted.current = false
    },
    [],
  )

  useEffect(() => {
    for (const a of items) {
      if (!a.image || requested.current.has(a.path)) continue
      requested.current.add(a.path)
      ipc.imagePreview(a.path).then(
        (r) => mounted.current && setThumbs((t) => ({ ...t, [a.path]: { state: 'ok', src: r.dataUrl } })),
        () => mounted.current && setThumbs((t) => ({ ...t, [a.path]: { state: 'error' } })),
      )
    }
  }, [items])

  if (items.length === 0 && !error) return null

  return (
    <section
      className="flex flex-none animate-fade-in items-center gap-1.5 overflow-x-auto pt-1.5 pb-1 [scrollbar-width:thin] motion-reduce:animate-none"
      aria-label="Arquivos na linha de comando"
    >
      {items.map((a) => {
        const thumb = thumbs[a.path]
        return (
          <div
            key={a.path}
            className="group relative flex h-12 max-w-52 flex-none items-center gap-2 rounded-[9px] border border-hairline bg-surface pr-6 pl-1 text-[12px] text-muted shadow-[inset_0_1px_0_var(--highlight)]"
            title={a.path}
          >
            <button
              type="button"
              className="flex min-w-0 items-center gap-2 rounded-md outline-none focus-visible:outline-2 focus-visible:outline-accent"
              aria-label={a.image ? `Abrir ${fileName(a.path)} no visualizador` : fileName(a.path)}
              onClick={() => a.image && void ipc.imageOpen(a.path).catch(() => undefined)}
            >
              <span className="grid size-10 flex-none place-items-center overflow-hidden rounded-[6px] bg-field">
                {!a.image ? (
                  <FileText aria-hidden size={16} />
                ) : thumb?.state === 'ok' ? (
                  <img src={thumb.src} alt="" className="size-full object-cover" draggable={false} />
                ) : thumb?.state === 'error' ? (
                  <ImageOff aria-hidden size={16} />
                ) : (
                  <LoaderCircle aria-hidden size={15} className="animate-spin motion-reduce:animate-none" />
                )}
              </span>
              <span className="truncate text-text">{fileName(a.path)}</span>
            </button>
            <button
              type="button"
              className="absolute top-1 right-1 grid size-4.5 place-items-center rounded text-muted opacity-70 outline-none hover:bg-surface-hover hover:text-text hover:opacity-100 focus-visible:opacity-100 focus-visible:outline-2 focus-visible:outline-accent"
              aria-label={`Dispensar a prévia de ${fileName(a.path)}`}
              onClick={() => onDismiss(a.path)}
            >
              <X aria-hidden size={11} />
            </button>
          </div>
        )
      })}
      {error && (
        <p
          className="m-0 flex flex-none items-center gap-1.5 rounded-[9px] border border-hairline bg-surface px-2 py-1 text-[12px] text-claude"
          role="alert"
        >
          {error}
          <button
            type="button"
            className="grid size-4.5 place-items-center rounded text-muted outline-none hover:text-text focus-visible:outline-2 focus-visible:outline-accent"
            aria-label="Fechar o aviso"
            onClick={onDismissError}
          >
            <X aria-hidden size={11} />
          </button>
        </p>
      )}
    </section>
  )
}
