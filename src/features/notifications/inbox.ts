/**
 * Central de avisos do Termo: histórico dos avisos (Claude terminou ou pede permissão, comando longo
 * terminou, sessão do coord concluiu), com lidos e não lidos. Funções puras; o estado e a gravação
 * ficam no `useInbox`.
 */

export type InboxKind =
  | 'claude-done'
  | 'claude-blocked'
  | 'command-ok'
  | 'command-failed'
  | 'session-done'
  | 'session-failed'
  /** Aviso mandado por um programa no terminal (OSC 9 / OSC 777). */
  | 'program'

export interface InboxItem {
  id: string
  kind: InboxKind
  /** Nome da aba ou da sessão. */
  title: string
  /** Comando e duração, etapa do plano, pasta... */
  detail: string
  /** Quando chegou (ou, num aviso repetido, a última vez). */
  at: number
  read: boolean
  /** Aba de origem (nesta janela). Sem ela, o aviso é de uma sessão do coord. */
  tabKey?: number
  /** Sessão do coord de origem. */
  sessionId?: string
  /** Quantas vezes o mesmo aviso chegou seguido (o "×3"). */
  count: number
  /** Pedido de permissão já respondido: sai do topo. */
  resolved?: boolean
}

export type NewInboxItem = Omit<InboxItem, 'id' | 'read' | 'count' | 'at' | 'resolved'> & { at?: number }

/** Maior histórico guardado; os mais antigos saem primeiro. */
export const MAX_INBOX = 200
/** Um aviso igual ao último não lido dentro desse tempo soma no contador em vez de virar outro. */
export const REPEAT_WINDOW_MS = 10 * 60_000

let seq = 0
const newId = (at: number) => `${at.toString(36)}-${(seq++).toString(36)}`

/** Mesmo tipo, mesma origem e mesmo texto. */
function sameNotice(a: InboxItem, b: NewInboxItem) {
  return (
    a.kind === b.kind &&
    a.tabKey === b.tabKey &&
    a.sessionId === b.sessionId &&
    a.title === b.title &&
    a.detail === b.detail
  )
}

/** Junta o aviso ao histórico (mais novo primeiro). Repetido e ainda não lido: soma no `count`. */
export function addItem(list: readonly InboxItem[], item: NewInboxItem, now = Date.now()): InboxItem[] {
  const at = item.at ?? now
  const i = list.findIndex((x) => !x.read && sameNotice(x, item) && at - x.at <= REPEAT_WINDOW_MS)
  if (i >= 0) {
    const merged = { ...list[i], at, count: list[i].count + 1 }
    return [merged, ...list.slice(0, i), ...list.slice(i + 1)]
  }
  const fresh: InboxItem = { ...item, at, id: newId(at), read: false, count: 1 }
  return [fresh, ...list].slice(0, MAX_INBOX)
}

export const markRead = (list: readonly InboxItem[], id: string): InboxItem[] =>
  list.map((x) => (x.id === id && !x.read ? { ...x, read: true } : x))

export const markAllRead = (list: readonly InboxItem[]): InboxItem[] =>
  list.some((x) => !x.read) ? list.map((x) => (x.read ? x : { ...x, read: true })) : (list as InboxItem[])

/** O Claude da aba saiu do "pedindo permissão": o pedido deixa de estar pendente e conta como lido. */
export function resolveBlocked(list: readonly InboxItem[], tabKey: number): InboxItem[] {
  if (!list.some((x) => x.kind === 'claude-blocked' && x.tabKey === tabKey && !x.resolved)) return list as InboxItem[]
  return list.map((x) =>
    x.kind === 'claude-blocked' && x.tabKey === tabKey && !x.resolved ? { ...x, resolved: true, read: true } : x,
  )
}

/** Pedidos de permissão pendentes (ficam no topo). */
export const pending = (list: readonly InboxItem[]) => list.filter((x) => x.kind === 'claude-blocked' && !x.resolved)

export const unreadCount = (list: readonly InboxItem[]) => list.filter((x) => !x.read).length

/** "9+" acima de nove; vazio sem não lidos. */
export function badgeText(n: number): string {
  if (n <= 0) return ''
  return n > 9 ? '9+' : String(n)
}

const DAY = 86_400_000
const startOfDay = (t: number) => {
  const d = new Date(t)
  d.setHours(0, 0, 0, 0)
  return d.getTime()
}

