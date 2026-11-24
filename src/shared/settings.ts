import type { Settings } from './types'

/** Mesmos limites do Rust (src-tauri/src/settings.rs). */
export const FONT_MIN = 9
export const FONT_MAX = 32

export const DEFAULT_SETTINGS: Settings = {
  startWithClaude: false,
  fontFamily: "'JetBrains Mono', 'Cascadia Code', 'Fira Code', Consolas, monospace",
  fontSize: 14,
  defaultCwd: '',
  shellPredictions: true,
  theme: 'system',
  highlights: {
    fileLinks: true,
    severity: true,
    gitHashes: true,
    network: true,
    logLevels: true,
    diffs: true,
    timestamps: true,
    uuids: true,
    rules: [{ pattern: String.raw`\b(TODO|FIXME|HACK)\b`, color: '#e0af68' }],
  },
  layout: { sidebar: true, sidebarCollapsed: false, statusBar: true, diffBadge: true },
  profiles: [
    { id: 'trabalho', name: 'Trabalho', color: 'green', cwd: '', pinned: [] },
    { id: 'pessoal', name: 'Pessoal', color: 'yellow', cwd: '', pinned: [] },
  ],
  linkTarget: 'panel',
  interfaceSize: 'medium',
  restoreSession: true,
  inputEditor: false,
  notifications: { enabled: true, claude: true, commands: true, commandSecs: 30 },
  workflows: [],
  globalHotkey: '',
  autoUpdate: true,
  restoreOutput: true,
  defaultShell: 'auto',
  historySearch: true,
  tray: { enabled: false, closeToTray: false, minimizeToTray: false, launchAtLogin: false, startHidden: false },
  background: {
    enabled: false,
    images: [],
    target: 'terminal',
    opacity: 20,
    blur: 0,
    fit: 'cover',
    changeSecs: 0,
    shuffle: false,
  },
  layouts: [],
}

/** Mesmos limites do Rust (MAX_PROFILES / MAX_PINNED em src-tauri/src/settings.rs). */
export const MAX_PROFILES = 9
export const MAX_PINNED = 12

/** Mesmos limites do Rust (MAX_RULES / MAX_PATTERN em src-tauri/src/settings.rs). */
export const MAX_RULES = 20
export const MAX_PATTERN = 200

export function clampFontSize(n: number): number {
  if (!Number.isFinite(n)) return DEFAULT_SETTINGS.fontSize
  return Math.min(FONT_MAX, Math.max(FONT_MIN, Math.round(n)))
}
