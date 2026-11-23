/**
 * Parâmetros dos workflows: `{{nome}}` no comando vira um campo para preencher. O mesmo nome repetido
 * é um campo só. Os valores entram no comando de forma literal: o escape depende de onde o parâmetro
 * está (fora de aspas, entre aspas simples ou duplas do PowerShell), para `$(...)`, `;`, `|`, crases
 * e aspas digitados num campo nunca virarem código.
 */

const NAME = String.raw`[\p{L}_][\p{L}\p{N}_-]*`
const PLACEHOLDER = new RegExp(String.raw`\{\{\s*(${NAME})\s*\}\}`, 'uy')
const PLACEHOLDER_ALL = new RegExp(String.raw`\{\{\s*(${NAME})\s*\}\}`, 'gu')

/** Nomes dos parâmetros na ordem em que aparecem, sem repetição. */
export function extractParams(command: string): string[] {
  const names: string[] = []
  for (const m of command.matchAll(PLACEHOLDER_ALL)) if (!names.includes(m[1])) names.push(m[1])
  return names
}

/** Parâmetros sem valor (campo vazio ou só espaços): enquanto houver algum, o workflow não roda. */
export function missingParams(command: string, values: Readonly<Record<string, string>>): string[] {
  return extractParams(command).filter((name) => !(values[name] ?? '').trim())
}

// O PowerShell trata as aspas tipográficas como as normais.
const SINGLE_QUOTES = "'‘’‚‛"
const DOUBLE_QUOTES = '"“”„'

/** Caracteres que o PowerShell lê como parte de uma palavra solta, sem nenhum significado especial. */
const SAFE_BARE = /^[\p{L}\p{M}\p{N}_./\\:+=%~-]$/u

type Context = 'bare' | 'single' | 'double'

/** Escreve o valor como texto literal para o lugar em que o parâmetro está. */
export function escapeValue(value: string, context: Context): string {
  // Quebra de linha no valor viraria um segundo comando: campos são de uma linha só.
  const v = value.replace(/\r\n|\r|\n/g, ' ')
  let out = ''
  for (const ch of v) {
    if (context === 'single') out += SINGLE_QUOTES.includes(ch) ? ch + ch : ch
    else if (context === 'double') out += DOUBLE_QUOTES.includes(ch) || ch === '`' || ch === '$' ? `\`${ch}` : ch
    else out += SAFE_BARE.test(ch) ? ch : `\`${ch}`
  }
  // Palavra solta vazia sumiria da linha de comando: vira uma string vazia.
  return context === 'bare' && out === '' ? "''" : out
}

/**
 * Troca cada `{{nome}}` pelo valor, escapado conforme o contexto de aspas do PowerShell em que ele está
 * no próprio comando (`--msg={{m}}`, `'{{m}}'`, `"{{m}}"`). Nome sem valor entra como vazio.
 */
export function fillTemplate(command: string, values: Readonly<Record<string, string>>): string {
  let out = ''
  let context: Context = 'bare'
  let i = 0
  while (i < command.length) {
    PLACEHOLDER.lastIndex = i
    const m = PLACEHOLDER.exec(command)
    if (m) {
      out += escapeValue(values[m[1]] ?? '', context)
      i += m[0].length
      continue
    }
    const ch = command[i]
    const next = command[i + 1]
    if (context === 'bare') {
      if (SINGLE_QUOTES.includes(ch)) context = 'single'
      else if (DOUBLE_QUOTES.includes(ch)) context = 'double'
      else if (ch === '`' && next !== undefined) {
        out += ch + next
        i += 2
        continue
      }
    } else if (context === 'single') {
      if (SINGLE_QUOTES.includes(ch)) {
        // Aspa dobrada dentro de aspas simples é uma aspa literal: continua dentro.
        if (next !== undefined && SINGLE_QUOTES.includes(next)) {
          out += ch + next
          i += 2
          continue
        }
        context = 'bare'
      }
    } else if (ch === '`' && next !== undefined) {
      out += ch + next
      i += 2
      continue
    } else if (DOUBLE_QUOTES.includes(ch)) {
      if (next !== undefined && DOUBLE_QUOTES.includes(next)) {
        out += ch + next
        i += 2
        continue
      }
      context = 'bare'
    }
    out += ch
    i++
  }
  return out
}
