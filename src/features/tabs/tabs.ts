import type { SessionKind } from '../../shared/types'

export interface Tab {
  key: number
  kind: SessionKind
  title: string
  /** Id do perfil dono da aba. Cada perfil mostra só as suas abas, como os Profiles do Dia. */
  profile: string
  /** Pasta em que a aba abriu (pasta fixada ou duplicada). Sem ela, vale a do perfil. */
  cwd?: string
  /** Grupo com nome em que a aba está (dentro do perfil dela). */
  group?: string
}

/** Grupo de abas com nome, como as pastas da lateral do Arc/Dia. */
export interface TabGroup {
  id: string
  name: string
  profile: string
  collapsed: boolean
}

/** Duas abas lado a lado no cartão (tela dividida). `ratio` é a largura da esquerda, de 0.2 a 0.8. */
export interface SplitPair {
  left: number
  right: number
  ratio: number
}

export interface TabsState {
  /** Abas de todos os perfis, na ordem em que foram abertas/movidas. */
  tabs: Tab[]
  /** Aba ativa do perfil atual (null quando ele está vazio). */
  active: number | null
  nextKey: number
  /** Perfil em uso. */
  profile: string
  /** Última aba ativa de cada perfil, para voltar a ela ao trocar de perfil. */
  lastActive: Readonly<Record<string, number>>
  groups: TabGroup[]
  nextGroup: number
  pairs: SplitPair[]
}

/** O que vai para o disco ao fechar e volta ao abrir (as chaves das abas são refeitas). */
export interface SessionSnapshot {
  version: 1
  profile: string
  tabs: { kind: SessionKind; title: string; profile: string; cwd?: string; group?: string }[]
  /** Índice (em `tabs`) da aba ativa de cada perfil. */
  active: Record<string, number>
  groups: TabGroup[]
  /** Pares por índice em `tabs`. */
  pairs: { left: number; right: number; ratio: number }[]
}

export type TabsAction =
  | {
      type: 'open'
      kind: SessionKind
      title: string
      after?: number
      profile?: string
      cwd?: string
      group?: string
      /** Abre já em tela dividida com esta aba (a nova fica à direita). */
      splitWith?: number
    }
  | { type: 'close'; key: number }
  | { type: 'activate'; key: number }
  | { type: 'cycle'; delta: 1 | -1 }
  | { type: 'update'; key: number; patch: Partial<Omit<Tab, 'key' | 'profile' | 'cwd' | 'group'>> }
  | { type: 'move'; key: number; delta: 1 | -1 }
  /**
   * Arrastar: põe a aba logo antes de `before` (e no grupo dela). Sem `before`, vai para o fim do
   * grupo `group` (ou das soltas, com `group: null`).
   */
  | { type: 'reorder'; key: number; before: number | null; group: string | null }
  | { type: 'switch-profile'; profile: string }
  /** O perfil foi excluído: as abas dele passam para `to`. */
  | { type: 'remove-profile'; profile: string; to: string }
  /** Cria um grupo com a aba dentro. */
  | { type: 'group-create'; key: number; name: string }
  | { type: 'group-rename'; id: string; name: string }
  | { type: 'group-toggle'; id: string }
  /** Desfaz o grupo: as abas continuam abertas, soltas. */
  | { type: 'group-delete'; id: string }
  /** Põe a aba num grupo do perfil dela (ou tira, com `null`). */
  | { type: 'set-group'; key: number; group: string | null }
  | { type: 'split'; key: number; with: number }
  | { type: 'unsplit'; key: number }
  | { type: 'split-ratio'; key: number; ratio: number }
  /** `profiles`: perfis que ainda existem (abas e grupos de perfis excluídos ficam de fora). */
  | { type: 'restore'; snapshot: unknown; profiles?: readonly string[] }

export const initialTabs: TabsState = {
  tabs: [],
  active: null,
  nextKey: 1,
  profile: 'principal',
  lastActive: {},
  groups: [],
  nextGroup: 1,
  pairs: [],
}

export const MAX_GROUP_NAME = 40
const clampRatio = (r: number) => (Number.isFinite(r) ? Math.min(0.8, Math.max(0.2, r)) : 0.5)

/** Grupos do perfil atual, na ordem de criação. */
export function visibleGroups(state: TabsState): TabGroup[] {
  return state.groups.filter((g) => g.profile === state.profile)
}

/**
 * Abas do perfil atual na ordem da tela: primeiro as dos grupos (na ordem dos grupos), depois as soltas.
 * É a mesma ordem da lateral, então Ctrl+1..8 e Ctrl+Tab seguem o que se vê.
 */
