import { Button } from '@ui-sdk/react/button'
import {
  ChevronRight,
  ExternalLink,
  FileDiff as FileDiffIcon,
  MessageSquarePlus,
  Minus,
  Plus,
  RefreshCw,
  Send,
  Sparkles,
  Trash2,
  Undo2,
  X,
} from 'lucide-react'
import { type CSSProperties, Fragment, useCallback, useEffect, useState } from 'react'
import { ipc } from '../../lib/ipc'
import {
  type ChangedFile,
  commentsPrompt,
  type DiffLine,
  type FileDiff,
  lineKey,
  parseDiff,
  type ReviewComment,
  type ReviewStatus,
  reviewPrompt,
  STATUS_LABEL,
  STATUS_LETTER,
  splitPath,
} from './diff'

interface Props {
  /** Painel visível. Fechado, não busca nada, mas guarda os comentários. */
  open: boolean
  /** Pasta da aba ativa: o repositório dela é o revisado. */
  cwd: string | null
  /** Muda quando o git da aba muda (+N −M): o painel recarrega a lista. */
  version: string
  /** Verde e vermelho do tema do terminal. */
  colors: { added?: string; removed?: string }
  fontFamily: string
  onClose: () => void
  /** Manda o texto ao Claude Code (aba do Claude existente ou nova). */
  onSendToClaude: (text: string) => void
}

/** Arquivos com mais linhas que isso abrem recolhidos e mostram o diff só sob pedido. */
const AUTO_EXPAND_MAX_FILES = 8
/** Linhas desenhadas de uma vez em diffs enormes (o resto aparece em "mostrar tudo"). */
const RENDER_LINES = 2500

const iconButton =
  'inline-grid size-7 flex-none place-items-center rounded-md text-muted hover:bg-surface-hover hover:text-text focus-visible:outline-2 focus-visible:outline-accent disabled:opacity-40'
const textButton =
  'inline-flex h-7 flex-none items-center gap-1.5 rounded-md px-2 text-[12px] text-muted hover:bg-surface-hover hover:text-text focus-visible:outline-2 focus-visible:outline-accent disabled:opacity-40'

/**
 * Painel de code review ao lado do terminal, no estilo do Warp: os arquivos alterados do repositório da aba
 * com o diff de cada um, preparar/tirar do stage, descartar, abrir no editor, comentar linhas e mandar os
 * comentários (ou um pedido de revisão completa) ao Claude Code.
 */
