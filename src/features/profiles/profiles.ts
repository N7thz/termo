import { MAX_PINNED } from '../../shared/settings'
import type { Profile } from '../../shared/types'

/**
 * Cores dos perfis: tons do tema escolhido, nunca cores fixas. O perfil guarda o nome do tom e a cor
 * real vem do tema ativo (as ANSI do terminal, o acento e o laranja do Claude), então a moldura acompanha
 * qualquer tema. Mesma lista do Rust (PROFILE_TONES em src-tauri/src/settings.rs).
 */
export const PROFILE_COLORS = ['green', 'yellow', 'accent', 'magenta', 'cyan', 'red', 'blue', 'claude'] as const
export type ProfileTone = (typeof PROFILE_COLORS)[number]

export const TONE_LABELS: Record<ProfileTone, string> = {
  green: 'Verde',
  yellow: 'Amarelo',
  accent: 'Acento do tema',
  magenta: 'Magenta',
  cyan: 'Ciano',
  red: 'Vermelho',
  blue: 'Azul',
  claude: 'Laranja',
}

/** Valor CSS da cor do perfil: `var(--tone-*)` (posto pelo App a partir do tema); `#hex` antigo passa direto. */
export function profileColorCss(color: string): string {
  if (color.startsWith('#')) return color
  if (color === 'accent') return 'var(--accent)'
  if (color === 'claude') return 'var(--claude)'
  return `var(--tone-${color})`
}

/** Id novo a partir do nome (minúsculas, sem acento), único na lista. */
export function newProfileId(name: string, existing: readonly Profile[]): string {
  const base =
    name
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 30) || 'perfil'
  const ids = new Set(existing.map((p) => p.id))
  if (!ids.has(base)) return base
  for (let i = 2; ; i++) if (!ids.has(`${base}-${i}`)) return `${base}-${i}`
}

/** Perfil novo com nome "Perfil N" e a próxima cor ainda não usada. */
export function createProfile(existing: readonly Profile[]): Profile {
  let n = existing.length + 1
  while (existing.some((p) => p.name === `Perfil ${n}`)) n++
  const name = `Perfil ${n}`
  const used = new Set(existing.map((p) => p.color))
  const color = PROFILE_COLORS.find((c) => !used.has(c)) ?? PROFILE_COLORS[existing.length % PROFILE_COLORS.length]
  return { id: newProfileId(name, existing), name, color, cwd: '', pinned: [] }
}

/** Compara pastas sem diferenciar maiúsculas nem a barra do fim (Windows). */
const normDir = (d: string) => d.replace(/[\\/]+$/, '').toLowerCase()

export function isPinned(profile: Profile | undefined, dir: string | null | undefined): boolean {
  if (!profile || !dir) return false
  return profile.pinned.some((d) => normDir(d) === normDir(dir))
}

/** Fixa a pasta no perfil (sem repetir), até o limite. */
export function pinFolder(profile: Profile, dir: string): Profile {
  if (!dir.trim() || isPinned(profile, dir) || profile.pinned.length >= MAX_PINNED) return profile
  return { ...profile, pinned: [...profile.pinned, dir] }
}
