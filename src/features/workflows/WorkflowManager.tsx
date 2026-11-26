import { Dialog, DialogBackdrop, DialogContent, DialogTitle } from '@ui-sdk/react/dialog'
import { ArrowDown, ArrowUp, Pencil, Plus, Trash2 } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Scroller } from '../../lib/Scroller'
import type { Workflow } from '../../shared/types'
import {
  COMMAND_MAX,
  DESCRIPTION_MAX,
  EXAMPLE_WORKFLOWS,
  MAX_WORKFLOWS,
  moveItem,
  NAME_MAX,
  validateWorkflow,
} from './model'
import { extractParams } from './params'

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  workflows: readonly Workflow[]
  /** Comando de um bloco ("salvar como workflow"): abre já criando um workflow novo com ele. */
  draft: string | null
  onChange: (workflows: Workflow[]) => void
}

interface Editing {
  /** Posição na lista, ou `null` para um workflow novo. */
  index: number | null
  form: Workflow
}

const PANEL =
  'fixed inset-x-0 top-[10vh] bottom-auto mx-auto my-0 flex h-fit max-h-[min(620px,80vh)] w-[min(680px,calc(100vw-48px))] origin-top flex-col overflow-hidden rounded-[14px] border border-hairline bg-material-thick p-0 text-text shadow-panel backdrop-blur-[28px] backdrop-saturate-180 [transition:opacity_140ms_ease-out,scale_220ms_var(--spring-soft)] data-ending-style:scale-[0.98] data-ending-style:opacity-0 data-starting-style:scale-[0.98] data-starting-style:opacity-0 reduced-transparency:bg-surface reduced-transparency:backdrop-blur-none motion-reduce:scale-100'
const FIELD =
  'w-full rounded-[7px] border border-border bg-field px-[9px] py-[6px] text-[13px] text-text [transition:border-color_140ms_ease-out,box-shadow_200ms_ease-out] placeholder:text-muted focus-visible:border-accent focus-visible:shadow-[0_0_0_3px_color-mix(in_srgb,var(--accent)_25%,transparent)] focus-visible:outline-none'
const BUTTON =
  'inline-flex h-7 cursor-pointer items-center gap-1.5 rounded-md px-2 text-[12px] text-muted hover:bg-surface-hover hover:text-text focus-visible:outline-2 focus-visible:outline-accent disabled:cursor-default disabled:opacity-40 disabled:hover:bg-transparent disabled:hover:text-muted'

const blank: Workflow = { name: '', command: '', description: '' }

