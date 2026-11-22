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
