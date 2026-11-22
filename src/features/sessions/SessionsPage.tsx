import { Button } from '@ui-sdk/react/button'
import {
  ChevronRight,
  Circle,
  CircleCheck,
  CircleDot,
  ExternalLink,
  FilePen,
  FolderOpen,
  Lock,
  RefreshCw,
  SquareTerminal,
  X,
} from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import { ipc } from '../../lib/ipc'
import { openLink } from '../browser/links'
import {
  type AgentSession,
  type AgentsResponse,
  ago,
  clock,
  duration,
  effortLevel,
  type FileMark,
  filesOf,
  groupByProject,
  type HistoryEntry,
  historyProgress,
  modelTier,
  openCommand,
  type PlanProgress,
  progressLabel,
  projectName,
  type StateResponse,
  statusOf,
  TIER_NAME,
  type Tone,
  timeline,
} from './sessions'

/** Atualiza enquanto a página está aberta; o painel guarda `/agents` em cache por 2,5 s. */
const POLL_MS = 4000
const PANEL_URL = 'http://127.0.0.1:4747/#agentes'

// Cores só do tema: acento e os tons ANSI (--tone-*, postos pelo App a partir do tema ativo).
const TONE_COLOR: Record<Tone, string> = {
  busy: 'var(--accent)',
  idle: 'var(--tone-yellow, var(--accent))',
  done: 'var(--tone-green, var(--muted))',
  failed: 'var(--tone-red, var(--claude))',
  unknown: 'var(--muted)',
}

const smallButton =
  'inline-flex h-7 items-center gap-1.5 rounded-lg px-2.5 text-[12px] text-muted hover:bg-surface-hover hover:text-text focus-visible:outline-2 focus-visible:outline-accent disabled:opacity-40'
const tinyButton =
  'flex-none rounded px-1.5 py-0.5 text-[11px] text-muted opacity-0 group-hover/file:opacity-100 hover:bg-surface-hover hover:text-text focus-visible:opacity-100 focus-visible:outline-2 focus-visible:outline-accent'

function Dot({ tone }: { tone: Tone }) {
  return (
    <span className="relative grid size-2.5 flex-none place-items-center" aria-hidden>
      {tone === 'busy' && (
        <span
          className="absolute inset-0 animate-ping rounded-full opacity-40 motion-reduce:animate-none"
          style={{ background: TONE_COLOR[tone] }}
        />
      )}
      <span className="size-2 rounded-full" style={{ background: TONE_COLOR[tone] }} />
    </span>
  )
}

function Progress({ p }: { p: PlanProgress }) {
  return (
    <div className="flex flex-col gap-1.5">
      {p.titulo && <span className="truncate text-[12.5px] text-text">{p.titulo}</span>}
      <div
        className="h-1.5 overflow-hidden rounded-full bg-border"
        role="progressbar"
        aria-valuenow={p.pct}
        aria-valuemin={0}
        aria-valuemax={100}
      >
        <div
          className="h-full rounded-full bg-accent [transition:width_500ms_var(--spring-soft)]"
          style={{ width: `${p.pct}%` }}
        />
      </div>
      <span className="text-[11.5px] text-muted">
        {progressLabel(p)}
        {p.etaMs != null && p.etaMs > 0 && p.done < p.total && <> · ~{clock(Date.now() + p.etaMs)}</>}
        {p.atual && p.done < p.total && <> · agora: {p.atual}</>}
      </span>
    </div>
  )
}

/** Lista das etapas do plano, com a hora e o tempo de cada uma. */
function Steps({ plan, now, ended }: { plan: Parameters<typeof timeline>[0]; now: number; ended?: number | null }) {
  const steps = timeline(plan, now, ended ?? null)
  return (
    <ol className="m-0 flex list-none flex-col gap-0.5 p-0">
      {steps.map((st, i) => (
        <li
          // biome-ignore lint/suspicious/noArrayIndexKey: as etapas podem repetir nome; a ordem é fixa
          key={i}
          className={`flex items-center gap-2 text-[12px] ${st.state === 'pending' ? 'text-muted' : 'text-text'}`}
        >
          {st.state === 'done' ? (
            <CircleCheck aria-hidden size={12} className="flex-none" style={{ color: TONE_COLOR.done }} />
          ) : st.state === 'current' ? (
            <CircleDot aria-hidden size={12} className="flex-none text-accent" />
          ) : (
            <Circle aria-hidden size={12} className="flex-none opacity-50" />
          )}
          <span className={`min-w-0 flex-1 truncate ${st.state === 'current' ? 'font-[560]' : ''}`}>{st.t}</span>
          <span className="flex-none text-[11px] text-muted tabular-nums">
            {st.state === 'done' && st.at != null && `${clock(st.at)} · ${duration(st.took ?? 0)}`}
            {st.state === 'current' && `em andamento · ${duration(st.took ?? 0)}`}
          </span>
        </li>
      ))}
    </ol>
  )
}

