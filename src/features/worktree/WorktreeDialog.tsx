import { Dialog, DialogBackdrop, DialogContent, DialogTitle } from '@ui-sdk/react/dialog'
import { Check, GitBranch, GitMerge, SquareTerminal, Trash2, TriangleAlert } from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { ipc } from '../../lib/ipc'
import { ClaudeIcon } from '../tabs/ClaudeIcon'
import { MAX_WORKTREE_NAME, type WorktreeList, worktreeName, worktreeSlug, worktreeSummary } from './worktree'

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Pasta da aba ativa: o repositório das cópias. */
  cwd: string | null
  /** Abre uma aba na cópia (Claude Code ou shell), com o nome dela no título. */
  onOpenTab: (kind: 'claude' | 'shell', path: string, name: string) => void
  /** Fecha as abas que estão dentro da cópia (o Windows não deixa apagar pasta em uso). */
  onCloseTabsIn: (path: string) => Promise<void>
}

const PANEL =
  'fixed inset-x-0 top-[10vh] bottom-auto mx-auto my-0 flex h-fit max-h-[min(620px,80vh)] w-[min(600px,calc(100vw-48px))] origin-top flex-col overflow-hidden rounded-[14px] border border-hairline bg-material-thick p-0 text-text shadow-panel backdrop-blur-[28px] backdrop-saturate-180 [transition:opacity_140ms_ease-out,scale_220ms_var(--spring-soft)] data-ending-style:scale-[0.98] data-ending-style:opacity-0 data-starting-style:scale-[0.98] data-starting-style:opacity-0 reduced-transparency:bg-surface reduced-transparency:backdrop-blur-none motion-reduce:scale-100'
const FIELD =
  'w-full rounded-[7px] border border-border bg-field px-[9px] py-[6px] text-[13px] text-text [transition:border-color_140ms_ease-out,box-shadow_200ms_ease-out] placeholder:text-muted focus-visible:border-accent focus-visible:shadow-[0_0_0_3px_color-mix(in_srgb,var(--accent)_25%,transparent)] focus-visible:outline-none'
const BUTTON =
  'inline-flex h-7 flex-none cursor-pointer items-center gap-1.5 rounded-md px-2 text-[12px] text-muted hover:bg-surface-hover hover:text-text focus-visible:outline-2 focus-visible:outline-accent disabled:cursor-default disabled:opacity-40 disabled:hover:bg-transparent disabled:hover:text-muted'
const PRIMARY = `${BUTTON} bg-accent text-on-accent hover:bg-accent hover:text-on-accent`

type Notice = { kind: 'error' | 'ok'; text: string } | null

/**
 * Sessões em worktree: cria uma cópia isolada do repositório numa branch `termo/<nome>` e abre o
 * Claude nela; depois junta na branch da pasta principal ou descarta.
 */
