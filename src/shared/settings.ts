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
    rules: [{ pattern: String.raw`\b(TODO|FIXME|HACK)\b`, color: '#e0af68' }],
  },
  layout: { sidebar: false, statusBar: true, diffBadge: true },
}

/** Mesmos limites do Rust (MAX_RULES / MAX_PATTERN em src-tauri/src/settings.rs). */
export const MAX_RULES = 20
export const MAX_PATTERN = 200

export function clampFontSize(n: number): number {
  if (!Number.isFinite(n)) return DEFAULT_SETTINGS.fontSize
  return Math.min(FONT_MAX, Math.max(FONT_MIN, Math.round(n)))
}
