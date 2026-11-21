import type { ThemeDefinition } from './themes'

/** Esquema de cores de terminal (formato do Windows Terminal, já normalizado). */
export interface TerminalScheme {
  id: string
  name: string
  author: string
  source: string
  background: string
  foreground: string
  cursor: string
  selection: string | null
  black: string
  red: string
  green: string
  yellow: string
  blue: string
  magenta: string
  cyan: string
  white: string
  brightBlack: string
  brightRed: string
  brightGreen: string
  brightYellow: string
  brightBlue: string
  brightMagenta: string
  brightCyan: string
  brightWhite: string
}

type Rgb = [number, number, number]

const toRgb = (hex: string): Rgb => [1, 3, 5].map((i) => Number.parseInt(hex.slice(i, i + 2), 16)) as Rgb
const toHex = (rgb: Rgb) => `#${rgb.map((c) => Math.round(c).toString(16).padStart(2, '0')).join('')}`
const rgba = (hex: string, alpha: number) => `rgb(${toRgb(hex).join(' ')} / ${Math.round(alpha * 100)}%)`

/** Mistura `a` com `b` (t = 0 → a, t = 1 → b). */
export function mix(a: string, b: string, t: number): string {
  const [x, y] = [toRgb(a), toRgb(b)]
  return toHex([0, 1, 2].map((i) => x[i] + (y[i] - x[i]) * t) as Rgb)
}

/** Luminância relativa (WCAG). */
export function luminance(hex: string): number {
  const [r, g, b] = toRgb(hex).map((c) => {
    const s = c / 255
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4
  })
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

export function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x)
  return (hi + 0.05) / (lo + 0.05)
}

/** Primeira cor com contraste suficiente sobre o fundo; senão a de maior contraste. */
function pick(bg: string, min: number, ...candidates: string[]): string {
  return (
    candidates.find((c) => contrast(c, bg) >= min) ??
    [...candidates].sort((a, b) => contrast(b, bg) - contrast(a, bg))[0]
  )
}

/**
 * Monta o tema completo (interface + terminal) só com as cores do terminal.
 * A interface usa o fundo do terminal e misturas dele com o texto; o texto da interface
 * sempre fica legível (≥ 4.5), mesmo quando o esquema original tem pouco contraste.
 */
export function themeFromScheme(s: TerminalScheme): ThemeDefinition {
  const dark = luminance(s.background) < 0.2
  const bg = s.background
  const text = pick(bg, 4.5, s.foreground, s.brightWhite, s.white, dark ? '#f2f2f2' : '#1a1a1a')
  const accent = pick(bg, 3, s.blue, s.brightBlue, s.cyan, s.brightCyan, text)
  const surface = mix(bg, text, 0.06)

  return {
    id: s.id,
    name: s.name,
    scheme: dark ? 'dark' : 'light',
    credit: { author: s.author, source: s.source },
    ui: {
      bg,
      surface,
      surfaceHover: mix(bg, text, 0.11),
      border: mix(bg, text, 0.18),
      text,
      muted: pick(bg, 3, mix(bg, text, 0.6), mix(bg, text, 0.75), text),
      accent,
      claude: pick(bg, 3, s.yellow, s.brightYellow, s.red, accent),
      material: rgba(bg, 0.64),
      materialThick: rgba(surface, 0.8),
      hairline: dark ? 'rgb(255 255 255 / 9%)' : 'rgb(0 0 0 / 10%)',
      highlight: dark ? 'rgb(255 255 255 / 6%)' : 'rgb(255 255 255 / 60%)',
      field: rgba(mix(bg, dark ? '#000000' : '#ffffff', 0.25), 0.8),
      onAccent: contrast(bg, accent) >= contrast('#ffffff', accent) ? bg : '#ffffff',
      shadowStrength: dark ? 1 : 0.4,
    },
    terminal: {
      background: bg,
      foreground: s.foreground,
      cursor: s.cursor,
      cursorAccent: bg,
      selectionBackground: s.selection ?? mix(bg, s.foreground, 0.28),
      black: s.black,
      red: s.red,
      green: s.green,
      yellow: s.yellow,
      blue: s.blue,
      magenta: s.magenta,
      cyan: s.cyan,
      white: s.white,
      brightBlack: s.brightBlack,
      brightRed: s.brightRed,
      brightGreen: s.brightGreen,
      brightYellow: s.brightYellow,
      brightBlue: s.brightBlue,
      brightMagenta: s.brightMagenta,
      brightCyan: s.brightCyan,
      brightWhite: s.brightWhite,
    },
  }
}