export function visibleTabs(state: TabsState): Tab[] {
  const mine = state.tabs.filter((t) => t.profile === state.profile)
  const groups = visibleGroups(state)
  const grouped = groups.flatMap((g) => mine.filter((t) => t.group === g.id))
  const known = new Set(groups.map((g) => g.id))
  return [...grouped, ...mine.filter((t) => !t.group || !known.has(t.group))]
}

/** O par de tela dividida de que a aba faz parte, se houver. */
export function pairOf(state: Pick<TabsState, 'pairs'>, key: number | null): SplitPair | undefined {
  return key == null ? undefined : state.pairs.find((p) => p.left === key || p.right === key)
}

function withActive(state: TabsState, active: number | null): TabsState {
  const lastActive = active == null ? state.lastActive : { ...state.lastActive, [state.profile]: active }
  return { ...state, active, lastActive }
}

const withoutPairsOf = (pairs: SplitPair[], ...keys: number[]) =>
  pairs.filter((p) => !keys.includes(p.left) && !keys.includes(p.right))

export function tabsReducer(state: TabsState, action: TabsAction): TabsState {
  switch (action.type) {
    case 'open': {
      const profile = action.profile ?? state.profile
      const tab: Tab = { key: state.nextKey, kind: action.kind, title: action.title, profile }
      if (action.cwd) tab.cwd = action.cwd
      if (action.group && state.groups.some((g) => g.id === action.group && g.profile === profile))
        tab.group = action.group
      // Com `after`, entra logo à direita daquela aba (duplicar); senão, no fim.
      const at = action.after == null ? -1 : state.tabs.findIndex((t) => t.key === action.after)
      const tabs = at < 0 ? [...state.tabs, tab] : [...state.tabs.slice(0, at + 1), tab, ...state.tabs.slice(at + 1)]
      let pairs = state.pairs
      const partner = action.splitWith == null ? undefined : state.tabs.find((t) => t.key === action.splitWith)
      if (partner && partner.profile === profile) {
        pairs = [...withoutPairsOf(pairs, partner.key), { left: partner.key, right: tab.key, ratio: 0.5 }]
      }
      return withActive({ ...state, tabs, pairs, profile, nextKey: state.nextKey + 1 }, tab.key)
    }
    case 'close': {
      const closing = state.tabs.find((t) => t.key === action.key)
      if (!closing) return state
      const tabs = state.tabs.filter((t) => t.key !== action.key)
      const lastActive = { ...state.lastActive }
      if (lastActive[closing.profile] === action.key) delete lastActive[closing.profile]
      const pair = pairOf(state, action.key)
      const next = { ...state, tabs, lastActive, pairs: withoutPairsOf(state.pairs, action.key) }
      if (state.active !== action.key) return next
      // Fechou a ativa: na tela dividida, fica a outra metade; senão, a vizinha de cima (ou a primeira).
      if (pair) return withActive(next, pair.left === action.key ? pair.right : pair.left)
      const mine = visibleTabs(state)
      const idx = mine.findIndex((t) => t.key === action.key)
      const rest = mine.filter((t) => t.key !== action.key)
      return withActive(next, rest[Math.max(0, idx - 1)]?.key ?? null)
    }
    case 'activate': {
      const tab = state.tabs.find((t) => t.key === action.key)
      if (!tab) return state
      // Abrir uma aba de um grupo recolhido abre o grupo, para ela aparecer na lateral.
      const groups = tab.group
        ? state.groups.map((g) => (g.id === tab.group && g.collapsed ? { ...g, collapsed: false } : g))
        : state.groups
      // Ativar uma aba de outro perfil (pela busca) troca de perfil junto.
      return withActive({ ...state, groups, profile: tab.profile }, tab.key)
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
      // Troca de lugar com a vizinha de tela, se as duas estiverem no mesmo grupo (ou as duas soltas).
      const mine = visibleTabs(state)
      const from = mine.findIndex((t) => t.key === action.key)
      const to = from + action.delta
      if (from < 0 || to < 0 || to >= mine.length || mine[from].group !== mine[to].group) return state
      const a = state.tabs.indexOf(mine[from])
      const b = state.tabs.indexOf(mine[to])
      const tabs = [...state.tabs]
      ;[tabs[a], tabs[b]] = [tabs[b], tabs[a]]
      return { ...state, tabs }
    }
    case 'reorder': {
      const tab = state.tabs.find((t) => t.key === action.key)
      if (!tab || action.before === action.key) return state
      const target = action.before == null ? undefined : state.tabs.find((t) => t.key === action.before)
      if (action.before != null && (!target || target.profile !== tab.profile)) return state
      // O grupo vem da aba de referência; sem ela, do destino pedido (que precisa existir no perfil).
      const groupId = target ? target.group : (action.group ?? undefined)
      if (groupId && !state.groups.some((g) => g.id === groupId && g.profile === tab.profile)) return state
      const moved = { ...tab, group: groupId }
      const rest = state.tabs.filter((t) => t.key !== tab.key)
      let at: number
      if (target) {
        at = rest.indexOf(target)
      } else {
        // Fim do grupo (ou das soltas) no perfil: logo depois da última aba de lá; vazio, no fim da lista.
        const known = new Set(state.groups.filter((g) => g.profile === tab.profile).map((g) => g.id))
        const same = (t: Tab) =>
          t.profile === tab.profile && (groupId ? t.group === groupId : !t.group || !known.has(t.group))
        let lastIdx = -1
        rest.forEach((t, i) => {
          if (same(t)) lastIdx = i
        })
        at = lastIdx < 0 ? rest.length : lastIdx + 1
      }
      const tabs = [...rest.slice(0, at), moved, ...rest.slice(at)]
      const unchanged = tab.group === groupId && tabs.every((t, i) => t.key === state.tabs[i].key)
      return unchanged ? state : { ...state, tabs }
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
      const groups = state.groups.map((g) => (g.profile === action.profile ? { ...g, profile: action.to } : g))
      const lastActive = { ...state.lastActive }
      delete lastActive[action.profile]
      const next = { ...state, tabs, groups, lastActive }
      return state.profile === action.profile
        ? tabsReducer({ ...next, profile: '' }, { type: 'switch-profile', profile: action.to })
        : next
    }
    case 'group-create': {
      const tab = state.tabs.find((t) => t.key === action.key)
      if (!tab) return state
      const id = `g${state.nextGroup}`
      const name = action.name.trim().slice(0, MAX_GROUP_NAME) || `Grupo ${state.nextGroup}`
      const group: TabGroup = { id, name, profile: tab.profile, collapsed: false }
      return {
        ...state,
        groups: [...state.groups, group],
        nextGroup: state.nextGroup + 1,
        tabs: state.tabs.map((t) => (t.key === tab.key ? { ...t, group: id } : t)),
      }
    }
    case 'group-rename': {
      const name = action.name.trim().slice(0, MAX_GROUP_NAME)
      if (!name) return state
      return { ...state, groups: state.groups.map((g) => (g.id === action.id ? { ...g, name } : g)) }
    }
    case 'group-toggle':
      return {
        ...state,
        groups: state.groups.map((g) => (g.id === action.id ? { ...g, collapsed: !g.collapsed } : g)),
      }
    case 'group-delete':
      return {
        ...state,
        groups: state.groups.filter((g) => g.id !== action.id),
        tabs: state.tabs.map((t) => (t.group === action.id ? { ...t, group: undefined } : t)),
      }
    case 'set-group': {
      const tab = state.tabs.find((t) => t.key === action.key)
      if (!tab) return state
      if (action.group != null && !state.groups.some((g) => g.id === action.group && g.profile === tab.profile))
        return state
      const group = action.group ?? undefined
      return { ...state, tabs: state.tabs.map((t) => (t.key === action.key ? { ...t, group } : t)) }
    }
    case 'split': {
      const a = state.tabs.find((t) => t.key === action.key)
      const b = state.tabs.find((t) => t.key === action.with)
      if (!a || !b || a.key === b.key || a.profile !== b.profile) return state
      const pairs = [...withoutPairsOf(state.pairs, a.key, b.key), { left: a.key, right: b.key, ratio: 0.5 }]
      return withActive({ ...state, pairs }, a.key)
    }
    case 'unsplit':
      return { ...state, pairs: withoutPairsOf(state.pairs, action.key) }
    case 'split-ratio':
      return {
        ...state,
        pairs: state.pairs.map((p) =>
          p.left === action.key || p.right === action.key ? { ...p, ratio: clampRatio(action.ratio) } : p,
        ),
      }
    case 'restore':
      return restore(action.snapshot, state, action.profiles && new Set(action.profiles))
  }
}

