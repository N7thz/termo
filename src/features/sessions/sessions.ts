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
  /** `low`..`max`, da linha de comando ou da definição do agente. */
  esforco?: string | null
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

/** Sessão registrada no coord (`/state` → `sessions`), pela chave do `sessionId` completo. */
export interface CoordSession {
  cwd?: string
  task?: string
  /** Última atividade (ms). */
  last: number
  plan?: { titulo?: string; started: number; estMin?: number; steps: Step[] }
  progress?: PlanProgress
}

/** Registro de edição (`locks`) ou reserva (`claims`) de um arquivo ou pasta. */
export interface FileMark {
  session: string
  display: string
  since: number
  dir?: boolean
}

export interface StateResponse {
  now: number
  history: HistoryEntry[]
  sessions?: Record<string, CoordSession>
  locks?: Record<string, FileMark>
  claims?: Record<string, FileMark>
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

export interface TimelineStep {
  t: string
  state: 'done' | 'current' | 'pending'
  /** Quando terminou (ms), nas concluídas. */
  at: number | null
  /** Tempo gasto: da etapa anterior até esta (concluída) ou até agora (atual). */
  took: number | null
}

/**
 * Etapas do plano com o tempo de cada uma, como a aba Etapas do painel do coord. `ended` (sessão que já
 * acabou) faz a etapa pendente deixar de ser "atual".
 */
export function timeline(
  plan: { started: number; steps: readonly Step[] },
  now: number,
  ended: number | null = null,
): TimelineStep[] {
  let prev = plan.started
  let currentSeen = false
  return plan.steps.map((st) => {
    if (st.done) {
      const took = st.done - prev
      prev = st.done
      return { t: st.t, state: 'done', at: st.done, took }
    }
    if (!currentSeen && ended == null) {
      currentSeen = true
      return { t: st.t, state: 'current', at: null, took: now - prev }
    }
    return { t: st.t, state: 'pending', at: null, took: null }
  })
}

/** "8 min", "1 h 05 min". */
export function duration(ms: number): string {
  const m = Math.max(1, Math.round(ms / 60000))
  if (m < 60) return `${m} min`
  return `${Math.floor(m / 60)} h ${String(m % 60).padStart(2, '0')} min`
}

/** "19:42". */
export function clock(ts: number): string {
  return new Date(ts).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
}

export type ModelTier = 'opus' | 'sonnet' | 'haiku' | 'fable' | 'outro'

/** Família do modelo pelo nome (`claude-opus-5-5`, `sonnet`...); `null` para o modelo da sessão. */
export function modelTier(model: string | null | undefined): ModelTier | null {
  const m = (model ?? '').toLowerCase()
  if (!m || m === 'inherit') return null
  return (['opus', 'sonnet', 'haiku', 'fable'] as const).find((k) => m.includes(k)) ?? 'outro'
}

export const TIER_NAME: Record<ModelTier, string> = {
  opus: 'Opus',
  sonnet: 'Sonnet',
  haiku: 'Haiku',
  fable: 'Fable',
  outro: 'outro modelo',
}

/** Nível do esforço de 1 a 5 (`low`..`max`); 0 sem esforço conhecido. */
export function effortLevel(effort: string | null | undefined): number {
  return { low: 1, medium: 2, high: 3, xhigh: 4, max: 5 }[effort ?? ''] ?? 0
}

/** Arquivos que a sessão está editando e os que ela reservou, mais recentes primeiro. */
export function filesOf(state: StateResponse | null, sessionId: string): { editing: FileMark[]; claims: FileMark[] } {
  const mine = (marks?: Record<string, FileMark>) =>
    Object.values(marks ?? {})
      .filter((m) => m.session === sessionId)
      .sort((a, b) => b.since - a.since)
  return { editing: mine(state?.locks), claims: mine(state?.claims) }
}

/**
 * Comando que abre a sessão num terminal: as de segundo plano com `claude attach <id>`, as interativas com
 * `claude --resume <sessionId>` (retoma a conversa).
 */
export function openCommand(s: Pick<AgentSession, 'tipo' | 'id' | 'sessionId'>): string | null {
  const safe = (v: string) => /^[\w-]+$/.test(v)
  if (s.tipo === 'background') return safe(s.id) ? `claude attach ${s.id}` : null
  return s.sessionId && safe(s.sessionId) ? `claude --resume ${s.sessionId}` : null
}

/** Quantas sessões estão trabalhando e quantas esperam você (para o indicador da barra de título). */
export function counts(sessions: readonly AgentSession[]): { busy: number; waiting: number } {
  let busy = 0
  let waiting = 0
  for (const s of sessions) {
    const tone = statusOf(s).tone
    if (tone === 'busy') busy++
    else if (tone === 'idle') waiting++
  }
  return { busy, waiting }
}