export function CodeReviewPanel({ open, cwd, version, colors, fontFamily, onClose, onSendToClaude }: Props) {
  const [status, setStatus] = useState<ReviewStatus | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [comments, setComments] = useState<ReviewComment[]>([])

  const load = useCallback(async () => {
    if (!cwd) return
    setLoading(true)
    try {
      setStatus(await ipc.reviewStatus(cwd))
      setError(null)
    } catch (err) {
      setError(String(err))
    } finally {
      setLoading(false)
    }
  }, [cwd])

  // biome-ignore lint/correctness/useExhaustiveDependencies: `version` só dispara a recarga
  useEffect(() => {
    if (open) void load()
  }, [open, load, version])

  const root = status?.root ?? null
  const files = status?.files ?? []
  const totals = files.reduce((t, f) => ({ added: t.added + f.added, removed: t.removed + f.removed }), {
    added: 0,
    removed: 0,
  })

  const act = async (run: () => Promise<void>) => {
    try {
      await run()
    } catch (err) {
      setError(String(err))
    }
    await load()
  }

  const send = () => {
    if (!comments.length) return
    onSendToClaude(commentsPrompt(comments))
    setComments([])
  }

  return (
    <aside
      aria-label="Revisão de código"
      hidden={!open}
      className="relative flex min-h-0 w-[min(640px,46%)] min-w-[340px] flex-none animate-pop-in flex-col overflow-hidden rounded-[10px] bg-bg text-text shadow-card motion-reduce:animate-none"
      style={
        {
          '--diff-add': colors.added ?? 'var(--accent)',
          '--diff-del': colors.removed ?? 'var(--claude)',
        } as CSSProperties
      }
      onKeyDown={(e) => {
        if (e.key === 'Escape' && !e.defaultPrevented) {
          e.preventDefault()
          onClose()
        }
      }}
    >
      <header className="flex h-10 flex-none items-center gap-2 border-b border-hairline px-2.5">
        <FileDiffIcon aria-hidden size={14} className="flex-none text-muted" />
        <h2 className="m-0 flex min-w-0 flex-1 items-baseline gap-2 text-[13px] font-semibold">
          Revisão de código
          {status && (
            <span className="truncate text-[11.5px] font-normal text-muted">
              {status.branch ?? 'sem branch'} · {files.length} {files.length === 1 ? 'arquivo' : 'arquivos'}{' '}
              <span className="font-mono tabular-nums">
                <span style={{ color: 'var(--diff-add)' }}>+{totals.added}</span>{' '}
                <span style={{ color: 'var(--diff-del)' }}>−{totals.removed}</span>
              </span>
            </span>
          )}
        </h2>
        <Button className={iconButton} aria-label="Atualizar" title="Atualizar" onClick={() => void load()}>
          <RefreshCw aria-hidden size={13} className={loading ? 'animate-spin motion-reduce:animate-none' : ''} />
        </Button>
        <Button className={iconButton} aria-label="Fechar a revisão" title="Fechar (Esc)" onClick={onClose}>
          <X aria-hidden size={14} />
        </Button>
      </header>

      {files.length > 0 && (
        <div className="flex flex-none items-center gap-1 border-b border-hairline px-2 py-1">
          <Button
            className={textButton}
            onClick={() => onSendToClaude(reviewPrompt(files))}
            title="Abre o Claude Code pedindo um code review destas alterações"
          >
            <Sparkles aria-hidden size={13} className="text-claude" /> Revisar com o Claude
          </Button>
          <span className="flex-1" />
          <span className="text-[11px] text-muted">Clique no número da linha para comentar</span>
        </div>
      )}

      <div className="min-h-0 flex-1 overflow-y-auto">
        {error && (
          <p className="m-2.5 rounded-lg border border-border bg-surface p-2.5 text-[12px] text-muted" role="alert">
            {error}
          </p>
        )}
        {!cwd && <Empty text="Abra uma aba para revisar as alterações da pasta dela." />}
        {cwd && status === null && !loading && !error && <Empty text="Esta pasta não é um repositório git." />}
        {status && files.length === 0 && <Empty text="Nenhuma alteração para revisar. Tudo commitado." />}
        {root &&
          files.map((f) => (
            <FileSection
              key={f.path}
              file={f}
              root={root}
              version={version}
              open={open}
              expanded={files.length <= AUTO_EXPAND_MAX_FILES}
              fontFamily={fontFamily}
              comments={comments.filter((c) => c.path === f.path)}
              onComment={(c) => setComments((list) => [...list, c])}
              onRemoveComment={(id) => setComments((list) => list.filter((c) => c.id !== id))}
              onStage={(staged) => act(() => ipc.reviewStage(root, f.path, staged))}
              onDiscard={() => act(() => ipc.reviewDiscard(root, f.path))}
            />
          ))}
      </div>

      {comments.length > 0 && (
        <footer className="flex flex-none items-center gap-2 border-t border-hairline px-2.5 py-1.5">
          <span className="flex-1 text-[12px] text-muted">
            {comments.length} {comments.length === 1 ? 'comentário' : 'comentários'}
          </span>
          <Button className={textButton} onClick={() => setComments([])}>
            Limpar
          </Button>
          <Button className={`${textButton} bg-accent/15 text-text hover:bg-accent/25`} onClick={send}>
            <Send aria-hidden size={13} /> Enviar ao Claude
          </Button>
        </footer>
      )}
    </aside>
  )
}

function Empty({ text }: { text: string }) {
  return <p className="m-0 px-4 py-8 text-center text-[12.5px] text-muted">{text}</p>
}

