import { describe, expect, test } from 'bun:test'
import { filterGallery, rowStep } from './gallery'
import { DEFAULT_DARK, DEFAULT_LIGHT, SYSTEM_THEME, THEME_GROUPS } from './themes'

const groups = [
  {
    label: 'Termo',
    options: [
      { id: SYSTEM_THEME, name: 'Sistema' },
      { id: DEFAULT_DARK.id, name: 'Termo Escuro', theme: DEFAULT_DARK },
      { id: DEFAULT_LIGHT.id, name: 'Termo Claro', theme: DEFAULT_LIGHT },
    ],
  },
  {
    label: 'Outros',
    options: [
      {
        id: 'cafe',
        name: 'Café da Manhã',
        theme: { ...DEFAULT_LIGHT, id: 'cafe', credit: { author: 'Ana Souza', source: 'https://example.com' } },
      },
    ],
  },
]

describe('galeria de temas', () => {
  test('sem busca nem filtro mostra tudo', () => {
    expect(filterGallery('', 'all', groups)).toEqual(groups)
  })

  test('filtra por esquema e mantém o Sistema nos dois', () => {
    const dark = filterGallery('', 'dark', groups)
    expect(dark.flatMap((g) => g.options.map((o) => o.id))).toEqual([SYSTEM_THEME, DEFAULT_DARK.id])
    const light = filterGallery('', 'light', groups)
    expect(light.flatMap((g) => g.options.map((o) => o.id))).toEqual([SYSTEM_THEME, DEFAULT_LIGHT.id, 'cafe'])
  })

  test('busca ignora acento e caixa, e procura também no autor', () => {
    expect(filterGallery('CAFE', 'all', groups).flatMap((g) => g.options.map((o) => o.id))).toEqual(['cafe'])
    expect(filterGallery('souza', 'all', groups).flatMap((g) => g.options.map((o) => o.id))).toEqual(['cafe'])
  })

  test('todas as palavras precisam bater; grupos vazios saem', () => {
    const result = filterGallery('termo claro', 'all', groups)
    expect(result).toHaveLength(1)
    expect(result[0].options.map((o) => o.id)).toEqual([DEFAULT_LIGHT.id])
    expect(filterGallery('nada disso', 'all', groups)).toEqual([])
  })

  test('funciona com os grupos reais', () => {
    expect(filterGallery('', 'all').length).toBe(THEME_GROUPS.length)
  })

  test('andar por linha na grade para nas bordas', () => {
    expect(rowStep(1, 10, 4, 1)).toBe(5)
    expect(rowStep(5, 10, 4, -1)).toBe(1)
    expect(rowStep(8, 10, 4, 1)).toBe(8)
    expect(rowStep(2, 10, 4, -1)).toBe(2)
    expect(rowStep(3, 10, 0, 1)).toBe(4)
  })
})