export function WorktreeDialog({ open, onOpenChange, cwd, onOpenTab, onCloseTabsIn }: Props) {
  const [list, setList] = useState<WorktreeList | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [name, setName] = useState('')
  const [busy, setBusy] = useState<string | null>(null)
  const [notice, setNotice] = useState<Notice>(null)
  const [confirmDiscard, setConfirmDiscard] = useState<string | null>(null)
  const seq = useRef(0)

  const reload = useCallback(async () => {
    if (!cwd) return
    const id = ++seq.current
    try {
      const l = await ipc.worktreeList(cwd)
      if (id === seq.current) {
        setList(l)
        setLoadError(null)
      }
    } catch (err) {
      if (id === seq.current) {
        setList(null)
        setLoadError(String(err))
      }
    }
  }, [cwd])

  useEffect(() => {
    if (!open) return
    setName('')
    setNotice(null)
    setConfirmDiscard(null)
    setList(null)
    setLoadError(cwd ? null : 'Abra uma aba numa pasta de repositório git.')
    void reload()
  }, [open, cwd, reload])

  const slug = worktreeSlug(name)

  const create = async () => {
    if (!cwd || !slug || busy) return
    setBusy('create')
    setNotice(null)
    try {
      const wt = await ipc.worktreeCreate(cwd, slug)
      onOpenTab('claude', wt.path, slug)
      onOpenChange(false)
    } catch (err) {
      setNotice({ kind: 'error', text: String(err) })
    } finally {
      setBusy(null)
    }
  }

  const merge = async (path: string) => {
    if (!cwd || busy) return
    setBusy(path)
    setNotice(null)
    try {
      await onCloseTabsIn(path)
      const n = await ipc.worktreeMerge(cwd, path)
      const into = list?.mainBranch ?? 'a branch principal'
      setNotice({
        kind: 'ok',
        text:
          n > 0
            ? `${worktreeName(path)}: ${n} commit${n === 1 ? '' : 's'} juntado${n === 1 ? '' : 's'} em ${into}.`
            : `${worktreeName(path)} não tinha commits; a cópia foi removida.`,
      })
    } catch (err) {
      setNotice({ kind: 'error', text: String(err) })
    } finally {
      setBusy(null)
      void reload()
    }
  }

  const discard = async (path: string) => {
    if (!cwd || busy) return
    if (confirmDiscard !== path) return setConfirmDiscard(path)
    setConfirmDiscard(null)
    setBusy(path)
    setNotice(null)
    try {
      await onCloseTabsIn(path)
      await ipc.worktreeDiscard(cwd, path)
      setNotice({ kind: 'ok', text: `${worktreeName(path)} foi descartada.` })
    } catch (err) {
      setNotice({ kind: 'error', text: String(err) })
    } finally {
      setBusy(null)
      void reload()
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogBackdrop className="fixed inset-0 bg-black/30 transition-opacity duration-150 data-ending-style:opacity-0 data-starting-style:opacity-0" />
      <DialogContent className={PANEL}>
        <DialogTitle className="m-0 border-b border-hairline px-4 py-3 text-[13.5px] font-semibold">
          Claude Code numa cópia isolada
        </DialogTitle>

        {loadError ? (
          <p className="m-0 px-4 py-4 text-[12.5px] text-muted">{loadError}</p>
        ) : (
          <div className="flex min-h-0 flex-col gap-3 overflow-y-auto px-4 py-3">
            <form
              className="flex flex-col gap-1.5"
              onSubmit={(e) => {
                e.preventDefault()
                void create()
              }}
            >
              <label className="flex flex-col gap-1 text-[12px] text-muted">
                Tarefa
                <div className="flex gap-2">
                  <input
                    autoFocus
                    className={`${FIELD} min-w-0 flex-1`}
                    value={name}
                    maxLength={MAX_WORKTREE_NAME * 2}
                    placeholder="corrige o login"
                    spellCheck={false}
                    onChange={(e) => {
                      setName(e.currentTarget.value)
                      setNotice(null)
                    }}
                  />
                  <button type="submit" className={PRIMARY} disabled={!slug || !list || busy != null}>
                    <ClaudeIcon size={13} />
                    {busy === 'create' ? 'Criando…' : 'Criar e abrir'}
                  </button>
                </div>
              </label>
              <p className="m-0 text-[12px] text-muted">
                {slug ? (
                  <>
                    Branch <code className="font-mono text-text">termo/{slug}</code> a partir de{' '}
                    <code className="font-mono text-text">{list?.mainBranch ?? 'HEAD'}</code>, numa pasta ao lado do
                    projeto. Dependências (node_modules) não vêm junto.
                  </>
                ) : (
                  'Uma branch nova numa pasta separada: o Claude trabalha ali sem mexer na pasta principal.'
                )}
              </p>
            </form>

            {notice && (
              <p
                role={notice.kind === 'error' ? 'alert' : 'status'}
                className="m-0 flex gap-2 rounded-md bg-surface px-2.5 py-2 text-[12px] text-text"
              >
                {notice.kind === 'error' ? (
                  <TriangleAlert aria-hidden size={14} className="mt-px flex-none text-claude" />
                ) : (
                  <Check aria-hidden size={14} className="mt-px flex-none text-accent" />
                )}
                <span className="whitespace-pre-wrap break-words">{notice.text}</span>
              </p>
            )}

            <section className="flex flex-col gap-1">
              <h3 className="m-0 pt-1 text-[10px] font-semibold tracking-[0.06em] text-muted uppercase">
                Cópias deste repositório
              </h3>
              {!list ? (
                <p className="m-0 py-2 text-[12px] text-muted">Carregando…</p>
              ) : list.worktrees.length === 0 ? (
                <p className="m-0 py-2 text-[12px] text-muted">Nenhuma cópia aberta.</p>
              ) : (
                <ul className="m-0 flex list-none flex-col gap-1 p-0">
                  {list.worktrees.map((w) => {
                    const label = worktreeName(w.path)
                    const working = busy === w.path
                    const mergeBlocked = w.dirty > 0 || !w.branch || !list.mainBranch
                    return (
                      <li
                        key={w.path}
                        className="flex items-center gap-2 rounded-md px-1.5 py-1 hover:bg-surface-hover/50"
                      >
                        <GitBranch aria-hidden size={14} className="flex-none text-muted" />
                        <div className="flex min-w-0 flex-1 flex-col">
                          <span className="truncate text-[12.5px]" title={w.path}>
                            {label}
                          </span>
                          <span className="truncate text-[11px] text-muted">
                            {w.branch ?? 'HEAD destacado'} · {worktreeSummary(w)}
                          </span>
                        </div>
                        <button
                          type="button"
                          className={BUTTON}
                          title="Abrir o Claude Code nesta cópia"
                          disabled={busy != null}
                          onClick={() => {
                            onOpenTab('claude', w.path, label)
                            onOpenChange(false)
                          }}
                        >
                          <ClaudeIcon size={13} />
                        </button>
                        <button
                          type="button"
                          className={BUTTON}
                          title="Abrir um shell nesta cópia"
                          disabled={busy != null}
                          onClick={() => {
                            onOpenTab('shell', w.path, label)
                            onOpenChange(false)
                          }}
                        >
                          <SquareTerminal aria-hidden size={13} />
                        </button>
                        <button
                          type="button"
                          className={BUTTON}
                          disabled={busy != null || mergeBlocked}
                          title={
                            w.dirty > 0
                              ? 'Há alterações não commitadas: commite na cópia antes de juntar'
                              : `Juntar em ${list.mainBranch ?? '?'} (merge) e remover a cópia. Fecha as abas dela.`
                          }
                          onClick={() => void merge(w.path)}
                        >
                          <GitMerge aria-hidden size={13} />
                          {working ? 'Juntando…' : 'Juntar'}
                        </button>
                        <button
                          type="button"
                          className={`${BUTTON} ${confirmDiscard === w.path ? 'text-claude hover:text-claude' : ''}`}
                          disabled={busy != null}
                          title="Apagar a cópia, os commits e as alterações dela. Fecha as abas dela."
                          onClick={() => void discard(w.path)}
                          onBlur={() => setConfirmDiscard((c) => (c === w.path ? null : c))}
                        >
                          <Trash2 aria-hidden size={13} />
                          {confirmDiscard === w.path ? 'Confirmar' : 'Descartar'}
                        </button>
                      </li>
                    )
                  })}
                </ul>
              )}
            </section>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