interface FileProps {
  file: ChangedFile
  root: string
  version: string
  open: boolean
  expanded: boolean
  fontFamily: string
  comments: ReviewComment[]
  onComment: (c: ReviewComment) => void
  onRemoveComment: (id: string) => void
  onStage: (staged: boolean) => Promise<void>
  onDiscard: () => Promise<void>
}

function FileSection({
  file,
  root,
  version,
  open,
  expanded: initiallyExpanded,
  fontFamily,
  comments,
  onComment,
  onRemoveComment,
  onStage,
  onDiscard,
}: FileProps) {
  const [expanded, setExpanded] = useState(initiallyExpanded)
  const [diff, setDiff] = useState<FileDiff | null>(null)
  const [diffError, setDiffError] = useState<string | null>(null)
  const [confirmDiscard, setConfirmDiscard] = useState(false)
  const [editing, setEditing] = useState<string | null>(null)
  const [showAll, setShowAll] = useState(false)
  const { dir, name } = splitPath(file.path)

  // biome-ignore lint/correctness/useExhaustiveDependencies: recarrega quando o arquivo ou o repositório muda
  useEffect(() => {
    if (!open || !expanded) return
    let alive = true
    ipc
      .reviewDiff(root, file.path)
      .then((d) => {
        if (!alive) return
        setDiff(d)
        setDiffError(null)
      })
      .catch((err) => alive && setDiffError(String(err)))
    return () => {
      alive = false
    }
  }, [open, expanded, root, file.path, file.added, file.removed, file.staged, version])

  const hunks = diff && !diff.binary ? parseDiff(diff.diff) : []
  let budget = showAll ? Number.POSITIVE_INFINITY : RENDER_LINES
  const firstLine = hunks[0]?.lines.find((l) => l.newNo != null)?.newNo ?? 1
  const staged = file.staged === 'full'

  return (
    <section className="border-b border-hairline" aria-label={file.path}>
      <div className="group sticky top-0 z-1 flex h-8 items-center gap-1.5 bg-bg/95 pr-1.5 pl-1 backdrop-blur-sm">
        <button
          type="button"
          className="flex min-w-0 flex-1 items-center gap-1.5 rounded-md py-1 text-left text-[12.5px] outline-none focus-visible:outline-2 focus-visible:outline-accent"
          aria-expanded={expanded}
          onClick={() => setExpanded((v) => !v)}
        >
          <ChevronRight
            aria-hidden
            size={13}
            className={`flex-none text-muted transition-transform duration-150 ${expanded ? 'rotate-90' : ''}`}
          />
          <span
            className="w-3 flex-none text-center font-mono text-[11px] font-semibold"
            title={STATUS_LABEL[file.status]}
            style={{
              color:
                file.status === 'deleted' || file.status === 'conflict'
                  ? 'var(--diff-del)'
                  : file.status === 'modified'
                    ? 'var(--tone-yellow, var(--accent))'
                    : 'var(--diff-add)',
            }}
          >
            {STATUS_LETTER[file.status]}
          </span>
          <span className="min-w-0 truncate" title={file.path}>
            <span className="text-muted">{dir}</span>
            <span className={file.status === 'deleted' ? 'line-through' : ''}>{name}</span>
          </span>
          {file.staged !== 'none' && (
            <span className="flex-none rounded px-1 text-[10px] text-muted ring-1 ring-border">
              {file.staged === 'full' ? 'no stage' : 'parte no stage'}
            </span>
          )}
          <span className="ml-auto flex-none pl-2 font-mono text-[11px] tabular-nums">
            {file.binary ? (
              <span className="text-muted">binário</span>
            ) : (
              <>
                <span style={{ color: 'var(--diff-add)' }}>+{file.added}</span>{' '}
                <span style={{ color: 'var(--diff-del)' }}>−{file.removed}</span>
              </>
            )}
          </span>
        </button>
        <div className="flex flex-none items-center opacity-0 transition-opacity duration-100 group-focus-within:opacity-100 group-hover:opacity-100">
          {confirmDiscard ? (
            <>
              <Button
                className={`${textButton} text-(--diff-del)`}
                onClick={() => {
                  setConfirmDiscard(false)
                  void onDiscard()
                }}
                autoFocus
              >
                {file.status === 'untracked' || file.status === 'added' ? 'Apagar o arquivo' : 'Descartar'}
              </Button>
              <Button className={textButton} onClick={() => setConfirmDiscard(false)}>
                Cancelar
              </Button>
            </>
          ) : (
            <>
              {file.status !== 'conflict' && (
                <Button
                  className={iconButton}
                  aria-label={staged ? 'Tirar do stage' : 'Preparar para commit (stage)'}
                  title={staged ? 'Tirar do stage' : 'Preparar para commit (stage)'}
                  onClick={() => void onStage(!staged)}
                >
                  {staged ? <Minus aria-hidden size={13} /> : <Plus aria-hidden size={13} />}
                </Button>
              )}
              {file.status !== 'deleted' && (
                <Button
                  className={iconButton}
                  aria-label="Abrir no editor"
                  title="Abrir no editor"
                  onClick={() => void ipc.openInEditor(file.path, firstLine, 1, root).catch(() => {})}
                >
                  <ExternalLink aria-hidden size={13} />
                </Button>
              )}
              {file.status !== 'conflict' && (
                <Button
                  className={iconButton}
                  aria-label="Descartar as alterações"
                  title="Descartar as alterações"
                  onClick={() => setConfirmDiscard(true)}
                >
                  <Undo2 aria-hidden size={13} />
                </Button>
              )}
            </>
          )}
        </div>
      </div>

      {expanded && (
        <div className="overflow-x-auto pb-1.5 text-[12px]/[1.55]" style={{ fontFamily }}>
          {diffError && <p className="m-0 px-3 py-2 font-sans text-muted">{diffError}</p>}
          {!diff && !diffError && <p className="m-0 px-3 py-2 font-sans text-muted">Carregando o diff…</p>}
          {diff?.binary && <p className="m-0 px-3 py-2 font-sans text-muted">Arquivo binário: sem diff de texto.</p>}
          {diff && !diff.binary && hunks.length === 0 && (
            <p className="m-0 px-3 py-2 font-sans text-muted">
              Sem diferença de conteúdo (só permissões ou arquivo vazio).
            </p>
          )}
          <table className="w-full border-collapse">
            <tbody>
              {hunks.map((h, hi) => {
                if (budget <= 0) return null
                const lines = h.lines.slice(0, budget)
                budget -= lines.length
                return (
                  // biome-ignore lint/suspicious/noArrayIndexKey: os trechos não mudam de ordem
                  <Fragment key={hi}>
                    <tr>
                      <td colSpan={4} className="bg-surface/60 px-3 py-0.5 text-[11px] text-muted select-none">
                        {h.header}
                      </td>
                    </tr>
                    {lines.map((l) => {
                      const key = lineKey(file.path, l)
                      const here = comments.filter((c) => `${c.path}:${c.side}:${c.line}` === key)
                      return (
                        <Fragment key={key}>
                          <DiffRow line={l} onComment={() => setEditing(key)} />
                          {here.map((c) => (
                            <CommentRow key={c.id} comment={c} onRemove={() => onRemoveComment(c.id)} />
                          ))}
                          {editing === key && (
                            <CommentEditor
                              onCancel={() => setEditing(null)}
                              onSave={(text) => {
                                setEditing(null)
                                onComment({
                                  id: `${key}:${Date.now()}`,
                                  path: file.path,
                                  line: (l.type === 'del' ? l.oldNo : l.newNo) ?? 0,
                                  side: l.type === 'del' ? 'old' : 'new',
                                  code: l.text,
                                  text,
                                })
                              }}
                            />
                          )}
                        </Fragment>
                      )
                    })}
                  </Fragment>
                )
              })}
            </tbody>
          </table>
          {(budget <= 0 || diff?.truncated) && (
            <div className="flex items-center gap-2 px-3 py-1.5 font-sans text-[12px] text-muted">
              {budget <= 0 && !showAll && (
                <Button className={textButton} onClick={() => setShowAll(true)}>
                  Mostrar o diff inteiro
                </Button>
              )}
              {diff?.truncated && <span>O diff foi cortado em 1 MB.</span>}
            </div>
          )}
        </div>
      )}
    </section>
  )
}

