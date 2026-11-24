/**
 * Navegação entre blocos e filtro da saída (lógica pura, sem DOM nem xterm). O uso está em
 * commandBlocks.ts (seleção) e BlockFilter.tsx (filtro).
 */

export type Direction = 'prev' | 'next'

/**
 * Próximo índice selecionado numa lista de `count` blocos. Sem seleção, `prev` vai para o último;
 * `prev` no primeiro fica nele; `next` no último tira a seleção (volta ao prompt); `next` sem seleção não faz nada.
 */
export function stepSelection(count: number, current: number | null, dir: Direction): number | null {
  if (count <= 0) return null
  if (current == null || current < 0 || current >= count) return dir === 'prev' ? count - 1 : null
  if (dir === 'prev') return Math.max(0, current - 1)
  return current + 1 >= count ? null : current + 1
}

/** Shift+↑/↓: move a ponta da seleção de vários blocos (fica dentro da lista, não sai dela). */
export function extendFocus(count: number, focus: number, dir: Direction): number {
  return Math.min(count - 1, Math.max(0, focus + (dir === 'prev' ? -1 : 1)))
}

export type BlockKeyAction =
  | 'prev'
  | 'next'
  /** Shift+↑/↓: estende a seleção para vários blocos seguidos. */
  | 'extend-prev'
  | 'extend-next'
  | 'copy-output'
  | 'copy-command'
  | 'reopen'
  | 'filter'
  | 'clear'
  /** Ctrl+Enter: manda os blocos selecionados ao Claude Code. */
  | 'send-claude'
  /** M: copia os blocos selecionados como Markdown. */
  | 'copy-markdown'
  /** E: abre o menu de exportar (Markdown, .txt, PNG). */
  | 'export'

/** O que importa de um KeyboardEvent (facilita testar sem DOM). */
export interface KeyLike {
  key: string
  ctrlKey: boolean
  shiftKey: boolean
  altKey: boolean
  metaKey?: boolean
}

/**
 * Traduz uma tecla numa ação sobre os blocos, ou `null` quando a tecla não é dos blocos.
 * Ctrl+↑/↓ funcionam sempre (sem seleção, Ctrl+↑ seleciona o último bloco); o resto só com um bloco selecionado:
 * Shift+↑/↓ estende a seleção, Ctrl+Enter manda ao Claude, M copia como Markdown e E abre o exportar.
 * `hasTextSelection`: com texto selecionado no xterm, Ctrl+C continua copiando a seleção.
 */
export function blockKeyAction(e: KeyLike, hasSelection: boolean, hasTextSelection: boolean): BlockKeyAction | null {
  if (e.altKey || e.metaKey) return null
  const key = e.key.toLowerCase()
  if (e.ctrlKey && !e.shiftKey) {
    if (key === 'arrowup') return 'prev'
    if (key === 'arrowdown') return hasSelection ? 'next' : null
    if (key === 'c' && hasSelection && !hasTextSelection) return 'copy-output'
    if (key === 'enter' && hasSelection) return 'send-claude'
    return null
  }
  if (!hasSelection) return null
  if (e.ctrlKey && e.shiftKey) {
    if (key === 'c') return 'copy-command'
    if (key === 'l') return 'filter'
    return null
  }
  if (e.shiftKey) {
    if (key === 'arrowup') return 'extend-prev'
    if (key === 'arrowdown') return 'extend-next'
    return null
  }
  if (key === 'escape') return 'clear'
  if (key === 'm') return 'copy-markdown'
  if (key === 'e') return 'export'
  if (key === 'enter') return 'reopen'
  if (key === '/') return 'filter'
  return null
}

export interface FilterResult {
  /** Linhas que batem, com o número (a partir de 1) na saída original. */
  lines: { n: number; text: string }[]
  /** Linhas da saída original. */
  total: number
  /** Regex inválida: a mensagem do motivo, sem linhas. */
  error: string | null
}

/** Filtra as linhas da saída: texto simples (sem diferenciar maiúsculas) ou regex. Consulta vazia mostra tudo. */
export function filterOutput(output: string, query: string, regex: boolean): FilterResult {
  const all = output.split(/\r?\n/)
  const total = all.length
  const everything = () => ({ lines: all.map((text, i) => ({ n: i + 1, text })), total, error: null })
  if (!query) return everything()
  let test: (line: string) => boolean
  if (regex) {
    let re: RegExp
    try {
      re = new RegExp(query, 'i')
    } catch (err) {
      return { lines: [], total, error: err instanceof Error ? err.message : 'Regex inválida' }
    }
    test = (line) => re.test(line)
  } else {
    const needle = query.toLowerCase()
    test = (line) => line.toLowerCase().includes(needle)
  }
  const lines: FilterResult['lines'] = []
  all.forEach((text, i) => {
    if (test(text)) lines.push({ n: i + 1, text })
  })
  return { lines, total, error: null }
}

/** Só o texto das linhas que bateram (para copiar). */
export const matchedText = (r: FilterResult): string => r.lines.map((l) => l.text).join('\n')
