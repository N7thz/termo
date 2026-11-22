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
}

export interface LayoutSettings {
  /** Abas numa lista na lateral (com pasta, branch e +/-) no lugar da barra de abas. */
  sidebar: boolean
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

export type PtyEvent = { kind: 'data'; data: string; bytes: number } | { kind: 'exit'; code: number | null }

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
