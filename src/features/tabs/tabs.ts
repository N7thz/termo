import type { SessionKind } from '../../shared/types'

export interface Tab {
  key: number
  kind: SessionKind
  title: string
}

export interface TabsState {
  tabs: Tab[]
  active: number | null
  nextKey: number
}

export type TabsAction =
  | { type: 'open'; kind: SessionKind; title: string; after?: number }
  | { type: 'close'; key: number }
  | { type: 'activate'; key: number }
  | { type: 'cycle'; delta: 1 | -1 }
  | { type: 'update'; key: number; patch: Partial<Omit<Tab, 'key'>> }
  | { type: 'move'; key: number; delta: 1 | -1 }

export const initialTabs: TabsState = { tabs: [], active: null, nextKey: 1 }

export function tabsReducer(state: TabsState, action: TabsAction): TabsState {
  switch (action.type) {
    case 'open': {
      const tab: Tab = { key: state.nextKey, kind: action.kind, title: action.title }
      // Com `after`, entra logo à direita daquela aba (duplicar); senão, no fim.
      const at = action.after == null ? -1 : state.tabs.findIndex((t) => t.key === action.after)
      const tabs = at < 0 ? [...state.tabs, tab] : [...state.tabs.slice(0, at + 1), tab, ...state.tabs.slice(at + 1)]
      return { tabs, active: tab.key, nextKey: state.nextKey + 1 }
    }
    case 'close': {
      const idx = state.tabs.findIndex((t) => t.key === action.key)
      if (idx < 0) return state
      const tabs = state.tabs.filter((t) => t.key !== action.key)
      // Fechou a ativa: vai para a vizinha da esquerda (ou a primeira).
      const active = state.active === action.key ? (tabs[Math.max(0, idx - 1)]?.key ?? null) : state.active
      return { ...state, tabs, active }
    }
    case 'activate':
      return state.tabs.some((t) => t.key === action.key) ? { ...state, active: action.key } : state
    case 'cycle': {
      const n = state.tabs.length
      if (n === 0) return state
      const idx = state.tabs.findIndex((t) => t.key === state.active)
      return { ...state, active: state.tabs[(idx + action.delta + n) % n].key }
    }
    case 'update':
      return { ...state, tabs: state.tabs.map((t) => (t.key === action.key ? { ...t, ...action.patch } : t)) }
    case 'move': {
      const from = state.tabs.findIndex((t) => t.key === action.key)
      const to = from + action.delta
      if (from < 0 || to < 0 || to >= state.tabs.length) return state
      const tabs = [...state.tabs]
      ;[tabs[from], tabs[to]] = [tabs[to], tabs[from]]
      return { ...state, tabs }
    }
  }
}

/** Abas que "fechar outras" ou "fechar à direita" de `key` fecham, na ordem da barra. */
export function tabsToClose(state: TabsState, key: number, scope: 'others' | 'right'): number[] {
  const idx = state.tabs.findIndex((t) => t.key === key)
  if (idx < 0) return []
  const keys = state.tabs.map((t) => t.key)
  return scope === 'others' ? keys.filter((k) => k !== key) : keys.slice(idx + 1)
}