function Effort({ level, name }: { level: number; name: string }) {
  return (
    <span className="inline-flex items-center gap-1" title={`esforço ${name}`}>
      <span className="inline-flex gap-[2px]" aria-hidden>
        {Array.from({ length: Math.max(3, level) }, (_, i) => (
          <i
            // biome-ignore lint/suspicious/noArrayIndexKey: pontos fixos
            key={i}
            className={`block h-2 w-1 rounded-[1px] ${i < level ? 'bg-accent' : 'bg-border'}`}
          />
        ))}
      </span>
      {name}
    </span>
  )
}

/** Uma linha de arquivo (editando ou reservado), com a ação de liberar/esquecer. */
function FileRow({
  mark,
  now,
  icon,
  action,
  onAction,
}: {
  mark: FileMark
  now: number
  icon: 'edit' | 'claim'
  action: string
  onAction: () => void
}) {
  const parts = mark.display.split(/[\\/]/)
  const name = parts.pop() ?? mark.display
  return (
    <li className="group/file flex items-center gap-2 rounded-md px-1.5 py-1 hover:bg-surface-hover">
      {icon === 'edit' ? (
        <FilePen aria-hidden size={12} className="flex-none text-muted" />
      ) : (
        <Lock aria-hidden size={12} className="flex-none text-muted" />
      )}
      <span className="min-w-0 flex-1 truncate font-mono text-[11.5px]" title={mark.display}>
        <span className="text-text">
          {name}
          {mark.dir ? '/' : ''}
        </span>{' '}
        <span className="text-muted">{parts.slice(-2).join('\\')}</span>
      </span>
      <span className="flex-none text-[11px] text-muted">{ago(mark.since, now)}</span>
      <button type="button" className={tinyButton} onClick={onAction}>
        {action}
      </button>
    </li>
  )
}

interface CardProps {
  s: AgentSession
  now: number
  state: StateResponse | null
  onOpen: (cwd: string, command: string | null) => void
  onAct: (action: 'release-claim' | 'release', file: string) => void
}

function SessionCard({ s, now, state, onOpen, onAct }: CardProps) {
  const [showSteps, setShowSteps] = useState(false)
  const st = statusOf(s)
  const title = s.nome || s.detalhe || s.id
  const tier = modelTier(s.modelo)
  const effort = effortLevel(s.esforco)
  const plan = state?.sessions?.[s.sessionId]?.plan
  const files = filesOf(state, s.sessionId)
  const command = openCommand(s)
  const result = s.resultado && s.resultado !== s.detalhe ? s.resultado : null

  return (
    <article className="flex animate-row-in flex-col gap-3 rounded-[12px] bg-surface p-4 shadow-tab motion-reduce:animate-none">
      <header className="flex items-center gap-2.5">
        <Dot tone={st.tone} />
        <span className="min-w-0 flex-1 truncate text-[13.5px] font-semibold text-text" title={s.sessionId}>
          {title}
        </span>
        <span className="flex-none text-[11.5px]" style={{ color: TONE_COLOR[st.tone] }}>
          {st.label}
        </span>
      </header>

      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11.5px] text-muted">
        <span>{s.tipo === 'background' ? 'segundo plano' : 'interativa'}</span>
        {tier && <span className="rounded-md bg-highlight px-1.5 py-px text-[11px] text-text">{TIER_NAME[tier]}</span>}
        {effort > 0 && s.esforco && <Effort level={effort} name={s.esforco} />}
        {s.agente && <span>agente {s.agente}</span>}
        {s.inicio && <span>começou {ago(s.inicio, now)}</span>}
        {typeof s.tokens === 'number' && <span>{s.tokens.toLocaleString('pt-BR')} tokens</span>}
      </div>

      {s.detalhe && s.detalhe !== title && <p className="m-0 line-clamp-2 text-[12px] text-muted">{s.detalhe}</p>}
      {result && (
        <p className="m-0 line-clamp-3 rounded-lg bg-bg/60 px-2.5 py-2 text-[12px] whitespace-pre-wrap text-text">
          {result}
        </p>
      )}

      {s.plano && (
        <div className="flex flex-col gap-2">
          <Progress p={s.plano} />
          {plan && plan.steps.length > 0 && (
            <>
              <button
                type="button"
                className="inline-flex w-fit items-center gap-1 rounded text-[11.5px] text-muted hover:text-text focus-visible:outline-2 focus-visible:outline-accent"
                aria-expanded={showSteps}
                onClick={() => setShowSteps((v) => !v)}
              >
                <ChevronRight
                  aria-hidden
                  size={12}
                  className={`transition-transform duration-150 ${showSteps ? 'rotate-90' : ''}`}
                />
                {showSteps ? 'Esconder as etapas' : `Ver as ${plan.steps.length} etapas`}
              </button>
              {showSteps && <Steps plan={plan} now={now} />}
            </>
          )}
        </div>
      )}

      {(files.editing.length > 0 || files.claims.length > 0) && (
        <ul className="m-0 flex list-none flex-col p-0">
          {files.editing.slice(0, 5).map((m) => (
            <FileRow
              key={`e-${m.display}`}
              mark={m}
              now={now}
              icon="edit"
              action="esquecer"
              onAction={() => onAct('release', m.display)}
            />
          ))}
          {files.claims.slice(0, 5).map((m) => (
            <FileRow
              key={`c-${m.display}`}
              mark={m}
              now={now}
              icon="claim"
              action="liberar"
              onAction={() => onAct('release-claim', m.display)}
            />
          ))}
          {files.editing.length + files.claims.length > 10 && (
            <li className="px-1.5 text-[11px] text-muted">
              e mais {files.editing.length + files.claims.length - 10} no painel completo
            </li>
          )}
        </ul>
      )}

      <footer className="-mx-1 -mb-1 flex flex-wrap items-center gap-1">
        {command && (
          <Button
            className={smallButton}
            onClick={() => onOpen(s.cwd, command)}
            title={`Abre uma aba e roda: ${command}`}
          >
            <SquareTerminal aria-hidden size={13} />
            {s.tipo === 'background' ? 'Acompanhar numa aba' : 'Retomar numa aba'}
          </Button>
        )}
        {s.cwd && (
          <Button className={smallButton} onClick={() => onOpen(s.cwd, null)} title={s.cwd}>
            <FolderOpen aria-hidden size={13} /> Aba na pasta
          </Button>
        )}
      </footer>
    </article>
  )
}

