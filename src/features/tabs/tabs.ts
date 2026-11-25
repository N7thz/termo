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
  /** Perfil de shell com que a aba abriu (`pwsh`, `cmd`, `wsl:Ubuntu`...). Sem ele, vale `defaultShell`. */
  shell?: string
  /** Id da saída guardada desta aba (veio da sessão salva): reabre com o texto que ela tinha. */
  outputId?: string
  /**
   * Nome dado à aba (pela pessoa ou pelo Claude, com `termo title`). Vale no lugar do `title`, que é o
   * automático (o que o processo põe no título do terminal) e continua sendo atualizado por baixo.
   */
  label?: string
  /**
   * Nota da aba: progresso, decisões, o que falta. Escrita pela pessoa (menu da aba) ou pelo Claude
   * (`termo nota`). Aparece na lateral, abaixo do nome.
   */
  note?: string
}

/** Maior nota aceita (o Claude escreve resumos; mais que isso vira um arquivo). */
export const MAX_TAB_NOTE = 2000

/** Nota limpa: sem caracteres de controle (quebras de linha ficam), sem linhas vazias nas pontas; vazio tira. */
export function cleanNote(raw: string | null | undefined): string | undefined {
  const note = (raw ?? '')
    .replace(/\r\n?/g, '\n')
    // biome-ignore lint/suspicious/noControlCharactersInRegex: tira caracteres de controle da nota (menos \n e \t)
    .replace(/[\u0000-\u0008\u000b-\u001f\u007f]+/g, '')
    .split('\n')
    .map((l) => l.trimEnd())
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
  return note ? note.slice(0, MAX_TAB_NOTE).trimEnd() : undefined
}

/** Junta uma linha ao fim da nota (o `termo nota --add`); as mais antigas saem se passar do limite. */
export function appendNote(current: string | undefined, line: string): string | undefined {
  const add = cleanNote(line)
  if (!add) return current
  let next = current ? `${current}\n${add}` : add
  while (next.length > MAX_TAB_NOTE && next.includes('\n')) next = next.slice(next.indexOf('\n') + 1)
  return cleanNote(next)
}

/** Última linha com texto da nota: o progresso mais recente, para caber numa linha da lateral. */
export function lastLine(note: string): string {
  const lines = note
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)
  return lines[lines.length - 1] ?? ''
}

/** Maior nome de aba aceito (a lateral corta antes, mas o `termo tabs` mostra inteiro). */
export const MAX_TAB_LABEL = 80

