/**
 * Contrato tipado com o backend Rust (src-tauri/src/lib.rs). Toda chamada ao Tauri passa por aqui:
 * se um comando mudar de nome ou de formato, só este arquivo muda.
 */
import { Channel, invoke } from '@tauri-apps/api/core'
import type { BrowserBounds } from '../features/browser/types'
import type { GitBranchInfo } from '../features/git-branch/types'
import type { NodeInfo, NodeVersions } from '../features/node-version/types'
import type { SessionSnapshot } from '../features/tabs/tabs'
import type { ClaudeUsage } from '../features/usage-battery/usage'
import type {
  ClipboardContent,
  CreateSessionOptions,
  CreateSessionResult,
  FileHit,
  GitInfo,
  LaunchInfo,
  PathSuggestion,
  PtyEvent,
  Settings,
} from '../shared/types'

export const ipc = {
  launchInfo: () => invoke<LaunchInfo>('launch_info'),

  /** Abre uma sessão; `onEvent` recebe a saída e o fim do processo. */
  createSession(opts: CreateSessionOptions, onEvent: (ev: PtyEvent) => void) {
    const channel = new Channel<PtyEvent>()
    channel.onmessage = onEvent
    return invoke<CreateSessionResult>('pty_create', { opts, onEvent: channel })
  },
  write: (id: number, data: string) => invoke<void>('pty_write', { id, data }),
  resize: (id: number, cols: number, rows: number) => invoke<void>('pty_resize', { id, cols, rows }),
  /** Confirma que `bytes` já foram desenhados (controle de vazão). */
  ack: (id: number, bytes: number) => invoke<void>('pty_ack', { id, bytes }),
  kill: (id: number) => invoke<void>('pty_kill', { id }),

  /** Pastas que combinam com `query` a partir de `cwd`, cada uma com o `cd` pronto. */
  suggestPaths: (cwd: string, query: string) => invoke<PathSuggestion[]>('suggest_paths', { cwd, query }),
  /** Registra a pasta atual no histórico de pastas recentes (a cada mudança de pasta). */
  recordDir: (path: string) => invoke<void>('record_dir', { path }),
  /** Pastas recentes, mais relevantes primeiro. */
  recentDirs: (limit?: number) => invoke<string[]>('recent_dirs', { limit: limit ?? null }),
  /** Branch e alterações do git da pasta; `null` fora de repositório. */
  gitInfo: (cwd: string) => invoke<GitInfo | null>('git_info', { cwd }),
  /** Branches locais (a atual primeiro) e as remotas sem cópia local; `null` fora de repositório. */
  gitBranches: (cwd: string) => invoke<GitBranchInfo[] | null>('git_branches', { cwd }),
  /** Troca de branch com `git switch`; rejeita com a mensagem do git (ex.: alterações não salvas). */
  gitSwitch: (cwd: string, branch: string) => invoke<void>('git_switch', { cwd, branch }),
  /** Cria a branch a partir do HEAD e troca para ela (`git switch -c`); rejeita com a mensagem do git. */
  gitCreateBranch: (cwd: string, branch: string) => invoke<void>('git_create_branch', { cwd, branch }),
  /** Versão do `node` que o shell da aba resolve (o caminho vem do prompt) e se a pasta é projeto Node. */
  nodeInfo: (node: string | null, cwd: string | null) => invoke<NodeInfo>('node_info', { node, cwd }),
  /** Gerenciador de versões do Node (fnm, nvm-windows, Volta) e as versões instaladas. */
  nodeVersions: () => invoke<NodeVersions>('node_versions'),
  /** Arquivos da pasta que combinam com a busca (correspondência difusa). */
  searchFiles: (cwd: string, query: string, limit?: number) =>
    invoke<FileHit[]>('search_files', { cwd, query, limit: limit ?? null }),
  openFolder: (path: string) => invoke<void>('open_folder', { path }),

  /** Sessões do Claude Code no painel do coord (`/agents`); o formato está em features/sessions/sessions.ts. */
  coordAgents: () => invoke<unknown>('coord_agents'),
  /** Histórico do coord (`/state`): sessões que já terminaram. */
  coordState: () => invoke<unknown>('coord_state'),
  /** Uso do plano do Claude (5 h e semana), do último `statusLine` das abas do Claude Code. */
  claudeUsage: () => invoke<ClaudeUsage>('claude_usage'),
  /** Abre outra janela do Termo; a primeira aba dela abre em `cwd`. */
  newWindow: (cwd?: string | null) => invoke<void>('new_window', { cwd: cwd ?? null }),
  /** IA pelo Claude Code: `explain` explica um erro; `command` converte um pedido em comando (sem executar). */
  aiAsk: (mode: 'explain' | 'command', input: string, cwd?: string | null) =>
    invoke<string>('ai_ask', { mode, input, cwd: cwd ?? null }),

  /** Abas, grupos e divisões da última vez (validados em `restore`, em features/tabs/tabs.ts). */
  loadSession: () => invoke<unknown>('session_load'),
  saveSession: (session: SessionSnapshot) => invoke<void>('session_save', { session }),

  getSettings: () => invoke<Settings>('settings_get'),
  setSettings: (patch: Partial<Settings>) => invoke<Settings>('settings_set', { patch }),

  readClipboard: () => invoke<ClipboardContent>('clipboard_read'),
  writeClipboard: (text: string) => invoke<void>('clipboard_write', { text }),
  openUrl: (url: string) => invoke<void>('open_url', { url }),

  /** Painel de navegador ao lado do terminal (webview nativo posicionado em `bounds`, em pixels lógicos). */
  browserOpen: (url: string, bounds: BrowserBounds) => invoke<void>('browser_open', { url, bounds }),
  browserBounds: (bounds: BrowserBounds) => invoke<void>('browser_bounds', { bounds }),
  browserVisible: (visible: boolean) => invoke<void>('browser_visible', { visible }),
  browserGo: (action: 'back' | 'forward' | 'reload') => invoke<void>('browser_go', { action }),
  browserClose: () => invoke<void>('browser_close'),
  /** Abre o arquivo no VS Code na linha/coluna (ou no app padrão); caminho relativo usa `cwd`. */
  openInEditor: (path: string, line?: number, column?: number, cwd?: string | null) =>
    invoke<void>('open_in_editor', { path, line: line ?? null, column: column ?? null, cwd: cwd ?? null }),
}