function HistoryRow({ h, now }: { h: HistoryEntry; now: number }) {
  const [open, setOpen] = useState(false)
  const p = historyProgress(h)
  const complete = p.done === p.total
  return (
    <li className="flex flex-col rounded-lg hover:bg-surface-hover/60">
      <button
        type="button"
        className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-left focus-visible:outline-2 focus-visible:outline-accent"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        <Dot tone={complete ? 'done' : 'unknown'} />
        <span className="min-w-0 flex-1 truncate text-[12.5px] text-text">{p.titulo || h.task || h.id}</span>
        {h.cwd && <span className="hidden flex-none text-[11.5px] text-muted sm:inline">{projectName(h.cwd)}</span>}
        <span className="flex-none text-[11.5px] text-muted">
          {p.done}/{p.total}
          {p.elapsed > 0 && ` · ${duration(p.elapsed)}`}
        </span>
        <span className="w-20 flex-none text-right text-[11.5px] text-muted">{ago(h.ended, now)}</span>
        <ChevronRight
          aria-hidden
          size={12}
          className={`flex-none text-muted transition-transform duration-150 ${open ? 'rotate-90' : ''}`}
        />
      </button>
      {open && h.plan.steps.length > 0 && (
        <div className="px-3 pb-3 pl-8">
          <Steps plan={h.plan} now={now} ended={h.ended} />
        </div>
      )}
    </li>
  )
}

interface Props {
  /** Pasta da aba de onde a página foi aberta: o projeto dela vem primeiro. */
  cwd?: string | null
  /** Só busca enquanto visível. */
  active: boolean
  /** Volta ao terminal (botão e Esc). */
  onClose: () => void
  /** Abre uma aba na pasta e, se houver, roda o comando nela (`claude attach`/`claude --resume`). */
  onOpen: (cwd: string, command: string | null) => void
}

/**
 * Acompanhamento das sessões do Claude Code (como o painel do coord em 127.0.0.1:4747): quem está
 * trabalhando ou esperando, modelo e esforço, o plano com as etapas, os arquivos que cada uma está editando
 * e reservou (com liberar/esquecer), abrir a sessão numa aba e as que já terminaram.
 */