/** Nome limpo para a aba: uma linha só, sem espaços sobrando; vazio tira o nome. */
export function cleanLabel(raw: string | null | undefined): string | undefined {
  const label = (raw ?? '')
    // biome-ignore lint/suspicious/noControlCharactersInRegex: tira caracteres de controle do nome
    .replace(/[\u0000-\u001f\u007f]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  return label ? label.slice(0, MAX_TAB_LABEL) : undefined
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
  /** Um painel ampliado: só a aba ativa do par aparece, sem desfazer a divisão. Não vai para o disco. */
  zoomed?: boolean
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
  tabs: {
    kind: SessionKind
    title: string
    profile: string
    cwd?: string
    group?: string
    shell?: string
    /** Id da saída guardada (`scrollback/<id>.txt`). */
    output?: string
    /** Nome dado à aba (veja `Tab.label`). */
    label?: string
    /** Nota da aba (veja `Tab.note`). */
    note?: string
  }[]
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
      /** Perfil de shell da aba nova (veja `Tab.shell`). */
      shell?: string
      /** Abre já em tela dividida com esta aba (a nova fica à direita). */
      splitWith?: number
    }
  | { type: 'close'; key: number }
  | { type: 'activate'; key: number }
  | { type: 'cycle'; delta: 1 | -1 }
  | { type: 'update'; key: number; patch: Partial<Omit<Tab, 'key' | 'profile' | 'cwd' | 'group'>> }
  /** Dá nome à aba (ou tira, com `null`/vazio): veja `Tab.label`. */
  | { type: 'rename'; key: number; label: string | null }
  /** Troca a nota da aba (ou tira, com `null`/vazio); `append` junta uma linha no fim. Veja `Tab.note`. */
  | { type: 'note'; key: number; note: string | null; append?: boolean }
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
  /** Abre as abas de um layout salvo no perfil atual, com os grupos e divisões dele; a primeira fica ativa. */
  | {
      type: 'open-layout'
      tabs: { kind: SessionKind; title: string; cwd?: string; shell?: string; group?: number }[]
      groups: string[]
      splits: { left: number; right: number; ratio: number }[]
    }
  /** Amplia o painel da aba na tela dividida, ou volta aos dois. */
  | { type: 'zoom'; key: number }
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

/** Mesma regra do Rust (`settings::is_valid_shell`), sem o `auto`: o que a aba guarda é sempre um shell concreto. */
export const isShellId = (s: string) =>
  /^(pwsh|powershell|cmd|bash|wsl|wsl:[A-Za-z0-9._-]{1,64}|ssh:[A-Za-z0-9_][A-Za-z0-9._-]{0,254})$/.test(s)

export function tabsReducer(state: TabsState, action: TabsAction): TabsState {
  switch (action.type) {
    case 'open': {
      const profile = action.profile ?? state.profile
      const tab: Tab = { key: state.nextKey, kind: action.kind, title: action.title, profile }
      if (action.cwd) tab.cwd = action.cwd
      if (action.shell && isShellId(action.shell)) tab.shell = action.shell
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
    case 'rename': {
      const label = cleanLabel(action.label)
      const tab = state.tabs.find((t) => t.key === action.key)
      if (!tab || tab.label === label) return state
      return {
        ...state,
        tabs: state.tabs.map((t) => {
          if (t.key !== action.key) return t
          const { label: _old, ...rest } = t
          return label ? { ...rest, label } : rest
        }),
      }
    }
    case 'note': {
      const tab = state.tabs.find((t) => t.key === action.key)
      if (!tab) return state
      const note = action.append ? appendNote(tab.note, action.note ?? '') : cleanNote(action.note)
      if (tab.note === note) return state
      return {
        ...state,
        tabs: state.tabs.map((t) => {
          if (t.key !== action.key) return t
          const { note: _old, ...rest } = t
          return note ? { ...rest, note } : rest
        }),
      }
    }
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
    case 'open-layout': {
      const profile = state.profile
      const groups = action.groups.slice(0, 16).map((name, i) => ({
        id: `g${state.nextGroup + i}`,
        name: name.trim().slice(0, MAX_GROUP_NAME) || 'Grupo',
        profile,
        collapsed: false,
      }))
      const tabs: Tab[] = action.tabs.slice(0, 16).map((t, i) => {
        const tab: Tab = { key: state.nextKey + i, kind: t.kind, title: t.title, profile }
        if (t.cwd) tab.cwd = t.cwd
        if (t.shell && isShellId(t.shell)) tab.shell = t.shell
        if (t.group != null && groups[t.group]) tab.group = groups[t.group].id
        return tab
      })
      if (tabs.length === 0) return state
      const used = new Set<number>()
      const pairs = action.splits.flatMap((p) => {
        const left = tabs[p.left]
        const right = tabs[p.right]
        if (!left || !right || left === right || used.has(left.key) || used.has(right.key)) return []
        used.add(left.key)
        used.add(right.key)
        return [{ left: left.key, right: right.key, ratio: clampRatio(p.ratio) }]
      })
      const next = {
        ...state,
        tabs: [...state.tabs, ...tabs],
        groups: [...state.groups, ...groups],
        nextKey: state.nextKey + tabs.length,
        nextGroup: state.nextGroup + groups.length,
        pairs: [...withoutPairsOf(state.pairs, ...used), ...pairs],
      }
      return withActive(next, tabs[0].key)
    }
    case 'zoom': {
      const pair = pairOf(state, action.key)
      if (!pair) return state
      return { ...state, pairs: state.pairs.map((p) => (p === pair ? { ...p, zoomed: !p.zoomed } : p)) }
    }
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
export function snapshot(
  state: TabsState,
  cwdOf: (tab: Tab) => string | undefined,
  outputOf: (tab: Tab) => string | undefined = (t) => t.outputId,
): SessionSnapshot {
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
      const output = outputOf(t)
      return {
        kind: t.kind,
        title: t.title,
        profile: t.profile,
        ...(cwd ? { cwd } : {}),
        ...(t.group ? { group: t.group } : {}),
        ...(t.shell ? { shell: t.shell } : {}),
        ...(output && isOutputId(output) ? { output } : {}),
        ...(t.label ? { label: t.label } : {}),
        ...(t.note ? { note: t.note } : {}),
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

/** Id da saída guardada: mesmas regras do Rust (`is_valid_output_id` em session.rs). */
export function isOutputId(id: string): boolean {
  return /^[a-z0-9]{1,32}$/.test(id)
}

/** Id da saída de uma aba: o que veio da sessão salva, senão um novo (guardado em `ids` pela chave da aba). */
export function outputIdFor(
  ids: Map<number, string>,
  tab: { key: number; outputId?: string },
  make = () => crypto.randomUUID().replaceAll('-', ''),
): string {
  if (tab.outputId) return tab.outputId
  let id = ids.get(tab.key)
  if (!id) {
    id = make()
    ids.set(tab.key, id)
  }
  return id
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
    // Snapshots antigos não têm o campo: a aba abre com o shell padrão.
    if (typeof t.shell === 'string' && isShellId(t.shell)) tab.shell = t.shell
    if (typeof t.output === 'string' && isOutputId(t.output)) tab.outputId = t.output
    const label = cleanLabel(str(t.label, 1000))
    if (label) tab.label = label
    const note = cleanNote(str(t.note, MAX_TAB_NOTE * 2))
    if (note) tab.note = note
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
