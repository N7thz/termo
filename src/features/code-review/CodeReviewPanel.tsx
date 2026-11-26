import { Button } from '@ui-sdk/react/button'
import {
  ChevronRight,
  ChevronsDownUp,
  ChevronsUpDown,
  ExternalLink,
  FileDiff as FileDiffIcon,
  GitCommitHorizontal,
  ListTree,
  LoaderCircle,
  MessageSquarePlus,
  RefreshCw,
  Send,
  Sparkles,
  Square,
  SquareCheck,
  SquareMinus,
  Trash2,
  Undo2,
  WrapText,
  X,
} from 'lucide-react'
import {
  type CSSProperties,
  Fragment,
  type KeyboardEvent,
  type RefObject,
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react'
import { ipc } from '../../lib/ipc'
import { Scroller } from '../../lib/Scroller'
import { ResizeEdge, useStoredWidth } from '../layout/ResizeEdge'
import {
  type ChangedFile,
  commentsPrompt,
  type DiffLine,
  type FileDiff,
  lineKey,
  lineSegments,
  parseDiff,
  type ReviewComment,
  type ReviewStatus,
  reviewPrompt,
  type Segment,
  STATUS_LABEL,
  STATUS_LETTER,
  type Staged,
  splitPath,
} from './diff'

// Largura arrastável pela borda esquerda (o padrão é perto do antigo min(640px, 46%)).
const PANEL_DEFAULT = 560
const PANEL_MIN = 340

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
/** Altura do cabeçalho fixo de cada arquivo: a navegação por trechos para logo abaixo dele. */
const FILE_HEADER = 32

const iconButton =
  'inline-grid size-7 flex-none place-items-center rounded-md text-muted hover:bg-surface-hover hover:text-text focus-visible:outline-2 focus-visible:outline-accent disabled:opacity-40 aria-pressed:bg-surface-hover aria-pressed:text-text'
const textButton =
  'inline-flex h-7 flex-none items-center gap-1.5 rounded-md px-2 text-[12px] text-muted hover:bg-surface-hover hover:text-text focus-visible:outline-2 focus-visible:outline-accent disabled:opacity-40 aria-pressed:bg-surface-hover aria-pressed:text-text'
const primaryButton =
  'inline-flex h-7 flex-none items-center justify-center gap-1.5 rounded-md bg-accent px-2.5 text-[12px] font-medium text-on-accent hover:bg-accent/90 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-accent disabled:opacity-40'

/** Preferência simples do painel guardada no navegador (quebra de linha, índice, dica vista). */
function useStoredFlag(key: string, fallback: boolean) {
  const [value, setValue] = useState(() => {
    try {
      const v = localStorage.getItem(key)
      return v == null ? fallback : v === '1'
    } catch {
      return fallback
    }
  })
  const set = useCallback(
    (next: boolean) => {
      setValue(next)
      try {
        localStorage.setItem(key, next ? '1' : '0')
      } catch {}
    },
    [key],
  )
  return [value, set] as const
}

const isTyping = (el: EventTarget) =>
  el instanceof HTMLElement && (el.tagName === 'TEXTAREA' || el.tagName === 'INPUT' || el.isContentEditable)

/** Rola até o próximo (ou anterior) elemento `selector` dentro da área de rolagem. */
function jump(scroller: HTMLElement | null, selector: string, dir: 1 | -1, offset: number) {
  if (!scroller) return
  const top = scroller.getBoundingClientRect().top
  const items = [...scroller.querySelectorAll<HTMLElement>(selector)].map(
    (el) => el.getBoundingClientRect().top - top - offset,
  )
  const target = dir > 0 ? items.find((y) => y > 2) : [...items].reverse().find((y) => y < -2)
  if (target != null) scroller.scrollTo({ top: scroller.scrollTop + target, behavior: 'smooth' })
}

/**
 * Painel de code review ao lado do terminal, no estilo do Warp: os arquivos alterados do repositório da aba
 * com o diff de cada um (palavras alteradas em destaque), índice, stage por arquivo ou de tudo, descartar,
 * abrir no editor, comentar linhas e mandar ao Claude Code, e commitar com a mensagem escrita ou pedida ao
 * Claude.
 */
export function CodeReviewPanel({ open, cwd, version, colors, fontFamily, onClose, onSendToClaude }: Props) {
  const [status, setStatus] = useState<ReviewStatus | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [comments, setComments] = useState<ReviewComment[]>([])
  const [width, setWidth, commitWidth] = useStoredWidth('termo.reviewWidth', PANEL_DEFAULT, PANEL_MIN)
  const [wrap, setWrap] = useStoredFlag('termo.reviewWrap', true)
  const [showIndex, setShowIndex] = useStoredFlag('termo.reviewIndex', false)
  const [hintSeen, setHintSeen] = useStoredFlag('termo.reviewHintSeen', false)
  /** Arquivos abertos ou fechados à mão; o resto segue o padrão (abertos quando são poucos). */
  const [toggled, setToggled] = useState<Record<string, boolean>>({})
  const scroller = useRef<HTMLDivElement>(null)

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
  const byDefault = files.length <= AUTO_EXPAND_MAX_FILES
  const isExpanded = (path: string) => toggled[path] ?? byDefault
  const allExpanded = files.length > 0 && files.every((f) => isExpanded(f.path))

  const act = async (run: () => Promise<unknown>) => {
    try {
      await run()
      setError(null)
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

  const setAllExpanded = (value: boolean) => setToggled(Object.fromEntries(files.map((f) => [f.path, value])))

  const goToFile = (path: string) => {
    setToggled((t) => ({ ...t, [path]: true }))
    requestAnimationFrame(() => {
      const el = scroller.current?.querySelector<HTMLElement>(`[data-file="${CSS.escape(path)}"]`)
      const box = scroller.current
      if (!el || !box) return
      const y = el.getBoundingClientRect().top - box.getBoundingClientRect().top
      box.scrollTo({ top: box.scrollTop + y, behavior: 'smooth' })
    })
  }

  // J/K: próximo/anterior arquivo; N/P: próximo/anterior trecho. Fora de campos de texto.
  const onKeyDown = (e: KeyboardEvent<HTMLElement>) => {
    if (e.key === 'Escape' && !e.defaultPrevented) {
      e.preventDefault()
      onClose()
      return
    }
    if (e.ctrlKey || e.altKey || e.metaKey || isTyping(e.target)) return
    const key = e.key.toLowerCase()
    if (key === 'j' || key === 'k') jump(scroller.current, '[data-file]', key === 'j' ? 1 : -1, 0)
    else if (key === 'n' || key === 'p') jump(scroller.current, '[data-hunk]', key === 'n' ? 1 : -1, FILE_HEADER)
    else return
    e.preventDefault()
  }

  return (
    <aside
      aria-label="Revisão de código"
      hidden={!open}
      className="relative flex min-h-0 flex-none animate-pop-in flex-col overflow-hidden rounded-[10px] bg-bg text-text shadow-card motion-reduce:animate-none"
      style={
        {
          width,
          maxWidth: 'calc(100vw - 420px)',
          '--diff-add': colors.added ?? 'var(--accent)',
          '--diff-del': colors.removed ?? 'var(--claude)',
        } as CSSProperties
      }
      onKeyDown={onKeyDown}
    >
      {/* Arraste a borda esquerda (no vão entre os cartões) para mudar a largura. */}
      <ResizeEdge
        side="left"
        label="Largura da revisão de código"
        width={width}
        min={PANEL_MIN}
        max={() => window.innerWidth - 420}
        fallback={PANEL_DEFAULT}
        onWidth={setWidth}
        onCommit={commitWidth}
      />
      <header className="flex h-10 flex-none items-center gap-1 border-b border-hairline pr-1.5 pl-2.5">
        <FileDiffIcon aria-hidden size={14} className="mr-1 flex-none text-muted" />
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
        <Button
          className={iconButton}
          aria-label="Quebrar as linhas longas"
          aria-pressed={wrap}
          title={wrap ? 'Linhas longas quebradas (clique para rolar de lado)' : 'Quebrar as linhas longas'}
          onClick={() => setWrap(!wrap)}
        >
          <WrapText aria-hidden size={14} />
        </Button>
        <Button className={iconButton} aria-label="Atualizar" title="Atualizar" onClick={() => void load()}>
          <RefreshCw aria-hidden size={13} className={loading ? 'animate-spin motion-reduce:animate-none' : ''} />
        </Button>
        <Button className={iconButton} aria-label="Fechar a revisão" title="Fechar (Esc)" onClick={onClose}>
          <X aria-hidden size={14} />
        </Button>
      </header>

      {files.length > 0 && (
        <div className="flex flex-none items-center gap-0.5 border-b border-hairline px-1.5 py-1">
          <Button
            className={textButton}
            onClick={() => onSendToClaude(reviewPrompt(files))}
            title="Abre o Claude Code pedindo um code review destas alterações"
          >
            <Sparkles aria-hidden size={13} className="text-claude" /> Revisar com o Claude
          </Button>
          <Button
            className={textButton}
            aria-pressed={showIndex}
            title="Lista dos arquivos alterados, para pular direto a um deles"
            onClick={() => setShowIndex(!showIndex)}
          >
            <ListTree aria-hidden size={13} /> Arquivos
          </Button>
          <Button
            className={iconButton}
            aria-label={allExpanded ? 'Recolher todos os arquivos' : 'Expandir todos os arquivos'}
            title={allExpanded ? 'Recolher todos' : 'Expandir todos'}
            onClick={() => setAllExpanded(!allExpanded)}
          >
            {allExpanded ? <ChevronsDownUp aria-hidden size={14} /> : <ChevronsUpDown aria-hidden size={14} />}
          </Button>
          <span className="min-w-2 flex-1" />
          <span className="truncate pr-1 text-[11px] text-muted">
            {hintSeen ? 'J/K arquivo · N/P trecho' : 'Clique no número da linha para comentar'}
          </span>
        </div>
      )}

      <Scroller viewportRef={scroller} className="min-h-0 flex-1">
        <div>
          {error && (
            <p className="m-2.5 rounded-lg border border-border bg-surface p-2.5 text-[12px] text-muted" role="alert">
              {error}
            </p>
          )}
          {!cwd && <Empty text="Abra uma aba para revisar as alterações da pasta dela." />}
          {cwd && status === null && !loading && !error && <Empty text="Esta pasta não é um repositório git." />}
          {status && files.length === 0 && <Empty text="Nenhuma alteração para revisar. Tudo commitado." />}
          {root && showIndex && files.length > 0 && (
            <FileIndex
              files={files}
              onGo={goToFile}
              onStage={(f, staged) => act(() => ipc.reviewStage(root, f.path, staged))}
            />
          )}
          {root &&
            files.map((f) => (
              <FileSection
                key={f.path}
                file={f}
                root={root}
                version={version}
                open={open}
                expanded={isExpanded(f.path)}
                onToggle={() => setToggled((t) => ({ ...t, [f.path]: !isExpanded(f.path) }))}
                wrap={wrap}
                fontFamily={fontFamily}
                comments={comments.filter((c) => c.path === f.path)}
                onComment={(c) => {
                  setComments((list) => [...list, c])
                  setHintSeen(true)
                }}
                onRemoveComment={(id) => setComments((list) => list.filter((c) => c.id !== id))}
                onStage={(staged) => act(() => ipc.reviewStage(root, f.path, staged))}
                onDiscard={() => act(() => ipc.reviewDiscard(root, f.path))}
              />
            ))}
        </div>
      </Scroller>

      {comments.length > 0 && (
        <div className="flex flex-none items-center gap-1 border-t border-hairline py-1 pr-1.5 pl-2.5">
          <span className="flex-1 text-[12px] text-muted">
            {comments.length} {comments.length === 1 ? 'comentário' : 'comentários'}
          </span>
          <Button className={textButton} onClick={() => setComments([])}>
            Limpar
          </Button>
          <Button className={`${textButton} text-text`} onClick={send}>
            <Send aria-hidden size={13} className="text-claude" /> Enviar ao Claude
          </Button>
        </div>
      )}

      {root && files.length > 0 && (
        <CommitBox root={root} files={files} onError={setError} onDone={() => void load()} scroller={scroller} />
      )}
    </aside>
  )
}

function Empty({ text }: { text: string }) {
  return <p className="m-0 px-4 py-8 text-center text-[12.5px] text-muted">{text}</p>
}

/** Caixa de stage: preparado, parte preparada ou fora. Ícone de caixa de seleção, sempre visível. */
function StageBox({ staged, disabled, onToggle }: { staged: Staged; disabled?: boolean; onToggle: () => void }) {
  const label = staged === 'full' ? 'Tirar do stage' : 'Preparar para o commit (stage)'
  const Icon = staged === 'full' ? SquareCheck : staged === 'partial' ? SquareMinus : Square
  return (
    <Button
      className={`${iconButton} size-6 ${staged === 'none' ? '' : 'text-accent hover:text-accent'}`}
      aria-label={label}
      title={staged === 'partial' ? 'Parte no stage: clique para preparar tudo' : label}
      aria-pressed={staged === 'full'}
      disabled={disabled}
      onClick={onToggle}
    >
      <Icon aria-hidden size={14} />
    </Button>
  )
}

function statusColor(status: ChangedFile['status']) {
  if (status === 'deleted' || status === 'conflict') return 'var(--diff-del)'
  if (status === 'modified') return 'var(--tone-yellow, var(--accent))'
  return 'var(--diff-add)'
}

function Counts({ file }: { file: ChangedFile }) {
  return (
    <span className="flex-none pl-2 font-mono text-[11px] tabular-nums">
      {file.binary ? (
        <span className="text-muted">binário</span>
      ) : (
        <>
          <span style={{ color: 'var(--diff-add)' }}>+{file.added}</span>{' '}
          <span style={{ color: 'var(--diff-del)' }}>−{file.removed}</span>
        </>
      )}
    </span>
  )
}

function StatusLetter({ file }: { file: ChangedFile }) {
  return (
    <span
      className="w-3 flex-none text-center font-mono text-[11px] font-semibold"
      title={STATUS_LABEL[file.status]}
      style={{ color: statusColor(file.status) }}
    >
      {STATUS_LETTER[file.status]}
    </span>
  )
}

/** Índice dos arquivos: stage de cada um e clique para pular até o diff dele. */
function FileIndex({
  files,
  onGo,
  onStage,
}: {
  files: ChangedFile[]
  onGo: (path: string) => void
  onStage: (file: ChangedFile, staged: boolean) => void
}) {
  return (
    <nav aria-label="Arquivos alterados" className="border-b border-hairline px-1 py-1">
      <ul className="m-0 list-none p-0">
        {files.map((f) => {
          const { dir, name } = splitPath(f.path)
          return (
            <li key={f.path} className="flex h-7 items-center gap-1">
              <StageBox
                staged={f.staged}
                disabled={f.status === 'conflict'}
                onToggle={() => onStage(f, f.staged !== 'full')}
              />
              <button
                type="button"
                className="flex h-full min-w-0 flex-1 items-center gap-1.5 rounded-md px-1 text-left text-[12px] hover:bg-surface-hover focus-visible:outline-2 focus-visible:outline-accent"
                onClick={() => onGo(f.path)}
              >
                <StatusLetter file={f} />
                <span className="min-w-0 flex-1 truncate" title={f.path}>
                  <span className={f.status === 'deleted' ? 'line-through' : ''}>{name}</span>
                  {dir && <span className="pl-1.5 text-muted">{dir.slice(0, -1)}</span>}
                </span>
                <Counts file={f} />
              </button>
            </li>
          )
        })}
      </ul>
    </nav>
  )
}

interface FileProps {
  file: ChangedFile
  root: string
  version: string
  open: boolean
  expanded: boolean
  onToggle: () => void
  wrap: boolean
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
  expanded,
  onToggle,
  wrap,
  fontFamily,
  comments,
  onComment,
  onRemoveComment,
  onStage,
  onDiscard,
}: FileProps) {
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
  // Arquivo novo é todo verde: o fundo fica mais leve para a cor não perder o sentido.
  const whole = file.status === 'untracked' || file.status === 'added'

  return (
    <section className="border-b border-hairline" aria-label={file.path} data-file={file.path}>
      <div className="relative sticky top-0 z-1 flex h-8 items-center gap-1 bg-bg/95 pr-1 pl-1 backdrop-blur-sm">
        <StageBox
          staged={file.staged}
          disabled={file.status === 'conflict'}
          onToggle={() => void onStage(file.staged !== 'full')}
        />
        <button
          type="button"
          className="flex h-full min-w-0 flex-1 items-center gap-1.5 rounded-md text-left text-[12.5px] outline-none focus-visible:outline-2 focus-visible:outline-accent"
          aria-expanded={expanded}
          onClick={onToggle}
        >
          <ChevronRight
            aria-hidden
            size={13}
            className={`flex-none text-muted transition-transform duration-150 motion-reduce:transition-none ${expanded ? 'rotate-90' : ''}`}
          />
          <StatusLetter file={file} />
          <span className="min-w-0 truncate" title={file.path}>
            <span className="text-muted">{dir}</span>
            <span className={file.status === 'deleted' ? 'line-through' : ''}>{name}</span>
          </span>
          <span className="ml-auto" />
          <Counts file={file} />
        </button>
        {file.status !== 'deleted' ? (
          <Button
            className={iconButton}
            aria-label="Abrir no editor"
            title="Abrir no editor"
            onClick={() => void ipc.openInEditor(file.path, firstLine, 1, root).catch(() => {})}
          >
            <ExternalLink aria-hidden size={13} />
          </Button>
        ) : (
          <span className="size-7 flex-none" />
        )}
        {file.status !== 'conflict' ? (
          <Button
            className={iconButton}
            aria-label="Descartar as alterações"
            title="Descartar as alterações"
            onClick={() => setConfirmDiscard(true)}
          >
            <Undo2 aria-hidden size={13} />
          </Button>
        ) : (
          <span className="size-7 flex-none" />
        )}
        {/* A confirmação cobre a ponta direita da linha, sem mudar o tamanho de nada. */}
        {confirmDiscard && (
          <div
            role="alertdialog"
            aria-label={`Descartar ${file.path}?`}
            className="absolute inset-y-0.5 right-1 flex items-center gap-1 rounded-md bg-surface pl-2 shadow-card"
            onKeyDown={(e) => {
              if (e.key === 'Escape') {
                e.preventDefault()
                e.stopPropagation()
                setConfirmDiscard(false)
              }
            }}
          >
            <span className="text-[12px] text-muted">
              {file.status === 'untracked' || file.status === 'added' ? 'Apagar o arquivo?' : 'Descartar?'}
            </span>
            <Button
              className={`${textButton} text-(--diff-del) hover:text-(--diff-del)`}
              autoFocus
              onClick={() => {
                setConfirmDiscard(false)
                void onDiscard()
              }}
            >
              {file.status === 'untracked' || file.status === 'added' ? 'Apagar' : 'Descartar'}
            </Button>
            <Button className={textButton} onClick={() => setConfirmDiscard(false)}>
              Cancelar
            </Button>
          </div>
        )}
      </div>

      {expanded && (
        <div className={`pb-1.5 text-[12px]/[1.55] ${wrap ? '' : 'overflow-x-auto'}`} style={{ fontFamily }}>
          {diffError && <p className="m-0 px-3 py-2 font-sans text-muted">{diffError}</p>}
          {!diff && !diffError && <p className="m-0 px-3 py-2 font-sans text-muted">Carregando o diff…</p>}
          {diff?.binary && <p className="m-0 px-3 py-2 font-sans text-muted">Arquivo binário: sem diff de texto.</p>}
          {diff && !diff.binary && hunks.length === 0 && (
            <p className="m-0 px-3 py-2 font-sans text-muted">
              Sem diferença de conteúdo (só permissões ou arquivo vazio).
            </p>
          )}
          <table className={`w-full border-collapse ${wrap ? 'table-fixed' : ''}`}>
            {wrap && (
              <colgroup>
                <col style={{ width: '4.5ch' }} />
                <col style={{ width: '4.5ch' }} />
                <col style={{ width: '2ch' }} />
                <col />
              </colgroup>
            )}
            <tbody>
              {hunks.map((h, hi) => {
                if (budget <= 0) return null
                const lines = h.lines.slice(0, budget)
                budget -= lines.length
                const segments = lineSegments(lines)
                return (
                  // biome-ignore lint/suspicious/noArrayIndexKey: os trechos não mudam de ordem
                  <Fragment key={hi}>
                    <tr data-hunk>
                      <td
                        colSpan={4}
                        className="truncate bg-surface/60 px-3 py-0.5 font-sans text-[11px] text-muted select-none"
                        title={h.header}
                      >
                        {whole ? 'Arquivo novo' : `Linha ${h.start}`}
                        {h.context && <span className="pl-2 font-mono text-text/70">{h.context}</span>}
                      </td>
                    </tr>
                    {lines.map((l, li) => {
                      const key = lineKey(file.path, l)
                      const here = comments.filter((c) => `${c.path}:${c.side}:${c.line}` === key)
                      return (
                        <Fragment key={key}>
                          <DiffRow
                            line={l}
                            segments={segments[li]}
                            soft={whole}
                            wrap={wrap}
                            onComment={() => setEditing(key)}
                          />
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

const tint = (color: string, pct: number) => `color-mix(in srgb, ${color} ${pct}%, transparent)`

function DiffRow({
  line,
  segments,
  soft,
  wrap,
  onComment,
}: {
  line: DiffLine
  segments?: Segment[]
  soft: boolean
  wrap: boolean
  onComment: () => void
}) {
  const sign = line.type === 'add' ? '+' : line.type === 'del' ? '−' : ' '
  const color = line.type === 'add' ? 'var(--diff-add)' : line.type === 'del' ? 'var(--diff-del)' : undefined
  // Com realce de palavras, a linha fica mais clara e o que mudou ganha o tom forte.
  const background = color ? tint(color, soft ? 6 : segments ? 8 : 13) : undefined
  const gutter =
    'w-[1%] px-1.5 text-right align-top text-[11px] whitespace-nowrap text-muted/70 tabular-nums select-none'
  return (
    <tr className="group/line" style={{ background }}>
      <td className={gutter}>{line.oldNo ?? ''}</td>
      <td className={`${gutter} relative`}>
        <button
          type="button"
          className="absolute inset-y-0 left-0 grid w-full place-items-center text-accent opacity-0 group-hover/line:opacity-100 focus-visible:opacity-100"
          aria-label={`Comentar a linha ${line.newNo ?? line.oldNo}`}
          onClick={onComment}
        >
          <MessageSquarePlus aria-hidden size={12} />
        </button>
        <span className="group-hover/line:opacity-0">{line.newNo ?? ''}</span>
      </td>
      <td className="w-[1%] pr-1 align-top select-none" style={{ color }}>
        {sign}
      </td>
      <td className={`pr-3 align-top ${wrap ? 'whitespace-pre-wrap [overflow-wrap:anywhere]' : 'whitespace-pre'}`}>
        {segments && color
          ? segments.map((s, i) =>
              s.changed ? (
                // biome-ignore lint/suspicious/noArrayIndexKey: pedaços fixos de uma linha
                <span key={i} className="rounded-[3px]" style={{ background: tint(color, 34) }}>
                  {s.text}
                </span>
              ) : (
                // biome-ignore lint/suspicious/noArrayIndexKey: pedaços fixos de uma linha
                <Fragment key={i}>{s.text}</Fragment>
              ),
            )
          : line.text || ' '}
      </td>
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

/**
 * Caixa de commit no rodapé: stage de tudo, mensagem (escrita ou pedida ao Claude) e Commitar. Só o que está
 * no stage entra no commit; os hooks do repositório rodam como num `git commit` digitado.
 */
function CommitBox({
  root,
  files,
  onError,
  onDone,
  scroller,
}: {
  root: string
  files: ChangedFile[]
  onError: (message: string | null) => void
  onDone: () => void
  scroller: RefObject<HTMLDivElement | null>
}) {
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState<'commit' | 'message' | 'stage' | null>(null)
  const [done, setDone] = useState<string | null>(null)
  const staged = files.filter((f) => f.staged !== 'none').length
  const allStaged = files.every((f) => f.staged === 'full' || f.status === 'conflict')
  const canCommit = staged > 0 && message.trim().length > 0 && busy == null

  useEffect(() => {
    if (!done) return
    const t = window.setTimeout(() => setDone(null), 5000)
    return () => window.clearTimeout(t)
  }, [done])

  const run = async (kind: NonNullable<typeof busy>, task: () => Promise<void>) => {
    setBusy(kind)
    try {
      await task()
      onError(null)
    } catch (err) {
      onError(String(err))
      scroller.current?.scrollTo({ top: 0, behavior: 'smooth' })
    } finally {
      setBusy(null)
    }
  }

  const commit = () =>
    canCommit &&
    run('commit', async () => {
      const hash = await ipc.reviewCommit(root, message)
      setMessage('')
      setDone(`Commit ${hash} criado.`)
      onDone()
    })

  const writeMessage = () =>
    run('message', async () => {
      setMessage(await ipc.reviewCommitMessage(root))
    })

  const toggleAll = () =>
    run('stage', async () => {
      await ipc.reviewStageAll(root, !allStaged)
      onDone()
    })

  return (
    <footer className="flex flex-none flex-col gap-1.5 border-t border-hairline p-2">
      <textarea
        rows={2}
        value={message}
        placeholder={busy === 'message' ? 'O Claude está escrevendo a mensagem…' : 'Mensagem do commit'}
        aria-label="Mensagem do commit"
        disabled={busy === 'message'}
        className="max-h-40 min-h-[3.25rem] resize-y rounded-md border border-border bg-surface px-2 py-1.5 text-[12.5px] text-text outline-none placeholder:text-muted focus-visible:border-accent disabled:opacity-60"
        onChange={(e) => setMessage(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
            e.preventDefault()
            void commit()
          }
        }}
      />
      <div className="flex items-center gap-1">
        <Button
          className={textButton}
          disabled={busy != null}
          onClick={() => void toggleAll()}
          title={allStaged ? 'Tirar todos os arquivos do stage' : 'Preparar todos os arquivos (git add -A)'}
        >
          {allStaged ? <SquareCheck aria-hidden size={13} /> : <Square aria-hidden size={13} />}
          {allStaged ? 'Tirar tudo' : 'Stage de tudo'}
        </Button>
        <Button
          className={textButton}
          disabled={busy != null}
          onClick={() => void writeMessage()}
          title="O Claude lê o diff do stage e os últimos commits e escreve a mensagem (não commita)"
        >
          {busy === 'message' ? (
            <LoaderCircle aria-hidden size={13} className="animate-spin text-claude motion-reduce:animate-none" />
          ) : (
            <Sparkles aria-hidden size={13} className="text-claude" />
          )}
          Escrever com o Claude
        </Button>
        <span className="min-w-0 flex-1 truncate px-1 text-right text-[11px] text-muted" aria-live="polite">
          {done ?? `${staged} de ${files.length} no stage`}
        </span>
        <Button
          className={`${primaryButton} relative`}
          disabled={!canCommit}
          onClick={() => void commit()}
          title={staged === 0 ? 'Prepare os arquivos (stage) antes de commitar' : 'Commitar (Ctrl+Enter)'}
        >
          {/* O rótulo continua no lugar durante o commit; o indicador fica por cima, sem mudar a largura. */}
          <span className={`inline-flex items-center gap-1.5 ${busy === 'commit' ? 'invisible' : ''}`}>
            <GitCommitHorizontal aria-hidden size={14} /> Commitar
          </span>
          {busy === 'commit' && (
            <LoaderCircle aria-hidden size={14} className="absolute animate-spin motion-reduce:animate-none" />
          )}
        </Button>
      </div>
    </footer>
  )
}
