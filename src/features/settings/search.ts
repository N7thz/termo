export type SettingsGroupId = 'general' | 'terminal' | 'font' | 'background' | 'highlights' | 'system' | 'transfer'

/** Texto para comparar na busca: minúsculo, sem acento e com espaços simples ("Ação" ≈ "acao"). */
export function normalize(text: string): string {
  return text
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim()
}
