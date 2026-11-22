/**
 * Dados do painel de sessões do coord (`/agents` e `/state`), já no formato que a página mostra.
 * Funções puras e testadas; quem busca os dados é a página (via ipc).
 */

export interface PlanProgress {
  titulo?: string
  done: number
  total: number
  pct: number
  etaMs: number | null
  atual: string | null
  elapsed: number
}

/** Uma sessão de `/agents` (o painel junta `claude agents --json --all` com o plano do coord). */
export interface AgentSession {
  id: string
  sessionId: string
  nome: string
  tipo: 'interactive' | 'background' | string
  /** `done`, `running`... (segundo plano) ou o `status` das interativas. */
  estado: string
  status?: string
  cwd: string
  inicio: number | null
  atualizado?: number | null
  agente?: string | null
  modelo?: string | null
  detalhe?: string
  pedido?: string
  resultado?: string | null
  tokens?: number | null
  plano: PlanProgress | null
  reservas: string[]
}

export interface AgentsResponse {
  now: number
  erro: string | null
  sessoes: AgentSession[]
}

interface Step {
  t: string
  done: number | null
}

/** Sessão que já acabou, do histórico do coord (`/state` → `history`). */
export interface HistoryEntry {
  id: string
  task?: string
  cwd?: string
  ended: number
  plan: { titulo?: string; started: number; estMin?: number; steps: Step[] }
  progress?: PlanProgress
}

export interface StateResponse {
  now: number
  history: HistoryEntry[]
}

export type Tone = 'busy' | 'idle' | 'done' | 'failed' | 'unknown'

/** Estado em português e o tom (cor) do ponto. */
export function statusOf(s: Pick<AgentSession, 'estado' | 'status'>): { label: string; tone: Tone } {
  const v = (s.status ?? s.estado ?? '').toLowerCase()
  if (v === 'busy' || v === 'running' || v === 'working') return { label: 'trabalhando', tone: 'busy' }
  if (v === 'idle' || v === 'waiting') return { label: 'esperando você', tone: 'idle' }
  if (v === 'done' || v === 'completed' || v === 'finished') return { label: 'concluída', tone: 'done' }
  if (v === 'failed' || v === 'error' || v === 'killed') return { label: 'falhou', tone: 'failed' }
  return { label: v || 'desconhecido', tone: 'unknown' }
}

const minutes = (ms: number) => `${Math.max(1, Math.round(ms / 60000))} min`

/** "3/6 etapas · termina em ~12 min", no mesmo texto do `coord.js progresso`. */
export function progressLabel(p: PlanProgress): string {
  let eta: string
  if (p.done === p.total) eta = `concluída em ${minutes(p.elapsed)}`
  else if (p.etaMs == null) eta = 'previsão após a 1ª etapa'
  else if (p.etaMs === 0) eta = 'passou da previsão'
  else eta = `termina em ~${minutes(p.etaMs)}`
  return `${p.done}/${p.total} etapas · ${eta}`
}

/** "agora", "há 5 min", "há 2 h", "há 3 dias". */
export function ago(ts: number | null | undefined, now: number): string {
  if (!ts) return ''
  const s = Math.max(0, Math.round((now - ts) / 1000))
  if (s < 45) return 'agora'
  const m = Math.round(s / 60)
  if (m < 60) return `há ${m} min`
  const h = Math.round(m / 60)
  if (h < 36) return `há ${h} h`
  return `há ${Math.round(h / 24)} dias`
}

/** Progresso de uma sessão do histórico, calculado dos passos (o `/state` já manda, mas pode faltar). */
export function historyProgress(h: HistoryEntry): PlanProgress {
  if (h.progress) return h.progress
  const total = h.plan.steps.length
  const done = h.plan.steps.filter((s) => s.done).length
  const last = Math.max(h.plan.started, ...h.plan.steps.map((s) => s.done ?? 0))
  return {
    titulo: h.plan.titulo,
    done,
    total,
    pct: total ? Math.round((done / total) * 100) : 0,
    etaMs: done === total ? 0 : null,
    atual: h.plan.steps.find((s) => !s.done)?.t ?? null,
    elapsed: last - h.plan.started,
  }
}

const normPath = (p: string) => p.replace(/[\\/]+$/, '').toLowerCase()

/** Nome curto do projeto (última pasta). */
export function projectName(cwd: string): string {
  const parts = cwd.split(/[\\/]/).filter(Boolean)
  return parts.at(-1) ?? cwd
}

/**
 * Agrupa por pasta do projeto; o projeto atual (`current`) vem primeiro, depois os outros por atividade
 * mais recente. Dentro de cada grupo: trabalhando, esperando, e o resto, cada um da mais nova para a mais velha.
 */
export function groupByProject(sessions: readonly AgentSession[], current?: string | null) {
  const order: Record<Tone, number> = { busy: 0, idle: 1, failed: 2, unknown: 3, done: 4 }
  const groups = new Map<string, AgentSession[]>()
  for (const s of sessions) {
    const key = normPath(s.cwd || '')
    groups.set(key, [...(groups.get(key) ?? []), s])
  }
  const cur = current ? normPath(current) : null
  const latest = (list: AgentSession[]) => Math.max(...list.map((s) => s.atualizado ?? s.inicio ?? 0))
  return [...groups.entries()]
    .map(([key, list]) => ({
      key,
      cwd: list[0].cwd,
      name: projectName(list[0].cwd || '(sem pasta)'),
      current: key === cur,
      sessions: [...list].sort(
        (a, b) =>
          order[statusOf(a).tone] - order[statusOf(b).tone] ||
          (b.atualizado ?? b.inicio ?? 0) - (a.atualizado ?? a.inicio ?? 0),
      ),
    }))
    .sort((a, b) => Number(b.current) - Number(a.current) || latest(b.sessions) - latest(a.sessions))
}
