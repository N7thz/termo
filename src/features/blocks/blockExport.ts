/**
 * Blocos em texto (lógica pura): Markdown para copiar, contexto para o Claude Code, texto puro para
 * salvar e o nome sugerido do arquivo. O uso está em commandBlocks.ts e BlockExportMenu.tsx.
 */
import { formatDuration, tail } from './blocks'

export interface ExportBlock {
  command: string
  output: string
  exitCode: number | null
  /** Pasta em que o comando rodou. */
  cwd: string | null
  durationMs: number
}

/** Saída máxima de cada bloco mandada ao Claude (o fim é o que mais importa). */
export const CLAUDE_MAX_OUTPUT = 12_000

const status = (b: ExportBlock) =>
  b.exitCode == null || b.exitCode === 0
    ? `ok em ${formatDuration(b.durationMs)}`
    : `código ${b.exitCode} em ${formatDuration(b.durationMs)}`

/** Uma cerca de código que não fecha antes da hora: maior que qualquer sequência de crases da saída. */
function fence(text: string): string {
  const longest = Math.max(2, ...Array.from(text.matchAll(/`+/g), (m) => m[0].length))
  return '`'.repeat(longest + 1)
}

function fenced(lang: string, text: string): string {
  const f = fence(text)
  return `${f}${lang}\n${text}\n${f}`
}

/** Markdown: o comando num bloco de código do shell e a saída num bloco de texto, com o status. */
export function blocksToMarkdown(blocks: readonly ExportBlock[]): string {
  return blocks
    .map((b) => {
      const parts = [fenced('sh', b.command), `_${status(b)}${b.cwd ? ` · ${b.cwd}` : ''}_`]
      if (b.output.trim()) parts.push(fenced('text', b.output))
      return parts.join('\n\n')
    })
    .join('\n\n---\n\n')
}

/** Texto puro, como apareceu no terminal: `$ comando`, a saída e o status. */
export function blocksToText(blocks: readonly ExportBlock[]): string {
  return blocks
    .map((b) => [`$ ${b.command}`, b.output, `[${status(b)}${b.cwd ? ` · ${b.cwd}` : ''}]`].filter(Boolean).join('\n'))
    .join('\n\n')
}

/**
 * Contexto para colar no Claude Code: o que rodou, onde, como terminou e a saída (cortada no fim).
 * Vai sem Enter: a pessoa completa com a pergunta.
 */
export function blocksForClaude(blocks: readonly ExportBlock[]): string {
  const intro =
    blocks.length === 1 ? 'Saída deste comando no terminal:' : `Saída destes ${blocks.length} comandos no terminal:`
  const body = blocks.map((b) => blocksToMarkdown([{ ...b, output: tail(b.output, CLAUDE_MAX_OUTPUT) }]))
  return `${intro}\n\n${body.join('\n\n')}\n\n`
}

/** Nome de arquivo sugerido: o começo do primeiro comando, sem caracteres proibidos no Windows. */
export function exportFileName(blocks: readonly ExportBlock[], ext: 'txt' | 'png' | 'md'): string {
  const base =
    Array.from(blocks[0]?.command ?? '', (c) => (c.charCodeAt(0) < 32 || '<>:"/\\|?*'.includes(c) ? ' ' : c))
      .join('')
      .replace(/\s+/g, '-')
      .replace(/^[-.]+|[-.]+$/g, '')
      .slice(0, 40)
      .replace(/[-.]+$/, '') || 'saida'
  return `${base}.${ext}`
}
