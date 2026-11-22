/**
 * Contrato tipado com o backend Rust (src-tauri/src/lib.rs). Toda chamada ao Tauri passa por aqui:
 * se um comando mudar de nome ou de formato, só este arquivo muda.
 */
import { Channel, invoke } from '@tauri-apps/api/core'
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
  /** Arquivos da pasta que combinam com a busca (correspondência difusa). */
  searchFiles: (cwd: string, query: string, limit?: number) =>
    invoke<FileHit[]>('search_files', { cwd, query, limit: limit ?? null }),
  openFolder: (path: string) => invoke<void>('open_folder', { path }),

  getSettings: () => invoke<Settings>('settings_get'),
  setSettings: (patch: Partial<Settings>) => invoke<Settings>('settings_set', { patch }),

  readClipboard: () => invoke<ClipboardContent>('clipboard_read'),
  writeClipboard: (text: string) => invoke<void>('clipboard_write', { text }),
  openUrl: (url: string) => invoke<void>('open_url', { url }),
  /** Abre o arquivo no VS Code na linha/coluna (ou no app padrão); caminho relativo usa `cwd`. */
  openInEditor: (path: string, line?: number, column?: number, cwd?: string | null) =>
    invoke<void>('open_in_editor', { path, line: line ?? null, column: column ?? null, cwd: cwd ?? null }),
}
