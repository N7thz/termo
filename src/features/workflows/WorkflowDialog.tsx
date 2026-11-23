import { Dialog, DialogBackdrop, DialogContent, DialogTitle } from '@ui-sdk/react/dialog'
import { ArrowLeft, Play, Plus, Settings2, Workflow as WorkflowIcon } from 'lucide-react'
import { type KeyboardEvent, useEffect, useMemo, useRef, useState } from 'react'
import type { Workflow } from '../../shared/types'
import { rank } from '../history-search/fuzzy'
import { EXAMPLE_WORKFLOWS, MAX_WORKFLOWS } from './model'
import { extractParams, fillTemplate, missingParams } from './params'

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  workflows: readonly Workflow[]
  /** Abre direto no preenchimento deste workflow (chamado pela paleta); `null` começa pela lista. */
  initial: Workflow | null
  /** A aba ativa é um shell: só nela dá para pôr o comando na linha. */
  canRun: boolean
  /** Enter põe o comando na linha do shell; Ctrl+Enter roda. */
  onSubmit: (command: string, run: boolean) => void
  /** "Adicionar" numa sugestão da tela vazia: é o único jeito de um exemplo ser gravado. */
  onAdd: (workflow: Workflow) => void
  onManage: () => void
}

const PANEL =
  'fixed inset-x-0 top-[12vh] bottom-auto mx-auto my-0 flex h-fit max-h-[min(560px,76vh)] w-[min(640px,calc(100vw-48px))] origin-top flex-col overflow-hidden rounded-[14px] border border-hairline bg-material-thick p-0 text-text shadow-panel backdrop-blur-[28px] backdrop-saturate-180 [transition:opacity_140ms_ease-out,scale_220ms_var(--spring-soft)] data-ending-style:scale-[0.98] data-ending-style:opacity-0 data-starting-style:scale-[0.98] data-starting-style:opacity-0 reduced-transparency:bg-surface reduced-transparency:backdrop-blur-none motion-reduce:scale-100'
const FIELD =
  'w-full rounded-[7px] border border-border bg-field px-[9px] py-[6px] font-mono text-[12.5px] text-text [transition:border-color_140ms_ease-out,box-shadow_200ms_ease-out] placeholder:text-muted focus-visible:border-accent focus-visible:shadow-[0_0_0_3px_color-mix(in_srgb,var(--accent)_25%,transparent)] focus-visible:outline-none'
const GHOST =
  'inline-flex h-7 cursor-pointer items-center gap-1.5 rounded-md px-2 text-[12px] text-muted hover:bg-surface-hover hover:text-text focus-visible:outline-2 focus-visible:outline-accent disabled:cursor-default disabled:opacity-50 disabled:hover:bg-transparent disabled:hover:text-muted'

