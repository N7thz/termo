import { Dialog, DialogBackdrop, DialogContent, DialogTitle } from '@ui-sdk/react/dialog'
import { useEffect, useState } from 'react'
import { MAX_TAB_NOTE } from '../tabs/tabs'

interface Props {
  /** Aba cuja nota está sendo editada; `null` fecha. */
  tab: { key: number; label: string; note?: string } | null
  onClose: () => void
  /** Grava a nota (`null` apaga). */
  onSave: (key: number, note: string | null) => void
}

const PANEL =
  'fixed inset-x-0 top-[12vh] bottom-auto mx-auto my-0 flex h-fit w-[min(520px,calc(100vw-48px))] origin-top flex-col overflow-hidden rounded-[14px] border border-hairline bg-material-thick p-0 text-text shadow-panel backdrop-blur-[28px] backdrop-saturate-180 [transition:opacity_140ms_ease-out,scale_220ms_var(--spring-soft)] data-ending-style:scale-[0.98] data-ending-style:opacity-0 data-starting-style:scale-[0.98] data-starting-style:opacity-0 reduced-transparency:bg-surface reduced-transparency:backdrop-blur-none motion-reduce:scale-100'
const FIELD =
  'w-full resize-y rounded-[7px] border border-border bg-field px-[9px] py-[7px] font-mono text-[12.5px] leading-[1.5] text-text [transition:border-color_140ms_ease-out,box-shadow_200ms_ease-out] placeholder:text-muted focus-visible:border-accent focus-visible:shadow-[0_0_0_3px_color-mix(in_srgb,var(--accent)_25%,transparent)] focus-visible:outline-none'
const BUTTON =
  'inline-flex h-7 cursor-pointer items-center gap-1.5 rounded-md px-2.5 text-[12px] text-muted hover:bg-surface-hover hover:text-text focus-visible:outline-2 focus-visible:outline-accent disabled:cursor-default disabled:opacity-40 disabled:hover:bg-transparent disabled:hover:text-muted'
const PRIMARY = `${BUTTON} bg-accent text-on-accent hover:bg-accent hover:text-on-accent`

/**
 * Nota da aba: progresso, decisões, o que falta. O Claude da aba escreve nela com `termo nota`;
 * aqui a pessoa lê e edita. Ctrl+Enter salva.
 */
export function NoteDialog({ tab, onClose, onSave }: Props) {
  const [text, setText] = useState('')

  // Carrega a nota só ao abrir (ou trocar de aba): o `tab` muda a cada render e apagaria o que se digita.
  const openKey = tab?.key ?? null
  // biome-ignore lint/correctness/useExhaustiveDependencies: só ao abrir; `tab.note` lido naquele momento
  useEffect(() => {
    if (tab) setText(tab.note ?? '')
  }, [openKey])

  const save = () => {
    if (!tab) return
    onSave(tab.key, text.trim() ? text : null)
    onClose()
  }

  return (
    <Dialog open={tab != null} onOpenChange={(o) => !o && onClose()}>
      <DialogBackdrop className="fixed inset-0 bg-black/30 transition-opacity duration-150 data-ending-style:opacity-0 data-starting-style:opacity-0" />
      <DialogContent className={PANEL}>
        <DialogTitle className="m-0 truncate border-b border-hairline px-4 py-3 text-[13.5px] font-semibold">
          Nota · {tab?.label}
        </DialogTitle>
        <form
          className="flex flex-col gap-2 px-4 py-3"
          onSubmit={(e) => {
            e.preventDefault()
            save()
          }}
        >
          <textarea
            autoFocus
            className={FIELD}
            rows={8}
            value={text}
            maxLength={MAX_TAB_NOTE}
            spellCheck={false}
            aria-label="Texto da nota"
            placeholder={
              'O que esta aba está fazendo, o que já foi decidido, o que falta.\nO Claude da aba também escreve aqui com termo nota.'
            }
            onChange={(e) => setText(e.currentTarget.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
                e.preventDefault()
                save()
              }
            }}
          />
          <div className="flex items-center gap-2">
            <span className="flex-1 text-[11.5px] text-muted tabular-nums">
              {text.length}/{MAX_TAB_NOTE} · Ctrl+Enter salva
            </span>
            {tab?.note && (
              <button
                type="button"
                className={BUTTON}
                onClick={() => {
                  onSave(tab.key, null)
                  onClose()
                }}
              >
                Apagar
              </button>
            )}
            <button type="button" className={BUTTON} onClick={onClose}>
              Cancelar
            </button>
            <button type="submit" className={PRIMARY}>
              Salvar
            </button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}
