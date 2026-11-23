/** Versão nova achada nas releases do GitHub (ver src-tauri/src/updater.rs). */
export interface UpdateInfo {
  version: string
  current: string
  /** Notas da release, se houver. */
  notes: string | null
}