/** Abas que "fechar outras" ou "fechar à direita" de `key` fecham, só no perfil atual e na ordem da tela. */
export function tabsToClose(state: TabsState, key: number, scope: 'others' | 'right'): number[] {
  const keys = visibleTabs(state).map((t) => t.key)
  const idx = keys.indexOf(key)
  if (idx < 0) return []
  return scope === 'others' ? keys.filter((k) => k !== key) : keys.slice(idx + 1)
}

/** Foto do estado para salvar. `cwdOf` dá a pasta atual de cada aba (a do prompt, se já houver). */
export function snapshot(state: TabsState, cwdOf: (tab: Tab) => string | undefined): SessionSnapshot {
  const index = new Map(state.tabs.map((t, i) => [t.key, i]))
  const active: Record<string, number> = {}
  const remember = { ...state.lastActive, ...(state.active == null ? {} : { [state.profile]: state.active }) }
  for (const [profile, key] of Object.entries(remember)) {
    const i = index.get(key)
    if (i != null) active[profile] = i
  }
  return {
    version: 1,
    profile: state.profile,
    tabs: state.tabs.map((t) => {
      const cwd = cwdOf(t)
      return {
        kind: t.kind,
        title: t.title,
        profile: t.profile,
        ...(cwd ? { cwd } : {}),
        ...(t.group ? { group: t.group } : {}),
      }
    }),
    active,
    groups: state.groups,
    pairs: state.pairs.flatMap((p) => {
      const left = index.get(p.left)
      const right = index.get(p.right)
      return left == null || right == null ? [] : [{ left, right, ratio: p.ratio }]
    }),
  }
}

