/**
 * Partes puras dos blocos por comando (veja commandBlocks.ts): decodificar o comando do `OSC 633;E`,
 * formatar a duração e juntar a saída lida do buffer.
 */

/** Desfaz o escape do `OSC 633;E` (src-tauri/src/shell.rs, PWSH_COMMAND_MARKS): `\\` e `\xHH`. */
export function decodeCommand(raw: string): string {
  return raw.replace(/\\(\\|x([0-9a-fA-F]{2}))/g, (_, esc: string, hex?: string) =>
    hex ? String.fromCharCode(Number.parseInt(hex, 16)) : esc,
  )
}

/** "0,4 s", "12 s", "1 min 5 s", "2 h 3 min". */
export function formatDuration(ms: number): string {
  if (ms < 10_000) return `${(Math.max(0, ms) / 1000).toFixed(1).replace('.', ',')} s`
  const s = Math.round(ms / 1000)
  if (s < 60) return `${s} s`
  const m = Math.floor(s / 60)
  if (m < 60) return s % 60 ? `${m} min ${s % 60} s` : `${m} min`
  const h = Math.floor(m / 60)
  return m % 60 ? `${h} h ${m % 60} min` : `${h} h`
}

/** Uma linha do buffer: o texto e se ela continua a anterior (quebra automática). */
export interface BufferRow {
  text: string
  wrapped: boolean
}

/** Junta as linhas do buffer em texto: linhas quebradas viram uma só e as vazias do fim saem. */
export function joinRows(rows: readonly BufferRow[]): string {
  const lines: string[] = []
  for (const row of rows) {
    if (row.wrapped && lines.length) lines[lines.length - 1] += row.text
    else lines.push(row.text)
  }
  while (lines.length && !lines[lines.length - 1].trim()) lines.pop()
  return lines.map((l) => l.trimEnd()).join('\n')
}

/** Corta saídas enormes antes de mandar para a IA (o fim é o que mais importa num erro). */
export function tail(text: string, maxChars: number): string {
  return text.length <= maxChars ? text : `…\n${text.slice(text.length - maxChars)}`
}

const IMAGE_EXT = String.raw`\.(?:png|jpe?g|gif|webp|bmp|ico|svg|avif)`
/** Entre aspas: o nome pode ter espaços. */
const QUOTED = new RegExp(String.raw`["']([^"'\r\n]+?${IMAGE_EXT})["']`, 'gi')
/** Solto: até um espaço, aspas ou pontuação que não faz parte de caminho. */
const BARE = new RegExp(
  String.raw`(?:^|[\s(=,\[>])((?:[A-Za-z]:)?[^\s"'<>|*?(),\[\]]*${IMAGE_EXT})(?=$|[\s),;:\]])`,
  'gim',
)
/** Linha do `ls`/Get-ChildItem do PowerShell: o nome é o resto da linha depois da hora e do tamanho. */
const LS_ROW = /^[-dlarhs]{5,6}\s+.*?\d{1,2}:\d{2}(?::\d{2})?(?:\s*[AP]M)?\s+(?:\d+\s+)?(.+?)\s*$/i
const ENDS_IMAGE = new RegExp(`${IMAGE_EXT}$`, 'i')

/**
 * Nomes de imagem citados no comando ou na saída (`ls` de uma pasta com PNGs, `magick a.jpg b.png`...).
 * São só candidatos: o backend confere quais existem (src-tauri/src/images.rs).
 */
export function findImagePaths(text: string, limit = 200): string[] {
  const found = new Set<string>()
  const add = (s: string | undefined) => {
    const name = s?.trim()
    if (name && found.size < limit) found.add(name)
  }
  for (const line of text.split(/\r?\n/)) {
    const ls = LS_ROW.exec(line)
    if (ls && ENDS_IMAGE.test(ls[1])) add(ls[1])
  }
  for (const m of text.matchAll(QUOTED)) add(m[1])
  // Um nome solto que é só o fim de um nome já achado ("inicio.png" de "tela de inicio.png") não conta.
  for (const m of text.matchAll(BARE)) if (![...found].some((f) => f !== m[1] && f.endsWith(` ${m[1]}`))) add(m[1])
  return [...found]
}

/** Linhas de um bloco no buffer (as marcas do xterm; -1 quando a linha já saiu do histórico). */
export interface BlockSpan {
  promptLine: number
  outputLine: number
  /** Linha logo depois da saída; `null` enquanto o comando roda. */
  endLine: number | null
}

/**
 * Bloco cujo comando já saiu da tela por cima mas cuja saída ainda ocupa a primeira linha visível
 * (`top`): é ele que o cabeçalho fixo mostra. `-1` se nenhum.
 */
export function stickyIndex(spans: readonly BlockSpan[], top: number): number {
  for (let i = spans.length - 1; i >= 0; i--) {
    const s = spans[i]
    if (s.outputLine < 0 || s.promptLine < 0) continue
    if (s.outputLine > top) continue
    if (s.endLine != null && (s.endLine <= top || s.endLine <= s.outputLine)) return -1
    return i
  }
  return -1
}
