/**
 * Estado do Claude Code de uma aba, como o backend manda (ver `agent_status.rs`).
 * `off` quer dizer que o Claude saiu e a aba voltou a ser um shell comum.
 */
export type AgentState = 'idle' | 'thinking' | 'working' | 'waiting' | 'blocked' | 'done' | 'off'

export const AGENT_LABEL: Record<Exclude<AgentState, 'off'>, string> = {
  idle: 'Claude pronto',
  thinking: 'Pensando',
  working: 'Trabalhando',
  waiting: 'Esperando você',
  blocked: 'Pedindo permissão',
  done: 'Terminou',
}

/** Estados que pedem o olho do usuário quando a aba não está aberta. */
export function needsAttention(state: AgentState | undefined): boolean {
  return state === 'blocked' || state === 'waiting' || state === 'done'
}

/**
 * Estado depois que o usuário viu a aba: o "terminou" vira "pronto". Os outros ficam, porque
 * o pedido de permissão e a espera continuam valendo até ele responder.
 */
export function afterSeen(state: AgentState | undefined): AgentState | undefined {
  return state === 'done' ? 'idle' : state
}

/** Guarda o estado novo de uma aba num mapa imutável. `off` some do mapa. */
export function withAgentState(
  map: ReadonlyMap<number, AgentState>,
  key: number,
  state: AgentState,
): Map<number, AgentState> {
  const next = new Map(map)
  if (state === 'off') next.delete(key)
  else next.set(key, state)
  return next
}