/** Criar, editar, apagar e reordenar os workflows (as mudanças são gravadas na hora). */
export function WorkflowManager({ open, onOpenChange, workflows, draft, onChange }: Props) {
  const [editing, setEditing] = useState<Editing | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [confirmDelete, setConfirmDelete] = useState<number | null>(null)

  // Ao abrir: com um comando de bloco, já cria um workflow novo; senão mostra a lista.
  useEffect(() => {
    if (!open) return
    setError(null)
    setConfirmDelete(null)
    setEditing(draft ? { index: null, form: { ...blank, command: draft } } : null)
  }, [open, draft])

  const full = workflows.length >= MAX_WORKFLOWS

  const save = () => {
    if (!editing) return
    const form: Workflow = {
      name: editing.form.name.trim(),
      command: editing.form.command.trim(),
      description: editing.form.description.trim(),
    }
    const problem = validateWorkflow(form)
    if (problem) return setError(problem)
    if (editing.index === null) {
      if (full) return setError(`O limite é de ${MAX_WORKFLOWS} workflows.`)
      onChange([...workflows, form])
    } else onChange(workflows.map((w, i) => (i === editing.index ? form : w)))
    setEditing(null)
    setError(null)
  }

  const set = (patch: Partial<Workflow>) => {
    if (!editing) return
    setEditing({ ...editing, form: { ...editing.form, ...patch } })
    setError(null)
  }

  const params = editing ? extractParams(editing.form.command) : []

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogBackdrop className="fixed inset-0 bg-black/30 transition-opacity duration-150 data-ending-style:opacity-0 data-starting-style:opacity-0" />
      <DialogContent className={PANEL}>
        <DialogTitle className="m-0 border-b border-hairline px-4 py-3 text-[13.5px] font-semibold">
          {editing ? (editing.index === null ? 'Novo workflow' : 'Editar workflow') : 'Workflows'}
        </DialogTitle>
        {editing ? (
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
                  value={editing.form.name}
                  maxLength={NAME_MAX}
                  onChange={(e) => set({ name: e.currentTarget.value })}
                  placeholder="Log do git por autor"
                />
              </label>
              <label className="flex flex-col gap-1 text-[12px] text-muted">
                Comando
                <textarea
                  className={`${FIELD} min-h-20 resize-y font-mono text-[12.5px]`}
                  value={editing.form.command}
                  maxLength={COMMAND_MAX}
                  spellCheck={false}
                  onChange={(e) => set({ command: e.currentTarget.value })}
                  placeholder="git log --author={{autor}} -n {{quantidade}}"
                />
                <span>
                  {params.length > 0
                    ? `Campos para preencher: ${params.join(', ')}.`
                    : 'Use {{nome}} onde o valor muda a cada uso; vira um campo para preencher.'}
                </span>
              </label>
              <label className="flex flex-col gap-1 text-[12px] text-muted">
                Descrição (opcional)
                <input
                  className={FIELD}
                  value={editing.form.description}
                  maxLength={DESCRIPTION_MAX}
                  onChange={(e) => set({ description: e.currentTarget.value })}
                />
              </label>
              {error && (
                <p role="alert" className="m-0 text-[12px] text-claude">
                  {error}
                </p>
              )}
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  className={BUTTON}
                  onClick={() => {
                    setEditing(null)
                    setError(null)
                  }}
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className={`${BUTTON} bg-accent text-on-accent hover:bg-accent hover:text-on-accent`}
                >
                  Salvar
                </button>
              </div>
            </form>
          </Scroller>
        ) : (
          <div className="flex min-h-0 flex-col">
            <Scroller className="min-h-0 flex-1">
              <ul className="m-0 list-none p-1.5">
                {workflows.map((w, i) => (
                  <li
                    // biome-ignore lint/suspicious/noArrayIndexKey: nomes podem repetir; a lista só muda por ações daqui
                    key={`${i}:${w.name}`}
                    className="flex items-center gap-1 rounded-md px-2 py-1.5 hover:bg-surface-hover"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-[13px]">{w.name}</div>
                      <div className="truncate font-mono text-[11.5px] text-muted">{w.command}</div>
                    </div>
                    <button
                      type="button"
                      className={BUTTON}
                      aria-label={`Subir ${w.name}`}
                      disabled={i === 0}
                      onClick={() => onChange(moveItem(workflows, i, i - 1))}
                    >
                      <ArrowUp aria-hidden size={13} />
                    </button>
                    <button
                      type="button"
                      className={BUTTON}
                      aria-label={`Descer ${w.name}`}
                      disabled={i === workflows.length - 1}
                      onClick={() => onChange(moveItem(workflows, i, i + 1))}
                    >
                      <ArrowDown aria-hidden size={13} />
                    </button>
                    <button
                      type="button"
                      className={BUTTON}
                      aria-label={`Editar ${w.name}`}
                      onClick={() => setEditing({ index: i, form: w })}
                    >
                      <Pencil aria-hidden size={13} />
                    </button>
                    {confirmDelete === i ? (
                      <button
                        type="button"
                        className={`${BUTTON} text-claude`}
                        onClick={() => {
                          setConfirmDelete(null)
                          onChange(workflows.filter((_, j) => j !== i))
                        }}
                        onBlur={() => setConfirmDelete(null)}
                      >
                        Apagar mesmo?
                      </button>
                    ) : (
                      <button
                        type="button"
                        className={BUTTON}
                        aria-label={`Apagar ${w.name}`}
                        onClick={() => setConfirmDelete(i)}
                      >
                        <Trash2 aria-hidden size={13} />
                      </button>
                    )}
                  </li>
                ))}
                {workflows.length === 0 && (
                  <li className="px-2 py-2">
                    <p className="m-0 mb-2 text-[12.5px] text-muted">
                      Nenhum workflow. Sugestões, para começar (só são salvas se você adicionar):
                    </p>
                    <ul className="m-0 flex list-none flex-col gap-1 p-0">
                      {EXAMPLE_WORKFLOWS.map((w) => (
                        <li
                          key={w.name}
                          className="flex items-center gap-2 rounded-md border border-hairline px-2.5 py-1.5"
                        >
                          <div className="min-w-0 flex-1">
                            <div className="truncate text-[13px]">{w.name}</div>
                            <div className="truncate font-mono text-[11.5px] text-muted">{w.command}</div>
                          </div>
                          <button type="button" className={BUTTON} onClick={() => onChange([...workflows, w])}>
                            <Plus aria-hidden size={13} /> Adicionar
                          </button>
                        </li>
                      ))}
                    </ul>
                  </li>
                )}
              </ul>
            </Scroller>
            <footer className="flex items-center gap-2 border-t border-hairline px-3 py-2 text-[11.5px] text-muted">
              <span>
                {workflows.length} de {MAX_WORKFLOWS}
              </span>
              <span className="ml-auto" />
              <button type="button" className={BUTTON} onClick={() => onOpenChange(false)}>
                Fechar
              </button>
              <button
                type="button"
                className={`${BUTTON} text-text`}
                disabled={full}
                onClick={() => setEditing({ index: null, form: blank })}
              >
                <Plus aria-hidden size={13} /> Novo workflow
              </button>
            </footer>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