/** "Hoje", "Ontem" ou a data ("23 de nov."). */
export function dayLabel(at: number, now = Date.now()): string {
  const diff = Math.round((startOfDay(now) - startOfDay(at)) / DAY)
  if (diff <= 0) return 'Hoje'
  if (diff === 1) return 'Ontem'
  return new Date(at).toLocaleDateString('pt-BR', { day: 'numeric', month: 'short' })
}

/** O histórico (sem os pendentes) em grupos por dia, na ordem da lista. */
export function groupByDay(list: readonly InboxItem[], now = Date.now()): { label: string; items: InboxItem[] }[] {
  const groups: { label: string; items: InboxItem[] }[] = []
  for (const item of list) {
    if (item.kind === 'claude-blocked' && !item.resolved) continue
    const label = dayLabel(item.at, now)
    const last = groups[groups.length - 1]
    if (last?.label === label) last.items.push(item)
    else groups.push({ label, items: [item] })
  }
  return groups
}

/** "agora", "há 5 min", "há 2 h", ou a hora ("14:05") a partir de um dia. */
export function relativeTime(at: number, now = Date.now()): string {
  const s = Math.max(0, Math.round((now - at) / 1000))
  if (s < 60) return 'agora'
  const m = Math.floor(s / 60)
  if (m < 60) return `há ${m} min`
  const h = Math.floor(m / 60)
  if (h < 24) return `há ${h} h`
  return new Date(at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
}

/** Lê o histórico gravado, descartando o que não tem o formato certo. */
export function parseInbox(raw: string | null): InboxItem[] {
  if (!raw) return []
  try {
    const data = JSON.parse(raw)
    if (!Array.isArray(data)) return []
    return data
      .filter(
        (x): x is InboxItem =>
          x &&
          typeof x.id === 'string' &&
          typeof x.kind === 'string' &&
          typeof x.title === 'string' &&
          typeof x.detail === 'string' &&
          typeof x.at === 'number',
      )
      .map((x) => ({ ...x, read: x.read === true, count: typeof x.count === 'number' && x.count > 0 ? x.count : 1 }))
      .slice(0, MAX_INBOX)
  } catch {
    return []
  }
}

/** Sessão do coord vista na última leitura: o estado e se o plano já estava completo. */
export interface SessionSeen {
  estado: string
  planDone: boolean
}

export interface CoordSessionLike {
  sessionId: string
  nome: string
  tipo: string
  estado: string
  cwd: string
  plano: { titulo?: string; done: number; total: number } | null
}

/**
 * Avisos das sessões do coord entre duas leituras: plano concluído (todas as etapas) e sessão em
 * segundo plano que terminou ou falhou. A primeira leitura (`prev` vazio) só registra, não avisa.
 * As respostas do Claude nas abas já avisam pelo estado da aba, então não entram aqui.
 */
export function coordNotices(
  prev: ReadonlyMap<string, SessionSeen> | null,
  sessions: readonly CoordSessionLike[],
): { notices: NewInboxItem[]; seen: Map<string, SessionSeen> } {
  const seen = new Map<string, SessionSeen>()
  const notices: NewInboxItem[] = []
  for (const s of sessions) {
    const planDone = !!s.plano && s.plano.total > 0 && s.plano.done >= s.plano.total
    const estado = s.estado.toLowerCase()
    seen.set(s.sessionId, { estado, planDone })
    if (!prev) continue
    const before = prev.get(s.sessionId)
    const where = projectOf(s.cwd)
    const name = s.plano?.titulo?.trim() || s.nome.trim() || 'Sessão do Claude'
    if (planDone && before && !before.planDone) {
      notices.push({
        kind: 'session-done',
        title: name,
        detail: `Concluiu as ${s.plano?.total} etapas${where ? ` · ${where}` : ''}`,
        sessionId: s.sessionId,
      })
    } else if (s.tipo === 'background' && before && before.estado !== estado) {
      if (estado === 'done' || estado === 'completed')
        notices.push({
          kind: 'session-done',
          title: name,
          detail: `Terminou${where ? ` · ${where}` : ''}`,
          sessionId: s.sessionId,
        })
      else if (estado === 'failed' || estado === 'error')
        notices.push({
          kind: 'session-failed',
          title: name,
          detail: `Falhou${where ? ` · ${where}` : ''}`,
          sessionId: s.sessionId,
        })
    }
  }
  return { notices, seen }
}

/** Última pasta do caminho. */
function projectOf(cwd: string): string {
  return cwd.split(/[\\/]/).filter(Boolean).pop() ?? ''
}
