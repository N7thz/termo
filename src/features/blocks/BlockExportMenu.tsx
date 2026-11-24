import type { ITheme } from '@xterm/xterm'
import { FileText, ImageDown, LoaderCircle, MessageSquare, X } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { ipc } from '../../lib/ipc'
import { blocksToMarkdown, blocksToText, type ExportBlock, exportFileName } from './blockExport'
import { renderBlocksPng } from './blockImage'

/** Onde o menu abre, em px dentro da área do terminal (como a prévia das imagens). */
export interface BlockExportAnchor {
  right: number
  top: number
}

type Status = { kind: 'idle' } | { kind: 'busy' } | { kind: 'done'; text: string } | { kind: 'error'; text: string }

const ITEM =
  'flex w-full items-center gap-2.5 rounded-md px-2.5 py-1.5 text-left outline-none hover:bg-surface-hover focus-visible:bg-surface-hover disabled:opacity-50'

/**
 * Exportar os blocos selecionados: copiar como Markdown, salvar como .txt ou como imagem PNG (com a fonte e
 * as cores do terminal). Salvar abre o "Salvar como" do Windows pelo backend. Esc ou clique fora fecham.
 */
export function BlockExportMenu({
  blocks,
  anchor,
  theme,
  fontFamily,
  onClose,
}: {
  blocks: readonly ExportBlock[]
  anchor: BlockExportAnchor
  theme: ITheme
  fontFamily: string
  onClose: () => void
}) {
  const [status, setStatus] = useState<Status>({ kind: 'idle' })
  const boxRef = useRef<HTMLDivElement>(null)
  const closeRef = useRef(onClose)
  closeRef.current = onClose
  const busy = status.kind === 'busy'
  const busyRef = useRef(busy)
  busyRef.current = busy

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      e.stopPropagation()
      closeRef.current()
    }
    // Enquanto o "Salvar como" está aberto, o clique fora não fecha o menu.
    const onDown = (e: PointerEvent) => {
      if (!busyRef.current && !boxRef.current?.contains(e.target as Node)) closeRef.current()
    }
    window.addEventListener('keydown', onKey, true)
    window.addEventListener('pointerdown', onDown, true)
    boxRef.current?.querySelector<HTMLButtonElement>('button[data-first]')?.focus()
    return () => {
      window.removeEventListener('keydown', onKey, true)
      window.removeEventListener('pointerdown', onDown, true)
    }
  }, [])

  const copyMarkdown = async () => {
    await ipc.writeClipboard(blocksToMarkdown(blocks))
    setStatus({ kind: 'done', text: 'Copiado como Markdown.' })
    window.setTimeout(() => closeRef.current(), 700)
  }

  const save = async (ext: 'txt' | 'png') => {
    setStatus({ kind: 'busy' })
    try {
      const data =
        ext === 'txt'
          ? new TextEncoder().encode(blocksToText(blocks))
          : await renderBlocksPng(blocks, theme, fontFamily)
      const path = await ipc.exportSave(exportFileName(blocks, ext), ext, data)
      if (path == null) return setStatus({ kind: 'idle' })
      setStatus({ kind: 'done', text: `Salvo em ${path}` })
    } catch (err) {
      setStatus({ kind: 'error', text: String(err) })
    }
  }

  const label = blocks.length === 1 ? 'Exportar o bloco' : `Exportar ${blocks.length} blocos`
  return (
    <div
      ref={boxRef}
      role="dialog"
      aria-label={label}
      className="absolute z-30 flex w-[min(300px,calc(100%-24px))] origin-top-right animate-fade-in flex-col rounded-[10px] border border-hairline bg-material-thick p-1.5 font-sans text-[12.5px] text-text shadow-pop backdrop-blur-[28px] motion-reduce:animate-none reduced-transparency:bg-surface"
      style={{ right: anchor.right, top: anchor.top }}
    >
      <div className="flex items-center gap-2 px-2.5 pt-1 pb-1.5">
        <span className="flex-1 font-semibold">{label}</span>
        <button
          type="button"
          aria-label="Fechar"
          className="grid size-6 place-items-center rounded-md text-muted hover:bg-surface-hover hover:text-text focus-visible:outline-2 focus-visible:outline-accent"
          onClick={onClose}
        >
          <X size={13} />
        </button>
      </div>
      <button type="button" data-first className={ITEM} disabled={busy} onClick={() => void copyMarkdown()}>
        <MessageSquare size={14} className="text-muted" aria-hidden />
        <span className="flex-1">Copiar como Markdown</span>
        <kbd className="font-sans text-[11px] text-muted">M</kbd>
      </button>
      <button type="button" className={ITEM} disabled={busy} onClick={() => void save('txt')}>
        <FileText size={14} className="text-muted" aria-hidden />
        <span className="flex-1">Salvar como .txt…</span>
      </button>
      <button type="button" className={ITEM} disabled={busy} onClick={() => void save('png')}>
        <ImageDown size={14} className="text-muted" aria-hidden />
        <span className="flex-1">Salvar como imagem PNG…</span>
      </button>
      {status.kind !== 'idle' && (
        <p
          role="status"
          className={`flex items-center gap-1.5 px-2.5 pt-1.5 pb-1 text-[11.5px] break-all ${status.kind === 'error' ? 'text-(--tone-red,var(--claude))' : 'text-muted'}`}
        >
          {busy && <LoaderCircle size={12} className="animate-spin motion-reduce:animate-none" aria-hidden />}
          {busy ? 'Salvando…' : status.text}
        </p>
      )}
    </div>
  )
}
