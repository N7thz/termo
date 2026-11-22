/** `cd` do PowerShell para uma pasta qualquer: `-LiteralPath` (colchetes não viram curinga) e aspas simples escapadas. */
export function cdCommand(dir: string): string {
  return `Set-Location -LiteralPath '${dir.replace(/'/g, "''")}'`
}

/** Pasta acima (`null` na raiz do disco ou de um compartilhamento). */
export function parentDir(dir: string): string | null {
  const clean = dir.replace(/[\\/]+$/, '')
  const i = Math.max(clean.lastIndexOf('\\'), clean.lastIndexOf('/'))
  if (i < 0) return null
  const parent = clean.slice(0, i)
  if (/^[A-Za-z]:$/.test(parent)) return `${parent}\\`
  // \\servidor\compartilhamento é a raiz: não sobe mais.
  if (/^\\\\[^\\]+$/.test(parent) || parent === '' || parent === '\\') return null
  return parent
}

const norm = (p: string) => p.replace(/[\\/]+$/, '').toLowerCase()

/** Pastas recentes sem a atual e sem repetidas, até `limit`. */
export function otherRecent(recent: readonly string[], current: string, limit = 8): string[] {
  const seen = new Set([norm(current)])
  const out: string[] = []
  for (const dir of recent) {
    const key = norm(dir)
    if (seen.has(key)) continue
    seen.add(key)
    out.push(dir)
    if (out.length === limit) break
  }
  return out
}

/** Nome curto para o menu: a última pasta, ou a raiz (`D:\`). */
export function folderName(dir: string): string {
  const clean = dir.replace(/[\\/]+$/, '')
  const name = clean.split(/[\\/]/).pop() ?? clean
  return /^[A-Za-z]:$/.test(name) ? `${name}\\` : name || dir
}
