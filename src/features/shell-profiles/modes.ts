import type { SessionKind, ShellInfo } from '../../shared/types'

/** Modo da aba: o shell que ela roda ou o Claude Code. */
export type TerminalMode = 'pwsh' | 'powershell' | 'cmd' | 'bash' | 'wsl' | 'claude'

/**
 * Cor de cada modo, sempre do tema: acento, laranja do Claude e os tons ANSI (`--tone-*`, postos pelo
 * App). O fallback no acento cobre o instante antes do tema carregar.
 */
export const MODE_TONE: Record<TerminalMode, string> = {
  pwsh: 'var(--accent)',
  powershell: 'var(--tone-cyan, var(--accent))',
  cmd: 'var(--tone-yellow, var(--accent))',
  bash: 'var(--tone-magenta, var(--accent))',
  wsl: 'var(--tone-green, var(--accent))',
  claude: 'var(--claude)',
}

export const MODE_LABEL: Record<TerminalMode, string> = {
  pwsh: 'PowerShell 7',
  powershell: 'Windows PowerShell',
  cmd: 'Prompt de Comando',
  bash: 'Git Bash',
  wsl: 'WSL',
  claude: 'Claude Code',
}

/** Família de um id de shell (`pwsh`, `wsl:Ubuntu`...); `null` se não for um id conhecido. */
export function familyOf(id: string): Exclude<TerminalMode, 'claude'> | null {
  if (id === 'pwsh' || id === 'powershell' || id === 'cmd' || id === 'bash' || id === 'wsl') return id
  return id.startsWith('wsl:') ? 'wsl' : null
}

/**
 * Id do shell que `defaultShell` abre: `auto` é o primeiro da lista detectada (pwsh, se existir).
 * Sem lista ainda, `auto` vale `pwsh`.
 */
export function resolveDefaultShell(defaultShell: string, shells: readonly ShellInfo[]): string {
  if (defaultShell !== 'auto') return defaultShell
  return shells[0]?.id ?? 'pwsh'
}

/**
 * Modo de uma aba. `shell` é o id que ela usa (vem do backend depois de abrir); antes disso vale o
 * padrão, quando informado. Sem nada, PowerShell 7.
 */
export function modeOf(kind: SessionKind, shell?: string, fallbackShell?: string): TerminalMode {
  if (kind === 'claude') return 'claude'
  return familyOf(shell ?? fallbackShell ?? '') ?? 'pwsh'
}

/** Nome do modo para mostrar: `Ubuntu (WSL)`, `Prompt de Comando`, `Claude Code`. */
export function modeLabel(kind: SessionKind, shell?: string): string {
  const mode = modeOf(kind, shell)
  if (mode === 'wsl' && shell?.startsWith('wsl:')) return `${shell.slice(4)} (WSL)`
  return MODE_LABEL[mode]
}
