import { useEffect, useMemo, useRef, useState } from 'react'
import { ipc } from '../../lib/ipc'
import type { AgentState } from '../agent-status/agentState'
import type { AgentsResponse } from '../sessions/sessions'
import {
  addItem,
  type CoordSessionLike,
  coordNotices,
  type InboxItem,
  markAllRead,
  markRead,
  type NewInboxItem,
  parseInbox,
  resolveBlocked,
  type SessionSeen,
} from './inbox'
import { type FinishedCommand, formatSeconds } from './notifications'

const STORAGE_KEY = 'termo.inbox.v1'
/** As sessões do coord são lidas devagar (cada leitura custa um processo) e só com a janela visível. */
const COORD_POLL_MS = 30_000

function load(): InboxItem[] {
  try {
    // Os números das abas não sobrevivem ao reinício: o aviso antigo fica sem destino em vez de abrir a
    // aba errada, e um pedido de permissão de antes já não está pendente.
    return parseInbox(localStorage.getItem(STORAGE_KEY)).map(({ tabKey: _, ...x }) =>
      x.kind === 'claude-blocked' ? { ...x, resolved: true } : x,
    )
  } catch {
    return []
  }
}

export interface Inbox {
  items: InboxItem[]
  /** A última gravação falhou: a lista vale só até fechar o app. */
  saveFailed: boolean
  /** O painel do coord não respondeu na última leitura. */
  coordDown: boolean
  /** Estado do Claude numa aba mudou. */
  agent: (tabKey: number, title: string, cwd: string | null, state: AgentState) => void
  /** Comando terminou numa aba (só os que passaram do limite de segundos entram). */
  command: (tabKey: number, title: string, cmd: FinishedCommand) => void
  /** Um programa da aba mandou um aviso (OSC 9 / OSC 777); `title` vazio usa o nome da aba. */
  program: (tabKey: number, tabTitle: string, title: string, body: string) => void
  read: (id: string) => void
  readAll: () => void
  clear: () => void
}

const folder = (cwd: string | null) => cwd?.split(/[\\/]/).filter(Boolean).pop() ?? ''

/**
 * Histórico da central de avisos. Na janela principal (`persist`), grava no navegador do app e
 * acompanha as sessões do coord; nas outras janelas, guarda só os avisos das próprias abas, em memória.
 */
export function useInbox(opts: { persist: boolean; commandSecs: number }): Inbox {
  const [items, setItems] = useState<InboxItem[]>(() => (opts.persist ? load() : []))
  const [saveFailed, setSaveFailed] = useState(false)
  const [coordDown, setCoordDown] = useState(false)
  const lastAgent = useRef(new Map<number, AgentState>())
  const secs = useRef(opts.commandSecs)
  secs.current = opts.commandSecs

  useEffect(() => {
    if (!opts.persist) return
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(items))
      setSaveFailed(false)
    } catch {
      setSaveFailed(true)
    }
  }, [items, opts.persist])

  // Sessões do coord: avisa quando uma conclui o plano ou uma em segundo plano termina/falha.
  useEffect(() => {
    if (!opts.persist) return
    let alive = true
    let seen: Map<string, SessionSeen> | null = null
    const poll = () => {
      if (document.hidden) return
      ipc
        .coordAgents()
        .then((raw) => {
          if (!alive) return
          const res = raw as AgentsResponse
          if (res.erro) return setCoordDown(true)
          setCoordDown(false)
          const out = coordNotices(seen, (res.sessoes ?? []) as CoordSessionLike[])
          seen = out.seen
          if (out.notices.length) setItems((list) => out.notices.reduce((l, n) => addItem(l, n), list))
        })
        .catch(() => alive && setCoordDown(true))
    }
    poll()
    const timer = window.setInterval(poll, COORD_POLL_MS)
    document.addEventListener('visibilitychange', poll)
    return () => {
      alive = false
      window.clearInterval(timer)
      document.removeEventListener('visibilitychange', poll)
    }
  }, [opts.persist])

  return useMemo(() => {
    const add = (n: NewInboxItem) => setItems((list) => addItem(list, n))
    return {
      items,
      saveFailed,
      coordDown,
      agent(tabKey, title, cwd, state) {
        const prev = lastAgent.current.get(tabKey)
        if (state === 'off') lastAgent.current.delete(tabKey)
        else lastAgent.current.set(tabKey, state)
        if (prev === state) return
        if (prev === 'blocked') setItems((list) => resolveBlocked(list, tabKey))
        const where = folder(cwd)
        const name = title.trim() || 'Claude Code'
        if (state === 'blocked')
          add({
            kind: 'claude-blocked',
            title: name,
            detail: `Pede permissão para continuar${where ? ` · ${where}` : ''}`,
            tabKey,
          })
        else if (state === 'done')
          add({ kind: 'claude-done', title: name, detail: `Resposta pronta${where ? ` · ${where}` : ''}`, tabKey })
      },
      command(tabKey, title, cmd) {
        const text = cmd.command.trim()
        if (!text || cmd.durationMs < secs.current * 1000) return
        const ok = cmd.exitCode === 0 || cmd.exitCode == null
        add({
          kind: ok ? 'command-ok' : 'command-failed',
          title: title.trim() || 'Terminal',
          detail: `${text} · ${formatSeconds(cmd.durationMs)}${ok ? '' : ` · código ${cmd.exitCode}`}`,
          tabKey,
        })
      },
      program(tabKey, tabTitle, title, body) {
        const name = tabTitle.trim() || 'Terminal'
        add({
          kind: 'program',
          title: title || name,
          detail: title ? `${body}${body ? ' · ' : ''}${name}` : body,
          tabKey,
        })
      },
      read: (id) => setItems((list) => markRead(list, id)),
      readAll: () => setItems((list) => markAllRead(list)),
      clear: () => setItems([]),
    }
  }, [items, saveFailed, coordDown])
}
