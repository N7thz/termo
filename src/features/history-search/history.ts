import type { IDisposable, Terminal } from '@xterm/xterm'
import { decodeCommand } from '../blocks/blocks'
import { rank } from './fuzzy'

/** Um comando rodado nesta sessão, com a pasta em que rodou. */
export interface LoggedCommand {
  command: string
  cwd: string | null
}

/** Quantos comandos da sessão guardar. */
const MAX_LOGGED = 1000

/**
 * Anota os comandos que rodam na aba (`OSC 633;E` traz o texto, `133;C` marca o início) junto da pasta
 * em que rodaram. Os handlers devolvem `false` para que os blocos e a ShellIntegration também recebam as marcas.
 */
export class CommandLog implements IDisposable {
  readonly commands: LoggedCommand[] = []
  private pending = ''
  private disposables: IDisposable[]

  constructor(
    term: Terminal,
    private cwd: () => string | null,
  ) {
    this.disposables = [
      term.parser.registerOscHandler(633, (data) => {
        if (data.startsWith('E;')) this.pending = decodeCommand(data.slice(2))
        return false
      }),
      term.parser.registerOscHandler(133, (data) => {
        if (data.startsWith('C')) this.started()
        return false
      }),
    ]
  }

  private started() {
    const command = this.pending.trim()
    this.pending = ''
    if (!command) return
    this.commands.push({ command, cwd: this.cwd() })
    if (this.commands.length > MAX_LOGGED) this.commands.splice(0, this.commands.length - MAX_LOGGED)
  }

  dispose() {
    for (const d of this.disposables) d.dispose()
  }
}

export interface HistoryEntry {
  command: string
  /** Veio dos blocos desta sessão (vale o filtro por pasta) ou só do arquivo do PSReadLine. */
  fromSession: boolean
  /** Pastas (normalizadas) em que o comando rodou nesta sessão. */
  cwds: string[]
}

/** Compara pastas sem diferenciar maiúsculas, `/` ou `\` nem a barra do fim (Windows). */
export function normalizeDir(dir: string): string {
  const d = dir.replace(/\//g, '\\').toLowerCase()
  return d.length > 3 ? d.replace(/\\+$/, '') : d
}

/**
 * Junta as duas fontes numa lista sem repetição, do mais recente para o mais antigo: primeiro os comandos
 * da sessão (o `session` vem do mais antigo ao mais novo), depois os do arquivo (`file`, mais recentes primeiro).
 */
export function mergeHistory(session: readonly LoggedCommand[], file: readonly string[]): HistoryEntry[] {
  const byCommand = new Map<string, HistoryEntry>()
  for (let i = session.length - 1; i >= 0; i--) {
    const { command, cwd } = session[i]
    const entry = byCommand.get(command) ?? { command, fromSession: true, cwds: [] }
    if (cwd && !entry.cwds.includes(normalizeDir(cwd))) entry.cwds.push(normalizeDir(cwd))
    byCommand.set(command, entry)
  }
  for (const command of file) {
    const c = command.trim()
    if (c && !byCommand.has(c)) byCommand.set(c, { command: c, fromSession: false, cwds: [] })
  }
  return [...byCommand.values()]
}

/** Só os comandos rodados em `cwd` (os do arquivo não têm pasta e ficam de fora). */
export function onlyHere(entries: readonly HistoryEntry[], cwd: string | null): HistoryEntry[] {
  if (!cwd) return []
  const here = normalizeDir(cwd)
  return entries.filter((e) => e.cwds.includes(here))
}

/** O comando numa linha só (comandos de várias linhas aparecem e são buscados assim). */
export const oneLine = (command: string) => command.replace(/\s*\n\s*/g, ' ')

/** Aplica o filtro de pasta e a busca aproximada. */
export function searchHistory(entries: readonly HistoryEntry[], query: string, cwd: string | null, here: boolean) {
  const pool = here ? onlyHere(entries, cwd) : entries
  return rank(pool, query, (e) => oneLine(e.command), 200)
}
