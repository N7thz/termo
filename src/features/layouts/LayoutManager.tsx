import { Dialog, DialogBackdrop, DialogContent, DialogTitle } from '@ui-sdk/react/dialog'
import { LayoutGrid, Pencil, Play, Plus, Trash2 } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Scroller } from '../../lib/Scroller'
import type { SavedLayout } from '../../shared/types'
import { TabKindIcon } from '../tabs/TabKindIcon'
import {
  deleteLayout,
  MAX_LAYOUT_COMMAND,
  MAX_LAYOUT_NAME,
  MAX_LAYOUTS,
  renameLayout,
  saveLayout,
  validateCommand,
  validateLayoutName,
} from './layouts'

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  layouts: readonly SavedLayout[]
  /** O perfil atual como layout (sem nome), com os comandos já guardados nas abas; `null` sem abas. */
  current: SavedLayout | null
  /** Começa já na tela de salvar (atalho "Salvar o layout atual"). */
  startSaving: boolean
  onChange: (layouts: SavedLayout[]) => void
  onOpenLayout: (layout: SavedLayout) => void
}

const PANEL =
  'fixed inset-x-0 top-[10vh] bottom-auto mx-auto my-0 flex h-fit max-h-[min(620px,80vh)] w-[min(640px,calc(100vw-48px))] origin-top flex-col overflow-hidden rounded-[14px] border border-hairline bg-material-thick p-0 text-text shadow-panel backdrop-blur-[28px] backdrop-saturate-180 [transition:opacity_140ms_ease-out,scale_220ms_var(--spring-soft)] data-ending-style:scale-[0.98] data-ending-style:opacity-0 data-starting-style:scale-[0.98] data-starting-style:opacity-0 reduced-transparency:bg-surface reduced-transparency:backdrop-blur-none motion-reduce:scale-100'
const FIELD =
  'w-full rounded-[7px] border border-border bg-field px-[9px] py-[6px] text-[13px] text-text [transition:border-color_140ms_ease-out,box-shadow_200ms_ease-out] placeholder:text-muted focus-visible:border-accent focus-visible:shadow-[0_0_0_3px_color-mix(in_srgb,var(--accent)_25%,transparent)] focus-visible:outline-none'
const BUTTON =
  'inline-flex h-7 cursor-pointer items-center gap-1.5 rounded-md px-2 text-[12px] text-muted hover:bg-surface-hover hover:text-text focus-visible:outline-2 focus-visible:outline-accent disabled:cursor-default disabled:opacity-40 disabled:hover:bg-transparent disabled:hover:text-muted'
const PRIMARY = `${BUTTON} bg-accent text-on-accent hover:bg-accent hover:text-on-accent`

type Mode = { kind: 'list' } | { kind: 'save'; draft: SavedLayout; name: string } | { kind: 'rename'; index: number }

