import type { SessionKind } from '../../shared/types'

export interface Tab {
  key: number
  kind: SessionKind
  title: string
  /** Id do perfil dono da aba. Cada perfil mostra só as suas abas, como os Profiles do Dia. */
  profile: string
  /** Pasta em que a aba abriu (pasta fixada ou duplicada). Sem ela, vale a do perfil. */
  cwd?: string
}

export interface TabsState {
  /** Abas de todos os perfis, na ordem da barra. */
  tabs: Tab[]
  /** Aba ativa do perfil atual (null quando ele está vazio). */
  active: number | null
  nextKey: number
  /** Perfil em uso. */
  profile: string
  /** Última aba ativa de cada perfil, para voltar a ela ao trocar de perfil. */
  lastActive: Readonly<Record<string, number>>
}

export type TabsAction =
  | { type: 'open'; kind: SessionKind; title: string; after?: number; profile?: string; cwd?: string }
  | { type: 'close'; key: number }
  | { type: 'activate'; key: number }
  | { type: 'cycle'; delta: 1 | -1 }
  | { type: 'update'; key: number; patch: Partial<Omit<Tab, 'key' | 'profile' | 'cwd'>> }
  | { type: 'move'; key: number; delta: 1 | -1 }
  | { type: 'switch-profile'; profile: string }
  /** O perfil foi excluído: as abas dele passam para `to`. */
  | { type: 'remove-profile'; profile: string; to: string }

export const initialTabs: TabsState = { tabs: [], active: null, nextKey: 1, profile: 'principal', lastActive: {} }

/** Abas do perfil atual, na ordem da barra. */
export function visibleTabs(state: TabsState): Tab[] {
  return state.tabs.filter((t) => t.profile === state.profile)
}

function withActive(state: TabsState, active: number | null): TabsState {
  const lastActive = active == null ? state.lastActive : { ...state.lastActive, [state.profile]: active }
  return { ...state, active, lastActive }
}

export function tabsReducer(state: TabsState, action: TabsAction): TabsState {
  switch (action.type) {
    case 'open': {
      const profile = action.profile ?? state.profile
      const tab: Tab = { key: state.nextKey, kind: action.kind, title: action.title, profile }
      if (action.cwd) tab.cwd = action.cwd
      // Com `after`, entra logo à direita daquela aba (duplicar); senão, no fim.
      const at = action.after == null ? -1 : state.tabs.findIndex((t) => t.key === action.after)
      const tabs = at < 0 ? [...state.tabs, tab] : [...state.tabs.slice(0, at + 1), tab, ...state.tabs.slice(at + 1)]
      return withActive({ ...state, tabs, profile, nextKey: state.nextKey + 1 }, tab.key)
    }
    case 'close': {
      const closing = state.tabs.find((t) => t.key === action.key)
      if (!closing) return state
      const tabs = state.tabs.filter((t) => t.key !== action.key)
      const lastActive = { ...state.lastActive }
      if (lastActive[closing.profile] === action.key) delete lastActive[closing.profile]
      const next = { ...state, tabs, lastActive }
      if (state.active !== action.key) return next
      // Fechou a ativa: vai para a vizinha da esquerda no mesmo perfil (ou a primeira dele).
      const mine = visibleTabs(state)
      const idx = mine.findIndex((t) => t.key === action.key)
      const rest = mine.filter((t) => t.key !== action.key)
      return withActive(next, rest[Math.max(0, idx - 1)]?.key ?? null)
    }
    case 'activate': {
      const tab = state.tabs.find((t) => t.key === action.key)
      // Ativar uma aba de outro perfil (pela busca) troca de perfil junto.
      return tab ? withActive({ ...state, profile: tab.profile }, tab.key) : state
    }
    case 'cycle': {
      const mine = visibleTabs(state)
      const n = mine.length
      if (n === 0) return state
      const idx = mine.findIndex((t) => t.key === state.active)
      return withActive(state, mine[(idx + action.delta + n) % n].key)
    }
    case 'update':
      return { ...state, tabs: state.tabs.map((t) => (t.key === action.key ? { ...t, ...action.patch } : t)) }
    case 'move': {
      // Troca de lugar com a vizinha do mesmo perfil; as dos outros perfis ficam onde estão.
      const mine = visibleTabs(state)
      const from = mine.findIndex((t) => t.key === action.key)
      const to = from + action.delta
      if (from < 0 || to < 0 || to >= mine.length) return state
      const a = state.tabs.indexOf(mine[from])
      const b = state.tabs.indexOf(mine[to])
      const tabs = [...state.tabs]
      ;[tabs[a], tabs[b]] = [tabs[b], tabs[a]]
      return { ...state, tabs }
    }
    case 'switch-profile': {
      if (action.profile === state.profile) return state
      const mine = state.tabs.filter((t) => t.profile === action.profile)
      const remembered = state.lastActive[action.profile]
      const active = mine.some((t) => t.key === remembered) ? remembered : (mine[0]?.key ?? null)
      return { ...state, profile: action.profile, active }
    }
    case 'remove-profile': {
      if (action.profile === action.to) return state
      const tabs = state.tabs.map((t) => (t.profile === action.profile ? { ...t, profile: action.to } : t))
      const lastActive = { ...state.lastActive }
      delete lastActive[action.profile]
      const next = { ...state, tabs, lastActive }
      return state.profile === action.profile
        ? tabsReducer({ ...next, profile: '' }, { type: 'switch-profile', profile: action.to })
        : next
    }
  }
}

/** Abas que "fechar outras" ou "fechar à direita" de `key` fecham, só no perfil atual e na ordem da barra. */
export function tabsToClose(state: TabsState, key: number, scope: 'others' | 'right'): number[] {
  const keys = visibleTabs(state).map((t) => t.key)
  const idx = keys.indexOf(key)
  if (idx < 0) return []
  return scope === 'others' ? keys.filter((k) => k !== key) : keys.slice(idx + 1)
}