const ROW_BG: Record<DiffLine['type'], string | undefined> = {
  add: 'color-mix(in srgb, var(--diff-add) 13%, transparent)',
  del: 'color-mix(in srgb, var(--diff-del) 13%, transparent)',
  ctx: undefined,
}

function DiffRow({ line, onComment }: { line: DiffLine; onComment: () => void }) {
  const sign = line.type === 'add' ? '+' : line.type === 'del' ? '−' : ' '
  const gutter =
    'w-[1%] px-1.5 text-right align-top text-[11px] whitespace-nowrap text-muted/70 tabular-nums select-none'
  return (
    <tr className="group/line" style={{ background: ROW_BG[line.type] }}>
      <td className={gutter}>{line.oldNo ?? ''}</td>
      <td className={`${gutter} relative`}>
        <button
          type="button"
          className="absolute inset-y-0 left-0 grid w-full cursor-pointer place-items-center text-accent opacity-0 group-hover/line:opacity-100 focus-visible:opacity-100"
          aria-label={`Comentar a linha ${line.newNo ?? line.oldNo}`}
          onClick={onComment}
        >
          <MessageSquarePlus aria-hidden size={12} />
        </button>
        <span className="group-hover/line:opacity-0">{line.newNo ?? ''}</span>
      </td>
      <td
        className="w-[1%] pr-1 align-top select-none"
        style={{ color: line.type === 'ctx' ? undefined : line.type === 'add' ? 'var(--diff-add)' : 'var(--diff-del)' }}
      >
        {sign}
      </td>
      <td className="pr-3 align-top whitespace-pre">{line.text || ' '}</td>
    </tr>
  )
}

