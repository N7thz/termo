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

/** O tema do terminal com o fundo transparente (a cor da seleção e do cursor continuam). */
export function transparentTheme<T extends { background?: string }>(theme: T): T {
  return { ...theme, background: TRANSPARENT }
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