/** Layouts salvos: abrir, salvar o do perfil atual (com um comando inicial por aba), renomear e excluir. */
export function LayoutManager({ open, onOpenChange, layouts, current, startSaving, onChange, onOpenLayout }: Props) {
  const [mode, setMode] = useState<Mode>({ kind: 'list' })
  const [error, setError] = useState<string | null>(null)
  const [confirmDelete, setConfirmDelete] = useState<number | null>(null)
  const [renameText, setRenameText] = useState('')

  // Ao abrir: na tela de salvar (se pedido e houver abas) ou na lista.
  // biome-ignore lint/correctness/useExhaustiveDependencies: só ao abrir; `current` muda a cada render
  useEffect(() => {
    if (!open) return
    setError(null)
    setConfirmDelete(null)
    setMode(startSaving && current ? { kind: 'save', draft: current, name: '' } : { kind: 'list' })
  }, [open, startSaving])

  const back = () => {
    setMode({ kind: 'list' })
    setError(null)
  }

  const save = () => {
    if (mode.kind !== 'save') return
    const bad =
      validateLayoutName([], mode.name) ?? mode.draft.tabs.map((t) => validateCommand(t.command)).find(Boolean)
    if (bad) return setError(bad)
    const layout = { ...mode.draft, name: mode.name.trim() }
    const next = saveLayout(layouts, layout)
    if (!next) return setError(`O limite é de ${MAX_LAYOUTS} layouts.`)
    onChange(next)
    back()
  }

  const setCommand = (index: number, command: string) => {
    if (mode.kind !== 'save') return
    const tabs = mode.draft.tabs.map((t, i) => (i === index ? { ...t, command } : t))
    setMode({ ...mode, draft: { ...mode.draft, tabs } })
    setError(null)
  }

  const rename = () => {
    if (mode.kind !== 'rename') return
    const bad = validateLayoutName(layouts, renameText, mode.index)
    if (bad) return setError(bad)
    onChange(renameLayout(layouts, mode.index, renameText))
    back()
  }

  const title =
    mode.kind === 'save' ? 'Salvar o layout atual' : mode.kind === 'rename' ? 'Renomear o layout' : 'Layouts salvos'

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogBackdrop className="fixed inset-0 bg-black/30 transition-opacity duration-150 data-ending-style:opacity-0 data-starting-style:opacity-0" />
      <DialogContent className={PANEL}>
        <DialogTitle className="m-0 border-b border-hairline px-4 py-3 text-[13.5px] font-semibold">
          {title}
        </DialogTitle>

        {mode.kind === 'save' && (
          <Scroller className="min-h-0">
            <form
              className="flex flex-col gap-3 px-4 py-3"
              onSubmit={(e) => {
                e.preventDefault()
                save()
              }}
            >
              <label className="flex flex-col gap-1 text-[12px] text-muted">
                Nome
                <input
                  autoFocus
                  className={FIELD}
                  value={mode.name}
                  maxLength={MAX_LAYOUT_NAME}
                  placeholder="Dev: servidor + Claude + git"
                  onChange={(e) => {
                    setMode({ ...mode, name: e.currentTarget.value })
                    setError(null)
                  }}
                />
              </label>
              <p className="m-0 text-[12px] text-muted">
                Guarda as abas deste perfil com tipo, shell, pasta, grupo e divisão. O comando inicial (opcional) roda
                quando a aba abre.
              </p>
              <ul className="m-0 flex list-none flex-col gap-1.5 p-0">
                {mode.draft.tabs.map((t, i) => (
                  // biome-ignore lint/suspicious/noArrayIndexKey: as abas do rascunho não mudam de ordem aqui
                  <li key={i} className="flex items-center gap-2">
                    <TabKindIcon kind={t.kind} shell={t.shell || undefined} size={14} />
                    <span className="w-32 flex-none truncate text-[12.5px]" title={t.cwd || t.title}>
                      {t.title}
                    </span>
                    {t.kind === 'shell' && !t.shell.startsWith('ssh:') ? (
                      <input
                        className={`${FIELD} min-w-0 flex-1 font-mono text-[12px]`}
                        value={t.command}
                        maxLength={MAX_LAYOUT_COMMAND}
                        spellCheck={false}
                        aria-label={`Comando inicial de ${t.title}`}
                        placeholder="comando inicial (opcional)"
                        onChange={(e) => setCommand(i, e.currentTarget.value)}
                      />
                    ) : (
                      <span className="flex-1 text-[12px] text-muted">
                        {t.kind === 'claude' ? 'Claude Code' : 'Conexão SSH'}
                      </span>
                    )}
                  </li>
                ))}
              </ul>
              {error && (
                <p role="alert" className="m-0 text-[12px] text-claude">
                  {error}
                </p>
              )}
              <div className="flex justify-end gap-2">
                <button type="button" className={BUTTON} onClick={back}>
                  Cancelar
                </button>
                <button type="submit" className={PRIMARY}>
                  Salvar
                </button>
              </div>
            </form>
          </Scroller>
        )}

        {mode.kind === 'rename' && (
          <form
            className="flex flex-col gap-3 px-4 py-3"
            onSubmit={(e) => {
              e.preventDefault()
              rename()
            }}
          >
            <input
              autoFocus
              aria-label="Novo nome do layout"
              className={FIELD}
              value={renameText}
              maxLength={MAX_LAYOUT_NAME}
              onChange={(e) => {
                setRenameText(e.currentTarget.value)
                setError(null)
              }}
            />
            {error && (
              <p role="alert" className="m-0 text-[12px] text-claude">
                {error}
              </p>
            )}
            <div className="flex justify-end gap-2">
              <button type="button" className={BUTTON} onClick={back}>
                Cancelar
              </button>
              <button type="submit" className={PRIMARY}>
                Renomear
              </button>
            </div>
          </form>
        )}

        {mode.kind === 'list' && (
          <div className="flex min-h-0 flex-col">
            {layouts.length === 0 ? (
              <p className="m-0 px-4 py-6 text-center text-[13px] text-muted">
                Nenhum layout salvo. Monte as abas, grupos e divisões que quer e salve o conjunto aqui.
              </p>
            ) : (
              <Scroller className="min-h-0 flex-1">
                <ul className="m-0 list-none p-1.5">
                  {layouts.map((l, i) => (
                    <li key={l.name} className="flex items-center gap-1 rounded-md px-2 py-1.5 hover:bg-surface-hover">
                      <LayoutGrid aria-hidden size={14} className="flex-none text-muted" />
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-[13px]">{l.name}</div>
                        <div className="truncate text-[11.5px] text-muted">
                          {l.tabs.length} aba(s)
                          {l.groups.length > 0 && ` · ${l.groups.length} grupo(s)`}
                          {l.splits.length > 0 && ` · ${l.splits.length} divisão(ões)`}
                          {l.tabs.some((t) => t.command) && ' · com comandos'}
                        </div>
                      </div>
                      <button
                        type="button"
                        className={BUTTON}
                        onClick={() => {
                          onOpenChange(false)
                          onOpenLayout(l)
                        }}
                      >
                        <Play aria-hidden size={12} /> Abrir
                      </button>
                      <button
                        type="button"
                        className={BUTTON}
                        aria-label={`Renomear ${l.name}`}
                        onClick={() => {
                          setRenameText(l.name)
                          setError(null)
                          setMode({ kind: 'rename', index: i })
                        }}
                      >
                        <Pencil aria-hidden size={13} />
                      </button>
                      {confirmDelete === i ? (
                        <button
                          type="button"
                          className={`${BUTTON} text-claude`}
                          onClick={() => {
                            setConfirmDelete(null)
                            onChange(deleteLayout(layouts, i))
                          }}
                          onBlur={() => setConfirmDelete(null)}
                        >
                          Excluir mesmo?
                        </button>
                      ) : (
                        <button
                          type="button"
                          className={BUTTON}
                          aria-label={`Excluir ${l.name}`}
                          onClick={() => setConfirmDelete(i)}
                        >
                          <Trash2 aria-hidden size={13} />
                        </button>
                      )}
                    </li>
                  ))}
                </ul>
              </Scroller>
            )}
            <div className="flex items-center justify-end gap-2 border-t border-hairline px-4 py-2.5">
              <button
                type="button"
                className={PRIMARY}
                disabled={!current}
                title={current ? undefined : 'Abra ao menos uma aba neste perfil'}
                onClick={() => current && setMode({ kind: 'save', draft: current, name: '' })}
              >
                <Plus aria-hidden size={13} /> Salvar o layout atual
              </button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