function CommentRow({ comment, onRemove }: { comment: ReviewComment; onRemove: () => void }) {
  return (
    <tr>
      <td colSpan={4} className="px-3 py-1 font-sans">
        <div className="flex items-start gap-2 rounded-lg border border-accent/40 bg-surface px-2.5 py-1.5 text-[12.5px]">
          <MessageSquarePlus aria-hidden size={13} className="mt-0.5 flex-none text-accent" />
          <p className="m-0 min-w-0 flex-1 whitespace-pre-wrap">{comment.text}</p>
          <button
            type="button"
            className="grid size-5 flex-none place-items-center rounded text-muted hover:text-text"
            aria-label="Apagar o comentário"
            onClick={onRemove}
          >
            <Trash2 aria-hidden size={12} />
          </button>
        </div>
      </td>
    </tr>
  )
}

function CommentEditor({ onSave, onCancel }: { onSave: (text: string) => void; onCancel: () => void }) {
  const [text, setText] = useState('')
  const save = () => text.trim() && onSave(text)
  return (
    <tr>
      <td colSpan={4} className="px-3 py-1.5 font-sans">
        <div className="flex flex-col gap-1.5 rounded-lg border border-accent/50 bg-surface p-2">
          <textarea
            // biome-ignore lint/a11y/noAutofocus: o editor abre a pedido, no clique da linha
            autoFocus
            rows={2}
            value={text}
            placeholder="O que o Claude deve mudar aqui?"
            aria-label="Comentário"
            className="min-h-12 resize-y border-0 bg-transparent p-0 text-[12.5px] text-text outline-none placeholder:text-muted"
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
                e.preventDefault()
                save()
              } else if (e.key === 'Escape') {
                e.preventDefault()
                e.stopPropagation()
                onCancel()
              }
            }}
          />
          <div className="flex items-center justify-end gap-1">
            <span className="mr-auto text-[11px] text-muted">Ctrl+Enter salva · Esc cancela</span>
            <Button className={textButton} onClick={onCancel}>
              Cancelar
            </Button>
            <Button className={`${textButton} text-text`} disabled={!text.trim()} onClick={save}>
              Comentar
            </Button>
          </div>
        </div>
      </td>
    </tr>
  )
}
