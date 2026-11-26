/**
 * Contrato tipado com o backend Rust (src-tauri/src/lib.rs). Toda chamada ao Tauri passa por aqui:
 * se um comando mudar de nome ou de formato, só este arquivo muda.
 */
import { Channel, invoke } from '@tauri-apps/api/core'
import { listen } from '@tauri-apps/api/event'
import type { BrowserBounds } from '../features/browser/types'
import type { ClaudeLine } from '../features/claude-bar/claude'
import type { FileDiff, ReviewStatus } from '../features/code-review/diff'
import type { ImportFile } from '../features/config-io/configFile'
import type { GitBranchInfo } from '../features/git-branch/types'
import type { NodeInfo, NodeVersions } from '../features/node-version/types'
import type { AgentDef } from '../features/roles/RolesContext'
import type { SessionSnapshot } from '../features/tabs/tabs'
import type { ProgressState } from '../features/terminal/programOsc'
import type { UpdateInfo } from '../features/updater/types'
import type { ClaudeUsage } from '../features/usage-battery/usage'
import type { Worktree, WorktreeList } from '../features/worktree/worktree'
import type {
  ClipboardContent,
  CreateSessionOptions,
  CreateSessionResult,
  FileHit,
  GitInfo,
  LaunchInfo,
  MemoryUsage,
  PathSuggestion,
  PtyEvent,
  Settings,
  ShellInfo,
} from '../shared/types'

