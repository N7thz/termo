const CD_COMMAND = /^(?:cd|sl|pushd|set-location|chdir)(?:\s+(.*))?$/i

/**
 * Decide se a linha digitada pede sugestão de pasta e devolve o trecho a completar.
 * - `cd pro`, `cd ../ap`, `Set-Location src` → o argumento (`cd` sozinho → '' = listar tudo);
 * - uma palavra só com 2+ letras (`pro`) ou um caminho (`../ap`) → a própria palavra;
 * - linha vazia ou outro comando com argumentos (`git status`) → null (sem sugestões).
 */
export function extractQuery(input: string | null): string | null {
  if (input == null) return null
  const line = input.trimStart()
  if (!line) return null
  const cd = CD_COMMAND.exec(line.trimEnd())
  if (cd) return (cd[1] ?? '').trim().replace(/^['"]|['"]$/g, '')
  if (/\s/.test(line.trimEnd())) return null
  const word = line.trimEnd()
  if (/[\\/]/.test(word) || word.length >= 2) return word
  return null
}
