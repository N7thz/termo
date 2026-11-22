import { Button } from '@ui-sdk/react/button'
import { ExternalLink, FolderOpen, Lock, RefreshCw, X } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import { ipc } from '../../lib/ipc'
import { openLink } from '../browser/links'
import {
  type AgentSession,
  type AgentsResponse,
  ago,
  groupByProject,
  type HistoryEntry,
  historyProgress,
  type PlanProgress,
  progressLabel,
  projectName,
  type StateResponse,
  statusOf,
  type Tone,
} from './sessions'

/** Atualiza enquanto a aba está visível; o painel guarda `/agents` em cache por 2,5 s. */
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
        {p.atual && p.done < p.total && <> · agora: {p.atual}</>}
      </span>
    </div>
  )
}

function SessionCard({ s, now }: { s: AgentSession; now: number }) {
  const st = statusOf(s)
  const title = s.nome || s.detalhe || s.id
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
      <div className="flex flex-wrap gap-x-3 gap-y-1 text-[11.5px] text-muted">
        <span>{s.tipo === 'background' ? 'segundo plano' : 'interativa'}</span>
        {s.inicio && <span>começou {ago(s.inicio, now)}</span>}
        {s.agente && <span>agente {s.agente}</span>}
        {s.modelo && <span>{s.modelo}</span>}
        {typeof s.tokens === 'number' && <span>{s.tokens.toLocaleString('pt-BR')} tokens</span>}
      </div>
      {s.plano ? (
        <Progress p={s.plano} />
      ) : (
        s.detalhe && s.detalhe !== title && <p className="m-0 line-clamp-2 text-[12px] text-muted">{s.detalhe}</p>
      )}
      {s.reservas.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {s.reservas.slice(0, 6).map((r) => (
            <span
              key={r}
              className="inline-flex max-w-full items-center gap-1 truncate rounded-md bg-highlight px-2 py-0.5 font-mono text-[10.5px] text-muted"
              title={`Reservado por esta sessão: ${r}`}
            >
              <Lock aria-hidden size={10} className="flex-none" />
              {projectName(r)}
            </span>
          ))}
          {s.reservas.length > 6 && <span className="text-[10.5px] text-muted">+{s.reservas.length - 6}</span>}
        </div>
      )}
    </article>
  )
}

function HistoryRow({ h, now }: { h: HistoryEntry; now: number }) {
  const p = historyProgress(h)
  const complete = p.done === p.total
  return (
    <li className="flex items-center gap-3 rounded-lg px-3 py-2.5 hover:bg-surface-hover">
      <Dot tone={complete ? 'done' : 'unknown'} />
      <span className="min-w-0 flex-1 truncate text-[12.5px] text-text">{p.titulo || h.task || h.id}</span>
      {h.cwd && <span className="hidden flex-none text-[11.5px] text-muted sm:inline">{projectName(h.cwd)}</span>}
      <span className="flex-none text-[11.5px] text-muted">
        {p.done}/{p.total}
      </span>
      <span className="w-20 flex-none text-right text-[11.5px] text-muted">{ago(h.ended, now)}</span>
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
}

/**
 * Acompanhamento das sessões do Claude Code (como a aba Agentes do painel do coord em
 * 127.0.0.1:4747/#agentes): quem está trabalhando ou esperando, o plano e o progresso de cada uma,
 * o que cada uma reservou e as que já terminaram.
 */
export function SessionsPage({ cwd, active, onClose }: Props) {
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
                : 'Lendo o painel de sessões…'}
            </p>
          </div>
          <Button
            className="inline-flex h-8 items-center gap-1.5 rounded-lg px-3 text-[12.5px] text-muted hover:bg-surface-hover hover:text-text focus-visible:outline-2 focus-visible:outline-accent"
            onClick={() => void load()}
            aria-label="Atualizar"
          >
            <RefreshCw aria-hidden size={13} className={loading ? 'animate-spin motion-reduce:animate-none' : ''} />
            Atualizar
          </Button>
          <Button
            className="inline-flex h-8 items-center gap-1.5 rounded-lg px-3 text-[12.5px] text-muted hover:bg-surface-hover hover:text-text focus-visible:outline-2 focus-visible:outline-accent"
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
                <SessionCard key={s.sessionId || s.id} s={s} now={now} />
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
