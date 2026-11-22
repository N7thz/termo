/**
 * Tokenizer simples de linha de comando do PowerShell, só para colorir. Sem pretensão de ser um
 * parser: o que importa é que a concatenação dos tokens devolva exatamente o texto de entrada.
 */
export type TokenType =
  | 'command'
  | 'parameter'
  | 'string'
  | 'variable'
  | 'number'
  | 'operator'
  | 'comment'
  | 'keyword'
  | 'path'
  | 'plain'

export interface Token {
  type: TokenType
  text: string
}

const KEYWORDS = new Set([
  'if',
  'elseif',
  'else',
  'foreach',
  'for',
  'while',
  'do',
  'until',
  'switch',
  'function',
  'filter',
  'return',
  'break',
  'continue',
  'try',
  'catch',
  'finally',
  'throw',
  'param',
  'begin',
  'process',
  'end',
  'in',
])

const OPERATOR_START = /^(?:&&|\|\||>>|2>&1|[|;&<>=!+*,(){}[\]])/
const WORD_BREAK = /[\s|;&<>(){},"']/
const NUMBER = /^[+-]?(?:0x[0-9a-f]+|\d+(?:\.\d+)?)(?:kb|mb|gb|tb|pb)?$/i
const WIN_PATH = /^(?:[a-z]:[\\/]|\\\\|\.{1,2}[\\/]|~[\\/]?)/i

/** Fim da string que começa em `i` (aspa em `text[i]`); aceita `''` e `` `" `` como escape, ou o fim do texto. */
function stringEnd(text: string, i: number): number {
  const q = text[i]
  let j = i + 1
  while (j < text.length) {
    if (q === '"' && text[j] === '`') j += 2
    else if (text[j] === q) {
      if (text[j + 1] === q) j += 2
      else return j + 1
    } else j++
  }
  return text.length
}

export function tokenize(text: string): Token[] {
  const out: Token[] = []
  const push = (type: TokenType, s: string) => {
    if (!s) return
    const last = out[out.length - 1]
    if (last && type === 'plain' && last.type === 'plain') last.text += s
    else out.push({ type, text: s })
  }
  // Próxima palavra é o comando: começo da linha ou depois de pipe, `;`, `&&`, `||`, `(`, `{`.
  let expectCommand = true
  let i = 0
  while (i < text.length) {
    const c = text[i] as string
    const rest = text.slice(i)
    if (/\s/.test(c)) {
      const m = /^\s+/.exec(rest) as RegExpExecArray
      push('plain', m[0])
      // Quebra de linha começa um comando novo.
      if (m[0].includes('\n')) expectCommand = true
      i += m[0].length
    } else if (c === '#') {
      const end = text.indexOf('\n', i)
      const stop = end === -1 ? text.length : end
      push('comment', text.slice(i, stop))
      i = stop
    } else if (c === '"' || c === "'") {
      const end = stringEnd(text, i)
      push('string', text.slice(i, end))
      expectCommand = false
      i = end
    } else if (c === '$') {
      const m = /^\$(?:\{[^}]*\}|[\w:?^$]+)/.exec(rest)
      const len = m ? m[0].length : 1
      push('variable', text.slice(i, i + len))
      expectCommand = false
      i += len
    } else {
      const op = OPERATOR_START.exec(rest)
      if (op) {
        push('operator', op[0])
        // `;`, `|`, `&&`, `||`, `(`, `{` e quebra abrem comando; `&` sozinho (call operator) também.
        expectCommand = /^(?:\||;|&&|\|\||\(|\{|&)$/.test(op[0])
        i += op[0].length
        continue
      }
      let j = i
      while (j < text.length && !WORD_BREAK.test(text[j] as string)) j++
      if (j === i) j = i + 1
      const word = text.slice(i, j)
      let type: TokenType
      if (word.startsWith('-') && /^-[a-z_?]/i.test(word) && !expectCommand) type = 'parameter'
      else if (WIN_PATH.test(word) || (/[/]/.test(word) && !expectCommand)) type = 'path'
      else if (NUMBER.test(word)) type = 'number'
      else if (expectCommand && KEYWORDS.has(word.toLowerCase())) type = 'keyword'
      else if (expectCommand) type = WIN_PATH.test(word) ? 'path' : 'command'
      else type = 'plain'
      // Caminho na posição de comando (`.\run.ps1`) continua sendo o comando.
      if (expectCommand && type === 'path') type = 'command'
      push(type, word)
      if (type !== 'keyword') expectCommand = false
      i = j
    }
  }
  return out
}
