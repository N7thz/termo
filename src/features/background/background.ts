/**
 * Imagem de fundo, no espírito da extensão Background do VS Code (KatsuteDev/Background): uma ou várias
 * imagens, opacidade, desfoque, ajuste e troca automática (slideshow).
 *
 * Duas posições: `terminal` desenha a imagem atrás do texto (o xterm fica com fundo transparente);
 * `window` desenha por cima da janela inteira, translúcida e sem pegar cliques.
 */
import type { CSSProperties } from 'react'
import type { BackgroundSettings } from '../../shared/types'

/** Mesmos limites do Rust (src-tauri/src/settings.rs). */
export const MAX_BACKGROUNDS = 50
export const BG_OPACITY_MIN = 5
export const BG_BLUR_MAX = 40
export const BG_CHANGE_MIN = 5
export const BG_CHANGE_MAX = 86_400

export const IMAGE_EXTENSIONS = ['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'svg', 'avif']

/** Intervalos prontos do slideshow, em segundos (0 = não troca). */
export const CHANGE_PRESETS = [
  { secs: 0, label: 'Nunca' },
  { secs: 60, label: '1 min' },
  { secs: 300, label: '5 min' },
  { secs: 1800, label: '30 min' },
] as const

export const FITS: { value: BackgroundSettings['fit']; label: string }[] = [
  { value: 'cover', label: 'Preencher' },
  { value: 'contain', label: 'Inteira' },
  { value: 'center', label: 'Original' },
  { value: 'tile', label: 'Repetir' },
]

/** O fundo aparece: ligado e com pelo menos uma imagem. */
export function isBackgroundActive(b: BackgroundSettings | undefined): b is BackgroundSettings {
  return !!b?.enabled && b.images.length > 0
}

/** O terminal precisa de fundo transparente para a imagem aparecer atrás do texto. */
export function wantsTransparentTerminal(b: BackgroundSettings | undefined): boolean {
  return isBackgroundActive(b) && b.target === 'terminal'
}

const clamp = (n: number, min: number, max: number, fallback: number) =>
  Number.isFinite(n) ? Math.min(max, Math.max(min, Math.round(n))) : fallback

export const clampOpacity = (n: number) => clamp(n, BG_OPACITY_MIN, 100, 20)
export const clampBlur = (n: number) => clamp(n, 0, BG_BLUR_MAX, 0)
export const clampChangeSecs = (n: number) => (n === 0 ? 0 : clamp(n, BG_CHANGE_MIN, BG_CHANGE_MAX, 0))

/** Junta imagens novas à lista, sem repetir e sem passar do limite. */
export function addImages(list: readonly string[], added: readonly string[]): string[] {
  const out = [...list]
  for (const raw of added) {
    const p = raw.trim()
    if (p && !out.includes(p) && out.length < MAX_BACKGROUNDS) out.push(p)
  }
  return out
}

/** Nome do arquivo, para a lista nas configurações. */
export function fileName(path: string): string {
  return path.split(/[\\/]/).filter(Boolean).pop() ?? path
}

/**
 * Próxima imagem do slideshow. Em ordem, dá a volta; aleatória, nunca repete a atual (com 2+ imagens).
 * `random` entra por parâmetro para os testes.
 */
export function nextIndex(current: number, count: number, shuffle: boolean, random: () => number = Math.random) {
  if (count <= 1) return 0
  if (!shuffle) return (current + 1) % count
  const pick = Math.floor(random() * (count - 1))
  return pick >= current ? pick + 1 : pick
}

/** Estilo da imagem: ajuste, repetição e desfoque. A opacidade fica na camada (para o fade). */
export function imageStyle(b: Pick<BackgroundSettings, 'fit' | 'blur'>, url: string): CSSProperties {
  const blur = clampBlur(b.blur)
  return {
    backgroundImage: `url("${url}")`,
    backgroundPosition: 'center',
    backgroundRepeat: b.fit === 'tile' ? 'repeat' : 'no-repeat',
    backgroundSize: b.fit === 'cover' || b.fit === 'contain' ? b.fit : 'auto',
    filter: blur > 0 ? `blur(${blur}px)` : undefined,
    // O desfoque escurece a borda (mistura com o vazio fora da imagem): a imagem passa um pouco da camada.
    inset: blur > 0 ? `-${blur * 2}px` : 0,
  }
}

/** Fundo do tema com transparência total, no formato que o xterm entende. */
export const TRANSPARENT = '#00000000'

/**
 * O tema do terminal com o fundo transparente (a cor da seleção e do cursor continuam). Mantém o RGB
 * do fundo com alfa 0: o contraste mínimo do xterm calcula contra ele, e não contra o preto.
 */
export function transparentTheme<T extends { background?: string }>(theme: T): T {
  const bg = theme.background?.trim()
  return { ...theme, background: bg && /^#[0-9a-f]{6}$/i.test(bg) ? `${bg}00` : TRANSPARENT }
}

/** Cor com alfa abaixo de 1 (`#rrggbbaa`, `rgba(...)`, `transparent`): o xterm precisa de `allowTransparency`. */
export function isTranslucent(color: string | undefined): boolean {
  if (!color) return false
  const c = color.trim().toLowerCase()
  if (c === 'transparent') return true
  if (/^#[0-9a-f]{8}$/.test(c)) return c.slice(7) !== 'ff'
  const m = /^rgba?\(([^)]*)\)$/.exec(c)
  if (!m) return false
  const parts = m[1].split(/[\s,/]+/).filter(Boolean)
  return parts.length === 4 && Number.parseFloat(parts[3]) < 1
}

/** Limites do brilho do tema (mesmos do Rust). */
export const GLOW_MIN = 10
export const clampGlow = (n: number) => clamp(n, GLOW_MIN, 100, 50)

/** O brilho aparece: fica na moldura da janela, então convive com a imagem de fundo. */
export function wantsGlow(b: BackgroundSettings | undefined): boolean {
  return b?.glow ?? true
}

/** Opacidade máxima de cada halo em 100%: baixa para o texto nunca perder contraste. */
const GLOW_PEAK = { dark: 0.3, light: 0.24 } as const

function rgbOf(hex: string | undefined): [number, number, number] | null {
  const m = /^#([0-9a-f]{6})(?:[0-9a-f]{2})?$/i.exec(hex?.trim() ?? '')
  if (!m) return null
  const v = Number.parseInt(m[1], 16)
  return [(v >> 16) & 255, (v >> 8) & 255, v & 255]
}

/** Distância simples entre duas cores (0 a ~441); null se alguma não for hex. */
export function colorDistance(a: string | undefined, b: string | undefined): number | null {
  const x = rgbOf(a)
  const y = rgbOf(b)
  if (!x || !y) return null
  return Math.hypot(x[0] - y[0], x[1] - y[1], x[2] - y[2])
}

/**
 * Segundo tom do brilho: o magenta do tema, ou o ciano quando o magenta é quase o destaque
 * (dois halos da mesma cor viram uma mancha só).
 */
export function glowTone(accent: string, ansi: { magenta?: string; cyan?: string; blue?: string }): string {
  const candidates = [ansi.magenta, ansi.cyan, ansi.blue].filter((c): c is string => !!c)
  for (const c of candidates) {
    const d = colorDistance(c, accent)
    if (d === null || d > 60) return c
  }
  return candidates[0] ?? accent
}

/**
 * Brilho da moldura da janela: dois halos difusos, o destaque no alto (ao longo da barra) e o segundo
 * tom embaixo à esquerda (atrás da lateral), onde o cartão do terminal não cobre.
 */
export function glowStyle(opts: {
  accent: string
  tone: string
  scheme: 'dark' | 'light'
  strength: number
}): CSSProperties {
  const alpha = (GLOW_PEAK[opts.scheme] * clampGlow(opts.strength)) / 100
  const pct = (a: number) => `${Math.round(a * 1000) / 10}%`
  const halo = (color: string, a: number, at: string, size: string) =>
    `radial-gradient(${size} at ${at}, color-mix(in srgb, ${color} ${pct(a)}, transparent), transparent 70%)`
  return {
    backgroundImage: [
      halo(opts.accent, alpha, '0% 0%', '85% 60%'),
      halo(opts.tone, alpha * 0.8, '0% 100%', '45% 75%'),
    ].join(', '),
  }
}
