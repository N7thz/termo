/** Arquivo que entrou na linha de comando (colado ou arrastado), para a faixa de miniaturas. */
export interface Attachment {
  path: string
  /** Só imagens ganham miniatura. */
  image: boolean
}

/** Mesmas extensões da prévia de imagem do Rust (`IMAGE_EXTS` em images.rs). */
const IMAGE_EXT = /\.(png|jpe?g|gif|webp|bmp|ico|svg|avif)$/i

export function isImagePath(path: string): boolean {
  return IMAGE_EXT.test(path)
}

/** Onde o caminho vai: shell de cada família ou o Claude Code. */
export type PathTarget = 'pwsh' | 'powershell' | 'cmd' | 'bash' | 'wsl' | 'claude'

/** `C:\a\b` → `/<prefixo>c/a/b` (WSL: `/mnt/`, Git Bash: `/`). Caminho sem letra de unidade fica igual. */
function unixPath(path: string, prefix: string): string {
  const m = /^([A-Za-z]):[\\/](.*)$/.exec(path)
  if (!m) return path.replaceAll('\\', '/')
  return `${prefix}${m[1].toLowerCase()}/${m[2].replaceAll('\\', '/')}`
}

const singleQuotePosix = (s: string) => `'${s.replaceAll("'", `'\\''`)}'`

/**
 * O caminho escrito do jeito que aquele shell lê como um argumento só, literal: aspas simples no
 * PowerShell (sem expandir `$`), aspas duplas no cmd (nomes de arquivo não têm `"`), aspas simples
 * POSIX no bash/WSL (com o caminho convertido). No Claude Code, entre aspas só se tiver espaço.
 */
export function quotePath(path: string, target: PathTarget): string {
  switch (target) {
    case 'cmd':
      return `"${path}"`
    case 'wsl':
      return singleQuotePosix(unixPath(path, '/mnt/'))
    case 'bash':
      return singleQuotePosix(unixPath(path, '/'))
    case 'claude':
      return /\s/.test(path) ? `"${path}"` : path
    default:
      return `'${path.replaceAll("'", "''")}'`
  }
}

/** Vários caminhos separados por espaço, com um espaço antes para não colar no que já está escrito. */
export function pathsText(paths: readonly string[], target: PathTarget): string {
  return paths.length === 0 ? '' : ` ${paths.map((p) => quotePath(p, target)).join(' ')} `
}

/** Junta os novos à faixa sem repetir, mantendo no máximo `max` (os mais recentes). */
export function addAttachments(list: readonly Attachment[], paths: readonly string[], max = 12): Attachment[] {
  const next = [...list]
  for (const path of paths) {
    if (!next.some((a) => a.path === path)) next.push({ path, image: isImagePath(path) })
  }
  return next.slice(-max)
}

export function fileName(path: string): string {
  return path.split(/[\\/]/).pop() || path
}
