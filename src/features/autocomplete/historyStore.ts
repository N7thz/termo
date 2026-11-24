import { normalizeDir } from '../history-search/history'

/** Um comando enviado pela caixa de entrada, com a pasta em que rodou. Do mais antigo ao mais novo. */
export interface StoredCommand {
  command: string
  cwd: string | null
}

const KEY = 'termo.commandHistory'
export const MAX_STORED = 3000
const MAX_COMMAND_CHARS = 500
/** Como o PSReadLine: linha que parece ter segredo não vai para o disco. */
const SENSITIVE = /password|passwd|asplaintext|token|api[-_]?key|secret|authorization|bearer|:\/\/[^/\s:@]+:[^/\s@]+@/i

type Store = Pick<Storage, 'getItem' | 'setItem'>

const defaultStore = (): Store | null => (typeof localStorage === 'undefined' ? null : localStorage)

export function loadCommands(store: Store | null = defaultStore()): StoredCommand[] {
  try {
    const data: unknown = JSON.parse(store?.getItem(KEY) ?? '[]')
    if (!Array.isArray(data)) return []
    return data.filter((e): e is StoredCommand => typeof e?.command === 'string')
  } catch {
    return []
  }
}

/** Lê, acrescenta (sem repetir o par comando + pasta) e grava. Relê sempre: as abas dividem o mesmo guardado. */
export function rememberCommand(command: string, cwd: string | null, store: Store | null = defaultStore()) {
  const text = command.trim()
  if (!store || !text || text.length > MAX_COMMAND_CHARS || SENSITIVE.test(text)) return
  const here = cwd ? normalizeDir(cwd) : null
  const list = loadCommands(store).filter((e) => e.command !== text || e.cwd !== here)
  list.push({ command: text, cwd: here })
  try {
    store.setItem(KEY, JSON.stringify(list.slice(-MAX_STORED)))
  } catch {
    // Armazenamento cheio: a sugestão fica só com o que já havia.
  }
}

/**
 * O que falta para o comando mais recente que começa com `text`: primeiro entre os rodados nesta pasta,
 * depois entre todos os guardados, por fim no arquivo do PSReadLine (`general`, mais recentes primeiro).
 */
export function suggest(
  text: string,
  cwd: string | null,
  stored: readonly StoredCommand[],
  general: readonly string[] = [],
): string {
  // `#` é o pedido em linguagem natural: não completa.
  if (!text.trim() || text.trimStart().startsWith('#')) return ''
  const fits = (command: string) => command.length > text.length && command.startsWith(text)
  const here = cwd ? normalizeDir(cwd) : null
  let anywhere: string | undefined
  for (let i = stored.length - 1; i >= 0; i--) {
    const entry = stored[i] as StoredCommand
    if (!fits(entry.command)) continue
    if (here && entry.cwd === here) return entry.command.slice(text.length)
    anywhere ??= entry.command
  }
  return (anywhere ?? general.find(fits))?.slice(text.length) ?? ''
}

/** O pedaço que o Ctrl+→ aceita: os espaços da frente e a próxima palavra. */
export const nextWord = (rest: string) => /^\s*\S+/.exec(rest)?.[0] ?? rest
