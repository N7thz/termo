import { tokenize } from '../input/tokenize'
import type { NpmScript } from '../node-version/types'
import { cargo } from './specs/cargo'
import { docker } from './specs/docker'
import { git } from './specs/git'
import { bun, npm } from './specs/node'
import type { Command, Flag } from './specs/types'
import { winget } from './specs/winget'

const SPECS = new Map([git, bun, npm, cargo, winget, docker].map((c) => [c.name, c]))

export interface Completion {
  /** O que entra na linha. */
  value: string
  description: string
  kind: 'subcommand' | 'flag' | 'script'
}

export interface CompletionResult {
  /** Onde começa a palavra trocada (vai até o cursor). */
  start: number
  items: Completion[]
}

/** Operadores depois dos quais vem um comando novo. */
const SEPARATOR = /^(?:\||;|&&|\|\||\(|\{|&)$/

/** Onde começa o comando em que o cursor está (depois de `|`, `;`, `&&`, quebra de linha...). */
function segmentStart(text: string): number {
  let offset = 0
  let start = 0
  for (const token of tokenize(text)) {
    const end = offset + token.text.length
    if (token.type === 'operator' && SEPARATOR.test(token.text)) start = end
    else if (token.type === 'plain' && token.text.includes('\n')) start = offset + token.text.lastIndexOf('\n') + 1
    offset = end
  }
  return start
}

const findCommand = (node: Command, word: string) =>
  node.subcommands?.find((c) => c.name === word || c.aliases?.includes(word))

/**
 * Sugestões do comando conhecido na posição do cursor: subcomandos, flags ou scripts do `package.json`.
 * `null` quando não há o que sugerir (comando desconhecido, valor de flag, argumento livre): o Tab então
 * completa pasta, como antes.
 */
export function completeCommand(
  line: string,
  caret: number,
  scripts: readonly NpmScript[] = [],
): CompletionResult | null {
  const before = line.slice(0, caret)
  const from = segmentStart(before)
  const words = [...before.slice(from).matchAll(/(?:"[^"]*"?|'[^']*'?|[^\s"'])+/g)]
  const last = words.at(-1)
  const typing = last && from + last.index + last[0].length === caret ? last : undefined
  const [head, ...rest] = (typing ? words.slice(0, -1) : words).map((m) => m[0])
  if (!head) return null
  const root = SPECS.get(head.toLowerCase().replace(/\.(?:exe|cmd|ps1)$/, ''))
  if (!root) return null

  let node = root
  /** Já veio um argumento livre: daqui em diante só flags. */
  let positional = false
  let skipValue = false
  const used = new Set<string>()
  const flagsHere = () => [...(node.flags ?? []), ...(node === root ? [] : (root.flags ?? []))]
  for (const word of rest) {
    if (skipValue) {
      skipValue = false
    } else if (word === '--') {
      return null
    } else if (word.startsWith('-')) {
      used.add(word.split('=')[0] as string)
      skipValue = !word.includes('=') && !!flagsHere().find((f) => f.names.includes(word))?.takesValue
    } else {
      const next = positional ? undefined : findCommand(node, word)
      if (next) node = next
      else positional = true
    }
  }
  if (skipValue) return null

  const word = typing?.[0] ?? ''
  const start = typing ? from + typing.index : caret
  let items: Completion[]
  if (word.startsWith('-')) {
    items = flagsHere().flatMap((f) => flagItem(f, word, used))
  } else if (positional) {
    return null
  } else {
    const subcommands: Completion[] = (node.subcommands ?? []).map((c) => ({
      value: c.name,
      description: c.description,
      kind: 'subcommand',
    }))
    const names: Completion[] = node.scripts
      ? scripts.map((s) => ({ value: s.name, description: s.command, kind: 'script' }))
      : []
    // Em `bun run` os scripts são o que importa; em `bun ` vêm depois dos subcomandos.
    items = [...subcommands, ...names].filter((c) => c.value.startsWith(word))
  }
  // Nada a acrescentar quando a única opção é o que já está escrito.
  if (items.length === 0 || (items.length === 1 && items[0]?.value === word)) return null
  return { start, items }
}

/** A forma da flag que combina com o digitado; nenhuma se ela já está na linha. */
function flagItem(f: Flag, word: string, used: Set<string>): Completion[] {
  if (f.names.some((n) => used.has(n))) return []
  const name = f.names.find((n) => n.startsWith(word))
  return name ? [{ value: name, description: f.description, kind: 'flag' }] : []
}