/** Lista dos workflows (busca aproximada) e, ao escolher um, o formulário com um campo por `{{parâmetro}}`. */
export function WorkflowDialog({ open, onOpenChange, workflows, initial, canRun, onSubmit, onAdd, onManage }: Props) {
  const [chosen, setChosen] = useState<Workflow | null>(null)
  const [query, setQuery] = useState('')
  const [selected, setSelected] = useState(0)
  const [values, setValues] = useState<Record<string, string>>({})
  const searchRef = useRef<HTMLInputElement>(null)
  const formRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    setChosen(initial)
    setValues({})
    setQuery('')
    setSelected(0)
  }, [open, initial])

  const choose = (w: Workflow) => {
    setChosen(w)
    setValues({})
  }

  const params = useMemo(() => (chosen ? extractParams(chosen.command) : []), [chosen])
  const missing = chosen ? missingParams(chosen.command, values) : []
  const filled = chosen ? fillTemplate(chosen.command, values) : ''
  const blocked = missing.length > 0 || !canRun

  const shown = useMemo(
    () => rank(workflows, query, (w) => `${w.name} ${w.description}`, 50).map((r) => r.item),
    [workflows, query],
  )

  const submit = (run: boolean) => {
    if (!chosen) return
    if (missing.length > 0) {
      formRef.current?.querySelector<HTMLInputElement>(`[data-param="${CSS.escape(missing[0])}"]`)?.focus()
      return
    }
    if (!canRun) return
    onOpenChange(false)
    onSubmit(fillTemplate(chosen.command, values), run)
  }

  const onFormKey = (e: KeyboardEvent) => {
    if (e.nativeEvent.isComposing) return
    if (e.key === 'Enter') {
      e.preventDefault()
      submit(e.ctrlKey || e.metaKey)
    } else if (
      e.key === 'Backspace' &&
      e.target instanceof HTMLInputElement &&
      !e.target.value &&
      workflows.length > 0
    ) {
      // Campo vazio + Backspace volta para a lista, como desfazer a escolha.
      e.preventDefault()
      setChosen(null)
    }
  }

  const onListKey = (e: KeyboardEvent) => {
    if (e.nativeEvent.isComposing) return
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault()
      const n = shown.length
      if (n > 0) setSelected((i) => (i + (e.key === 'ArrowDown' ? 1 : n - 1)) % n)
    } else if (e.key === 'Enter') {
      e.preventDefault()
      const w = shown[selected]
      if (w) choose(w)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogBackdrop className="fixed inset-0 bg-black/30 transition-opacity duration-150 data-ending-style:opacity-0 data-starting-style:opacity-0" />
      <DialogContent className={PANEL}>
        <DialogTitle className="sr-only">Workflows</DialogTitle>
        {chosen ? (
          <div ref={formRef} className="flex min-h-0 flex-col">
            <header className="flex items-center gap-2 border-b border-hairline px-3 py-2">
              {(workflows.length > 0 || initial === null) && (
                <button
                  type="button"
                  aria-label="Voltar para a lista"
                  className={`${GHOST} px-1.5`}
                  onClick={() => setChosen(null)}
                >
                  <ArrowLeft aria-hidden size={14} />
                </button>
              )}
              <div className="min-w-0 flex-1">
                <div className="truncate text-[13.5px] font-medium">{chosen.name}</div>
                {chosen.description && <div className="truncate text-[12px] text-muted">{chosen.description}</div>}
              </div>
            </header>
            <div className="flex min-h-0 flex-col gap-3 overflow-y-auto px-4 py-3">
              {params.length === 0 && <p className="m-0 text-[12.5px] text-muted">Este workflow não tem parâmetros.</p>}
              {params.map((name, i) => (
                <label key={name} className="flex flex-col gap-1 text-[12px] text-muted">
                  {name}
                  <input
                    data-param={name}
                    onKeyDown={onFormKey}
                    autoFocus={i === 0}
                    value={values[name] ?? ''}
                    onChange={(e) => setValues((v) => ({ ...v, [name]: e.currentTarget.value }))}
                    spellCheck={false}
                    autoComplete="off"
                    aria-invalid={!(values[name] ?? '').trim() || undefined}
                    className={FIELD}
                  />
                </label>
              ))}
              <div className="flex flex-col gap-1 text-[12px] text-muted">
                Comando
                <pre className="m-0 max-h-32 overflow-auto rounded-[7px] border border-hairline bg-bg px-2.5 py-2 font-mono text-[12.5px] whitespace-pre-wrap break-all text-text">
                  {filled}
                </pre>
              </div>
              {!canRun && <p className="m-0 text-[12px] text-muted">Abra uma aba de shell para usar este comando.</p>}
            </div>
            <footer className="flex items-center gap-2 border-t border-hairline px-3 py-2 text-[11.5px] text-muted">
              {missing.length > 0 && <span>Preencha {missing.map((m) => `“${m}”`).join(', ')}.</span>}
              <span className="ml-auto" />
              <button type="button" className={GHOST} disabled={blocked} onClick={() => submit(false)}>
                Pôr na linha <kbd className="font-mono text-[11px]">Enter</kbd>
              </button>
              <button type="button" className={`${GHOST} text-text`} disabled={blocked} onClick={() => submit(true)}>
                <Play aria-hidden size={12} /> Rodar <kbd className="font-mono text-[11px] text-muted">Ctrl+Enter</kbd>
              </button>
            </footer>
          </div>
        ) : (
          <div className="flex min-h-0 flex-col">
            <div className="flex items-center gap-2 border-b border-hairline px-4">
              <WorkflowIcon aria-hidden size={15} className="flex-none text-muted" />
              <input
                ref={searchRef}
                autoFocus
                aria-label="Buscar workflows"
                onKeyDown={onListKey}
                placeholder="Buscar workflows…"
                value={query}
                onChange={(e) => {
                  setQuery(e.currentTarget.value)
                  setSelected(0)
                }}
                spellCheck={false}
                autoComplete="off"
                className="h-11 min-w-0 flex-1 bg-transparent text-[14px] text-text outline-none placeholder:text-muted"
              />
              <button type="button" className={GHOST} onClick={onManage}>
                <Settings2 aria-hidden size={13} /> Gerenciar
              </button>
            </div>
            <ul className="m-0 min-h-0 flex-1 list-none overflow-y-auto p-1.5">
              {shown.map((w, i) => (
                <li key={`${w.name}:${w.command}`}>
                  <button
                    type="button"
                    onMouseMove={() => setSelected(i)}
                    onClick={() => choose(w)}
                    className={`flex w-full cursor-pointer flex-col gap-0.5 rounded-md px-2.5 py-1.5 text-left ${
                      i === selected ? 'bg-surface-hover' : ''
                    }`}
                  >
                    <span className="truncate text-[13px]">{w.name}</span>
                    <span className="truncate font-mono text-[11.5px] text-muted">{w.command}</span>
                  </button>
                </li>
              ))}
              {workflows.length > 0 && shown.length === 0 && (
                <li className="px-3 py-6 text-center text-[13px] text-muted">Nenhum workflow combina.</li>
              )}
              {workflows.length === 0 && (
                <li className="px-2 pt-2 pb-1">
                  <p className="m-0 mb-2 text-[12.5px] text-muted">
                    Ainda não há workflows. Comandos salvos com <code className="font-mono">{'{{parâmetros}}'}</code>{' '}
                    viram um formulário para preencher. Algumas sugestões (nada é salvo sem você pedir):
                  </p>
                  <ul className="m-0 flex list-none flex-col gap-1 p-0">
                    {EXAMPLE_WORKFLOWS.map((w) => (
                      <li
                        key={w.name}
                        className="flex items-center gap-2 rounded-md border border-hairline px-2.5 py-1.5"
                      >
                        <button
                          type="button"
                          className="min-w-0 flex-1 cursor-pointer text-left"
                          onClick={() => choose(w)}
                        >
                          <span className="block truncate text-[13px]">{w.name}</span>
                          <span className="block truncate font-mono text-[11.5px] text-muted">{w.command}</span>
                        </button>
                        <button
                          type="button"
                          className={GHOST}
                          disabled={workflows.length >= MAX_WORKFLOWS}
                          onClick={() => onAdd(w)}
                        >
                          <Plus aria-hidden size={13} /> Adicionar
                        </button>
                      </li>
                    ))}
                  </ul>
                </li>
              )}
            </ul>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