export function SessionsPage({ cwd, active, onClose, onOpen }: Props) {
  const [agents, setAgents] = useState<AgentsResponse | null>(null)
  const [state, setState] = useState<StateResponse | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [a, st] = await Promise.all([ipc.coordAgents(), ipc.coordState()])
      setAgents(a as AgentsResponse)
      setState(st as StateResponse)
      setError(null)
    } catch (err) {
      setError(String(err))
    } finally {
      setLoading(false)
    }
  }, [])

  const act = async (action: 'release-claim' | 'release', file: string) => {
    try {
      setState((await ipc.coordAct(action, file)) as StateResponse)
    } catch (err) {
      setError(String(err))
    }
  }

  useEffect(() => {
    if (!active) return
    void load()
    const timer = window.setInterval(() => void load(), POLL_MS)
    return () => window.clearInterval(timer)
  }, [active, load])

  const now = agents?.now ?? Date.now()
  const live = (agents?.sessoes ?? []).filter((s) => statusOf(s).tone !== 'done')
  const groups = groupByProject(live, cwd)
  const busy = live.filter((s) => statusOf(s).tone === 'busy').length
  const waiting = live.filter((s) => statusOf(s).tone === 'idle').length
  const history = [...(state?.history ?? [])].sort((a, b) => b.ended - a.ended).slice(0, 25)

  return (
    <section
      aria-label="Sessões do Claude Code"
      className="absolute inset-0 z-10 animate-pop-in overflow-y-auto bg-bg text-text motion-reduce:animate-none"
      onKeyDown={(e) => {
        if (e.key === 'Escape' && !e.defaultPrevented) {
          e.preventDefault()
          onClose()
        }
      }}
    >
      <div className="mx-auto flex max-w-[880px] flex-col gap-6 px-6 py-6">
        <header className="flex flex-wrap items-center gap-3">
          <div className="flex min-w-0 flex-1 flex-col gap-0.5">
            <h1 className="m-0 text-[18px] font-semibold tracking-[-0.01em] text-text">Sessões</h1>
            <p className="m-0 text-[12.5px] text-muted">
              {agents
                ? `${busy} trabalhando · ${waiting} esperando você · ${history.length} concluídas recentemente`
                : 'Lendo as sessões (a primeira leitura leva alguns segundos)…'}
            </p>
          </div>
          <Button className={smallButton} onClick={() => void load()} aria-label="Atualizar">
            <RefreshCw aria-hidden size={13} className={loading ? 'animate-spin motion-reduce:animate-none' : ''} />
            Atualizar
          </Button>
          <Button
            className={smallButton}
            onClick={() => openLink(PANEL_URL, false)}
            title="Abrir o painel do coord (127.0.0.1:4747) no painel de navegador"
          >
            <ExternalLink aria-hidden size={13} /> Painel completo
          </Button>
          <Button
            className="inline-flex size-8 items-center justify-center rounded-lg text-muted hover:bg-surface-hover hover:text-text focus-visible:outline-2 focus-visible:outline-accent"
            onClick={onClose}
            aria-label="Voltar ao terminal"
            autoFocus
          >
            <X aria-hidden size={15} />
          </Button>
        </header>

        {error && (
          <div className="rounded-[12px] border border-border bg-surface p-4 text-[12.5px] text-muted" role="alert">
            Não foi possível ler o painel de sessões: {error}
          </div>
        )}

        {agents?.erro && <p className="m-0 text-[12px] text-muted">Aviso do painel: {agents.erro}</p>}

        {!agents && !error && (
          <div className="grid grid-cols-[repeat(auto-fill,minmax(300px,1fr))] gap-3" aria-hidden>
            {[0, 1].map((i) => (
              <div key={i} className="h-36 animate-pulse rounded-[12px] bg-surface motion-reduce:animate-none" />
            ))}
          </div>
        )}

        {groups.length === 0 && agents && !error && (
          <p className="m-0 text-[13px] text-muted">Nenhuma sessão ativa agora.</p>
        )}

        {groups.map((g) => (
          <section key={g.key} className="flex flex-col gap-3" aria-label={`Projeto ${g.name}`}>
            <h2 className="m-0 flex items-center gap-2 text-[12px] font-semibold tracking-[0.04em] text-muted uppercase">
              <FolderOpen aria-hidden size={13} />
              {g.name}
              {g.current && <span className="font-normal tracking-normal normal-case">· esta pasta</span>}
            </h2>
            <div className="grid grid-cols-[repeat(auto-fill,minmax(300px,1fr))] gap-3">
              {g.sessions.map((s) => (
                <SessionCard
                  key={s.sessionId || s.id}
                  s={s}
                  now={now}
                  state={state}
                  onOpen={onOpen}
                  onAct={(action, file) => void act(action, file)}
                />
              ))}
            </div>
          </section>
        ))}

        {history.length > 0 && (
          <section className="flex flex-col gap-2" aria-label="Sessões concluídas">
            <h2 className="m-0 text-[12px] font-semibold tracking-[0.04em] text-muted uppercase">Concluídas</h2>
            <ul className="m-0 flex list-none flex-col p-0">
              {history.map((h) => (
                <HistoryRow key={`${h.id}-${h.ended}`} h={h} now={now} />
              ))}
            </ul>
          </section>
        )}
      </div>
    </section>
  )
}