/** Valida o que veio do disco (pode estar velho ou corrompido) e monta o estado com chaves novas. */
export function restore(raw: unknown, base: TabsState = initialTabs, allowed?: ReadonlySet<string>): TabsState {
  const snap = raw as Partial<SessionSnapshot> | null
  if (snap?.version !== 1 || !Array.isArray(snap.tabs)) return base
  const isKind = (k: unknown): k is SessionKind => k === 'shell' || k === 'claude'
  const str = (v: unknown, max = 500) => (typeof v === 'string' && v.length <= max ? v : undefined)

  const groups: TabGroup[] = (Array.isArray(snap.groups) ? snap.groups : []).flatMap((g) => {
    const id = str(g?.id, 20)
    const name = str(g?.name, MAX_GROUP_NAME)
    const profile = str(g?.profile, 40)
    return id && name && profile && (!allowed || allowed.has(profile))
      ? [{ id, name, profile, collapsed: g.collapsed === true }]
      : []
  })
  const groupIds = new Set(groups.map((g) => g.id))

  // Índice antigo → chave nova (abas inválidas ficam de fora).
  const keyOf = new Map<number, number>()
  const tabs: Tab[] = []
  snap.tabs.slice(0, 100).forEach((t, i) => {
    const profile = str(t?.profile, 40)
    if (!t || !isKind(t.kind) || !profile || (allowed && !allowed.has(profile))) return
    const key = tabs.length + 1
    keyOf.set(i, key)
    const tab: Tab = {
      key,
      kind: t.kind,
      title: str(t.title, 200) ?? (t.kind === 'claude' ? 'Claude Code' : 'shell'),
      profile,
    }
    const cwd = str(t.cwd, 1000)
    if (cwd) tab.cwd = cwd
    if (t.group && groupIds.has(t.group)) tab.group = t.group
    tabs.push(tab)
  })
  if (tabs.length === 0) return base

  const lastActive: Record<string, number> = {}
  for (const [profile, i] of Object.entries(snap.active ?? {})) {
    const key = keyOf.get(i)
    if (key != null && tabs.some((t) => t.key === key && t.profile === profile)) lastActive[profile] = key
  }
  const used = new Set<number>()
  const pairs: SplitPair[] = (Array.isArray(snap.pairs) ? snap.pairs : []).flatMap((p) => {
    const left = keyOf.get(p?.left)
    const right = keyOf.get(p?.right)
    if (left == null || right == null || left === right || used.has(left) || used.has(right)) return []
    used.add(left)
    used.add(right)
    return [{ left, right, ratio: clampRatio(p.ratio) }]
  })
  const nextGroup = groups.reduce((n, g) => Math.max(n, Number(g.id.replace(/^g/, '')) || 0), 0) + 1

  const profile =
    str(snap.profile, 40) && tabs.some((t) => t.profile === snap.profile) ? (snap.profile as string) : tabs[0].profile
  const active = lastActive[profile] ?? tabs.find((t) => t.profile === profile)?.key ?? null
  return { tabs, active, nextKey: tabs.length + 1, profile, lastActive, groups, nextGroup, pairs }
}