export const ipc = {
  launchInfo: () => invoke<LaunchInfo>('launch_info'),

  /** Abre uma sessão; `onEvent` recebe a saída e o fim do processo. */
  createSession(opts: CreateSessionOptions, onEvent: (ev: PtyEvent) => void) {
    const channel = new Channel<PtyEvent>()
    channel.onmessage = onEvent
    return invoke<CreateSessionResult>('pty_create', { opts, onEvent: channel })
  },
  /** Shells instalados: pwsh, Windows PowerShell, cmd e as distros do WSL. */
  shellList: () => invoke<ShellInfo[]>('shell_list'),
  /** Hosts do `~/.ssh/config` (sem curingas) para as abas SSH. */
  sshHosts: () => invoke<string[]>('ssh_hosts'),
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
  /** Cópias (`git worktree`) do repositório da pasta, com commits à frente e alterações não commitadas. */
  /** Uso de memória do Termo e de tudo que ele abriu. */
  memoryUsage: () => invoke<MemoryUsage>('memory_usage'),
  /** A janela entrou ou saiu do segundo plano (modo leve); devolve o uso depois. */
  memoryBackground: (hidden: boolean) => invoke<MemoryUsage>('memory_background', { hidden }),
  /** Agentes (`.claude/agents`) do projeto da pasta e do usuário: os papéis para abrir o Claude. */
  claudeAgents: (cwd: string | null) => invoke<AgentDef[]>('claude_agents', { cwd }),
  worktreeList: (cwd: string) => invoke<WorktreeList>('worktree_list', { cwd }),
  /** Cria a cópia `<nome>` na branch `termo/<nome>`, ao lado do repositório. */
  worktreeCreate: (cwd: string, name: string) => invoke<Worktree>('worktree_create', { cwd, name }),
  /** Junta a cópia na branch da pasta principal e a remove; devolve quantos commits entraram. */
  worktreeMerge: (cwd: string, path: string) => invoke<number>('worktree_merge', { cwd, path }),
  /** Apaga a cópia, os commits e as alterações dela. */
  worktreeDiscard: (cwd: string, path: string) => invoke<void>('worktree_discard', { cwd, path }),
  /** Versão do `node` que o shell da aba resolve (o caminho vem do prompt) e se a pasta é projeto Node. */
  nodeInfo: (node: string | null, cwd: string | null) => invoke<NodeInfo>('node_info', { node, cwd }),
  /** Gerenciador de versões do Node (fnm, nvm-windows, Volta) e as versões instaladas. */
  nodeVersions: () => invoke<NodeVersions>('node_versions'),
  /** Dos nomes citados na saída de um comando, as imagens que existem (absolutas, até 24). */
  imageExisting: (cwd: string | null, candidates: string[]) => invoke<string[]>('image_existing', { cwd, candidates }),
  /** A imagem como `data:` para a prévia (até 12 MB). */
  imagePreview: (path: string) => invoke<{ dataUrl: string; bytes: number }>('image_preview', { path }),
  /** Abre a imagem no visualizador padrão do sistema. */
  imageOpen: (path: string) => invoke<void>('image_open', { path }),
  /** Grava a imagem da área de transferência como PNG temporário; `null` se não houver imagem. */
  clipboardSaveImage: () => invoke<string | null>('clipboard_save_image'),
  /** Arquivos da pasta que combinam com a busca (correspondência difusa). */
  searchFiles: (cwd: string, query: string, limit?: number) =>
    invoke<FileHit[]>('search_files', { cwd, query, limit: limit ?? null }),
  openFolder: (path: string) => invoke<void>('open_folder', { path }),
  /** Histórico do PSReadLine (Ctrl+R): comandos distintos, os mais recentes primeiro. */
  historyRead: (limit?: number) => invoke<string[]>('history_read', { limit: limit ?? null }),

  /** Code review: arquivos alterados do repositório da pasta (em relação ao HEAD); `null` fora de repositório. */
  reviewStatus: (cwd: string) => invoke<ReviewStatus | null>('review_status', { cwd }),
  /** Diff unificado de um arquivo alterado (`path` relativo à raiz do repositório). */
  reviewDiff: (cwd: string, path: string) => invoke<FileDiff>('review_diff', { cwd, path }),
  /** Prepara (`true`) ou tira do stage um arquivo alterado. */
  reviewStage: (cwd: string, path: string, staged: boolean) => invoke<void>('review_stage', { cwd, path, staged }),
  /** Descarta as alterações do arquivo: volta ao HEAD; arquivo novo é apagado. */
  reviewDiscard: (cwd: string, path: string) => invoke<void>('review_discard', { cwd, path }),
  /** Prepara (`true`) ou tira do stage todas as alterações do repositório. */
  reviewStageAll: (cwd: string, staged: boolean) => invoke<void>('review_stage_all', { cwd, staged }),
  /** Commita o que está no stage; devolve o hash curto. */
  reviewCommit: (cwd: string, message: string) => invoke<string>('review_commit', { cwd, message }),
  /** Mensagem de commit escrita pelo Claude a partir do diff do stage (não commita). */
  reviewCommitMessage: (cwd: string) => invoke<string>('review_commit_message', { cwd }),

  /** Sessões do Claude Code no painel do coord (`/agents`); o formato está em features/sessions/sessions.ts. */
  coordAgents: () => invoke<unknown>('coord_agents'),
  /** Histórico do coord (`/state`): sessões que já terminaram. */
  coordState: () => invoke<unknown>('coord_state'),
  /** Painel do coord: `release-claim` libera a reserva de um arquivo; `release` esquece o registro de edição. */
  coordAct: (action: 'release-claim' | 'release', file: string) => invoke<unknown>('coord_act', { action, file }),
  /** Uso do plano do Claude (5 h e semana), do último `statusLine` das abas do Claude Code. */
  claudeUsage: () => invoke<ClaudeUsage>('claude_usage'),
  /** Linha de status do Claude Code da aba (`id` do pty): modelo, esforço, contexto e custo. */
  claudeLine: (id: number) => invoke<ClaudeLine | null>('claude_line', { id }),
  /** Abre outra janela do Termo; a primeira aba dela abre em `cwd`. */
  newWindow: (cwd?: string | null) => invoke<void>('new_window', { cwd: cwd ?? null }),
  /** IA pelo Claude Code: `explain` explica um erro; `command` converte um pedido em comando (sem executar). */
  aiAsk: (mode: 'explain' | 'command', input: string, cwd?: string | null) =>
    invoke<string>('ai_ask', { mode, input, cwd: cwd ?? null }),

  /** Abas, grupos e divisões da última vez (validados em `restore`, em features/tabs/tabs.ts). */
  loadSession: () => invoke<unknown>('session_load'),
  saveSession: (session: SessionSnapshot) => invoke<void>('session_save', { session }),
  /** Texto guardado de uma aba (serializado pelo xterm, com cores); `null` se não houver. */
  loadScrollback: (id: string) => invoke<string | null>('scrollback_load', { id }),
  saveScrollback: (id: string, text: string) => invoke<void>('scrollback_save', { id, text }),
  /** Apaga o texto guardado das abas que não estão em `keep`. */
  pruneScrollback: (keep: string[]) => invoke<number>('scrollback_prune', { keep }),

  getSettings: () => invoke<Settings>('settings_get'),
  setSettings: (patch: Partial<Settings>) => invoke<Settings>('settings_set', { patch }),
  /** Grava as configurações num arquivo escolhido no "Salvar como"; `null` se cancelou. */
  configExport: (exportedAt: string) => invoke<string | null>('config_export', { exportedAt }),
  /** Escolhe e lê um arquivo de configurações (não aplica nada); `null` se cancelou. */
  configImportRead: () => invoke<ImportFile | null>('config_import_read'),

  /** Aviso do Windows e piscar na barra de tarefas (respeita `notifications.enabled` no Rust). */
  notify: (title: string, body: string) => invoke<void>('notify', { title, body }),
  /** Progresso no ícone da barra de tarefas desta janela (`none` tira). */
  windowProgress: (state: 'none' | ProgressState, value: number) =>
    invoke<void>('window_progress', { state, value: Math.round(value) }),
  /** Procura versão nova nas releases do GitHub; `null` = já está na mais recente. */
  updateCheck: () => invoke<UpdateInfo | null>('update_check'),
  /** Baixa, instala e reinicia o Termo. */
  updateInstall: () => invoke<void>('update_install'),
  /** Versão nova achada na verificação ao abrir. */
  onUpdateAvailable: (handler: (info: UpdateInfo) => void) =>
    listen<UpdateInfo>('update-available', (e) => handler(e.payload)),
  /** Item de aba do menu da bandeja ("Nova aba", "Nova aba com Claude Code"); só a janela principal recebe. */
  onTrayAction: (handler: (action: 'new-tab' | 'new-claude') => void) =>
    listen<'new-tab' | 'new-claude'>('tray-action', (e) => handler(e.payload)),

  readClipboard: () => invoke<ClipboardContent>('clipboard_read'),
  writeClipboard: (text: string) => invoke<void>('clipboard_write', { text }),
  /** "Salvar como" de um bloco exportado; devolve o caminho gravado ou `null` se cancelou. */
  exportSave: (name: string, ext: 'txt' | 'md' | 'png', data: Uint8Array) =>
    invoke<string | null>('export_save', { name, ext, data: Array.from(data) }),
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
