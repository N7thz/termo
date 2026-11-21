import { THEME_GROUPS, type ThemeOption } from './themes'

export type SchemeFilter = 'all' | 'dark' | 'light'

export interface GalleryGroup {
  label: string
  options: readonly ThemeOption[]
}

// Sem acentos e sem caixa: "solarizado" acha "Solarizado", "cafe" acha "Café".
const fold = (text: string) =>
  text
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()

function matches(option: ThemeOption, words: string[], scheme: SchemeFilter): boolean {
  // "Sistema" alterna entre claro e escuro, então aparece nos dois filtros.
  if (scheme !== 'all' && option.theme && option.theme.scheme !== scheme) return false
  if (words.length === 0) return true
  const haystack = fold(`${option.name} ${option.theme?.credit?.author ?? ''}`)
  return words.every((w) => haystack.includes(w))
}

/** Grupos da galeria com a busca e o filtro aplicados; grupos vazios saem. */
export function filterGallery(
  query: string,
  scheme: SchemeFilter,
  groups: readonly GalleryGroup[] = THEME_GROUPS,
): GalleryGroup[] {
  const words = fold(query).split(/\s+/).filter(Boolean)
  return groups
    .map((g) => ({ label: g.label, options: g.options.filter((o) => matches(o, words, scheme)) }))
    .filter((g) => g.options.length > 0)
}

/** Índice do item numa grade de `cols` colunas ao andar uma linha para cima ou para baixo. */
export function rowStep(index: number, count: number, cols: number, delta: 1 | -1): number {
  const next = index + delta * Math.max(1, cols)
  return next < 0 || next >= count ? index : next
}
