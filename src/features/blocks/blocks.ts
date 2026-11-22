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
