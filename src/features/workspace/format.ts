import type { SessionKind } from '../../shared/types'
import { modeLabel } from '../shell-profiles/modes'

/** Últimos pedaços de um caminho: `D:\estudos\termo\src` → `termo\src` (com `…\` na frente se cortou). */
export function shortPath(path: string | null | undefined, segments = 2): string {
  if (!path) return ''
  const sep = path.includes('\\') ? '\\' : '/'
  const parts = path.split(/[\\/]/).filter(Boolean)
  // Raiz de drive (`D:\`) ou `/`: mostra inteira.
  if (parts.length <= 1) return path
  if (parts.length <= segments) return path
  return `…${sep}${parts.slice(-segments).join(sep)}`
}

/** Nome da pasta (último pedaço); raiz de drive fica como está. */
export function folderName(path: string | null | undefined): string {
  if (!path) return ''
  const parts = path.split(/[\\/]/).filter(Boolean)
  return parts.length <= 1 ? path : parts[parts.length - 1]
}

/** Números compactos para o diff: 980, 1.2k, 12k. */
export function compactCount(n: number): string {
  if (n < 1000) return String(n)
  if (n < 10_000) return `${(n / 1000).toFixed(1).replace(/\.0$/, '')}k`
  return `${Math.round(n / 1000)}k`
}

/** Nome do modo da aba: o do shell detectado (`modeLabel`) ou, antes dele chegar, o nome do shell padrão. */
export function modeName(kind: SessionKind, shell: string | undefined, shellName: string): string {
  return kind === 'claude' || shell ? modeLabel(kind, shell) : shellName
}

/** Título que é só o executável do shell: `C:\Windows\System32\...\powershell.exe`, com ou sem "Administrador: ". */
const EXE_TITLE = /^(?:[^\\/:]+:\s+)?(?:[a-z]:)?[\\/].*\.exe$/i
/** Ícones animados que o Claude Code põe na frente do título (✳ ✶ ✻ · ...). */
const LEADING_GLYPHS = /^[^\p{L}\p{N}]+/u

/**
 * Título da aba para mostrar. O título que o shell manda costuma ser o caminho do executável, igual em
 * todas as abas: aí vale o nome do modo. No Claude Code sai o ícone animado da frente (o avatar já mostra o estado).
 */
export function tabLabel(
  tab: { kind: SessionKind; title: string; shell?: string; label?: string },
  shellName: string,
): string {
  // Nome dado à aba (pela pessoa ou pelo Claude) vale sobre o título automático.
  if (tab.label?.trim()) return tab.label.trim()
  const title = tab.title.trim()
  if (tab.kind === 'claude') return title.replace(LEADING_GLYPHS, '').trim() || 'Claude Code'
  if (!title || EXE_TITLE.test(title)) return modeName(tab.kind, tab.shell, shellName)
  return title
}
