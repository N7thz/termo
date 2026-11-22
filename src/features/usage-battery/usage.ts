/**
 * Bateria do uso do Claude: a janela de 5 h e o limite semanal, vindos do `statusLine` das abas do
 * Claude Code (src-tauri/src/usage.rs). Funções puras; quem busca os dados é o componente.
 */

export interface UsageWindow {
  /** Quanto já foi usado, de 0 a 100. */
  usedPct: number
  /** Quando a janela recomeça (ms desde 1970). */
  resetsAt: number | null
}

export interface ClaudeUsage {
  fiveHour: UsageWindow | null
  sevenDay: UsageWindow | null
  /** Quando o Claude Code mandou os dados (0 = nunca). */
  updatedAt: number
  /** `false` quando o usuário tem `statusLine` próprio e o Termo não consegue ler os limites. */
  tracking: boolean
}

/** Humor do mascote conforme a carga que sobra. */
export type Mood = 'happy' | 'ok' | 'tired' | 'empty' | 'unknown'

/** Carga que sobra (0 a 100). Uma janela que já recomeçou volta a 100. */
export function charge(w: UsageWindow | null, now: number): number | null {
  if (!w) return null
  if (w.resetsAt != null && w.resetsAt <= now) return 100
  return Math.round(Math.max(0, Math.min(100, 100 - w.usedPct)))
}

/** A bateria mostra o limite mais apertado entre as duas janelas. */
export function tightest(u: ClaudeUsage | null, now: number): { level: number; which: '5h' | 'semana' } | null {
  if (!u) return null
  const five = charge(u.fiveHour, now)
  const week = charge(u.sevenDay, now)
  if (five == null && week == null) return null
  if (week == null || (five != null && five <= week)) return { level: five as number, which: '5h' }
  return { level: week, which: 'semana' }
}

export function moodOf(level: number | null): Mood {
  if (level == null) return 'unknown'
  if (level <= 5) return 'empty'
  if (level <= 25) return 'tired'
  if (level <= 60) return 'ok'
  return 'happy'
}

/** Quantos dos `segments` blocos acendem; qualquer carga acima de zero acende pelo menos um. */
export function litSegments(level: number, segments = 5): number {
  if (level <= 0) return 0
  return Math.max(1, Math.round((level / 100) * segments))
}

/** "em 2 h 15 min", "em 3 dias", "em 40 min". */
export function resetsIn(at: number | null, now: number): string {
  if (at == null) return ''
  const min = Math.max(0, Math.round((at - now) / 60000))
  if (min < 60) return `em ${Math.max(1, min)} min`
  const h = Math.floor(min / 60)
  if (h < 24) return min % 60 ? `em ${h} h ${min % 60} min` : `em ${h} h`
  const d = Math.round(h / 24)
  return `em ${d} ${d === 1 ? 'dia' : 'dias'}`
}

/** Linha do resumo: "5 h: 77% livre · recomeça em 2 h". */
export function describe(label: string, w: UsageWindow | null, now: number): string {
  const level = charge(w, now)
  if (level == null || !w) return `${label}: sem dados`
  const reset = resetsIn(w.resetsAt, now)
  return `${label}: ${level}% livre${reset ? ` · recomeça ${reset}` : ''}`
}
