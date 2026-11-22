import type { AgentState } from '../features/agent-status/agentState'

export type SessionKind = 'shell' | 'claude'

export interface Settings {
  /** Abre a primeira aba já rodando o Claude Code. */
  startWithClaude: boolean
  fontFamily: string
  fontSize: number
  /** Pasta inicial das abas novas. Vazio = pasta do usuário. */
  defaultCwd: string
  /** Sugestões do PSReadLine (histórico) numa lista abaixo do cursor. Vale para abas novas. */
  shellPredictions: boolean
  /** Id do tema (`system` segue o claro/escuro do Windows). */
  theme: string
  /** Destaques na saída do terminal. */
  highlights: HighlightSettings
  /** Partes da janela: abas na lateral, barra de status e diff do git no topo. */
  layout: LayoutSettings
  /** Perfis (como no Dia): cada um com as suas abas, cor de moldura, pasta inicial e pastas fixadas. */
  profiles: Profile[]
  /** Onde os links do terminal abrem: painel ao lado ou navegador do sistema (Ctrl+clique faz o contrário). */
  linkTarget: 'panel' | 'browser'
  /** Tamanho da interface (zoom do webview, com a fonte do terminal compensada). */
  interfaceSize: 'small' | 'medium' | 'large'
  /** Reabre as abas, grupos e divisões de cada perfil ao abrir o app. */
  restoreSession: boolean
  /** Editor de entrada no estilo do Warp (experimental). */
  inputEditor: boolean
}

export interface Profile {
  /** Letras minúsculas, números e hífen; único. */
  id: string
  /** 1 a 30 caracteres. */
  name: string
  /** Tom do tema (`green`, `accent`...; ver PROFILE_COLORS) que tinge a moldura. */
  color: string
  /** Pasta inicial das abas deste perfil. Vazio = a pasta inicial geral. */
  cwd: string
  /** Pastas fixadas na lateral (até 12). */
  pinned: string[]
}

export interface LayoutSettings {
  /** Abas numa lista na lateral (com pasta, branch e +/-) no lugar da barra de abas. */
  sidebar: boolean
  /** Lateral minimizada: faixa estreita só com os ícones das abas. */
  sidebarCollapsed: boolean
  /** Barra de status embaixo: pasta, branch e alterações da aba ativa. */
  statusBar: boolean
  /** Contador +linhas/-linhas da aba ativa na barra do topo. */
  diffBadge: boolean
}

export interface GitInfo {
  /** `null` com HEAD destacado (aí vale `commit`). */
  branch: string | null
  commit: string | null
  ahead: number
  behind: number
  /** Linhas adicionadas/removidas em relação ao HEAD, ainda não commitadas. */
  added: number
  removed: number
  changed: number
  untracked: number
  conflicts: number
}

export interface FileHit {
  /** Relativo à pasta, com `/`. */
  path: string
  score: number
}

export interface HighlightRule {
  /** Expressão regular (sem barras), até 200 caracteres. */
  pattern: string
  /** Cor `#rrggbb`. */
  color: string
}

export interface HighlightSettings {
  /** `arquivo:linha:coluna` clicável (abre no VS Code). */
  fileLinks: boolean
  /** Marca linhas de erro/aviso e conta nas abas em segundo plano. */
  severity: boolean
  /** Hashes do git clicáveis (copiam). */
  gitHashes: boolean
  /** `localhost:porta` e IPs clicáveis. */
  network: boolean
  /** Níveis de log (INFO, WARN, DEBUG...). */
  logLevels: boolean
  /** Linhas de diff (+/-). */
  diffs: boolean
  /** Datas e horários. */
  timestamps: boolean
  /** UUIDs. */
  uuids: boolean
  rules: HighlightRule[]
}

export interface CreateSessionOptions {
  kind: SessionKind
  cols: number
  rows: number
  cwd?: string
}

export interface CreateSessionResult {
  id: number
  /** Avisos para mostrar no terminal (pasta inválida, Claude ausente...). */
  warnings: string[]
  /** Sem Claude instalado, a aba vira shell. */
  kind: SessionKind
}

export type PtyEvent =
  | { kind: 'data'; data: string; bytes: number }
  | { kind: 'exit'; code: number | null }
  /** Estado do Claude Code da aba, vindo dos hooks (src-tauri/src/agent_status.rs). */
  | { kind: 'agent'; state: AgentState }

export interface LaunchInfo {
  /** Veio --claude na linha de comando ou a configuração pede. */
  openClaudeFirst: boolean
  cwd: string | null
  shellName: string
}

export interface PathSuggestion {
  /** O que aparece na lista: `projeto`, `../projeto-x`. */
  label: string
  /** Comando completo executado no clique: `cd projeto`. */
  command: string
  /** Dentro da pasta atual, vizinha (fora dela), caminho digitado ou pasta recente de qualquer lugar. */
  scope: 'child' | 'parent' | 'path' | 'recent'
}

export interface ClipboardContent {
  text: string | null
  hasImage: boolean
}
