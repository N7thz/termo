import { describe, expect, test } from 'bun:test'
import { contrast, luminance, mix } from './derive'
import splashSchemes from './splash-themes.json'
import {
  DEFAULT_DARK,
  DEFAULT_LIGHT,
  findTheme,
  resolveTheme,
  SPLASH_THEMES,
  SYSTEM_THEME,
  THEME_GROUPS,
  THEME_OPTIONS,
  THEMES,
} from './themes'

const ANSI = [
  'black',
  'red',
  'green',
  'yellow',
  'blue',
  'magenta',
  'cyan',
  'white',
  'brightBlack',
  'brightRed',
  'brightGreen',
  'brightYellow',
  'brightBlue',
  'brightMagenta',
  'brightCyan',
  'brightWhite',
] as const

const ALL = [...THEMES, ...SPLASH_THEMES]

describe('temas', () => {
  test('ids únicos e no formato aceito pelo Rust', () => {
    const ids = [SYSTEM_THEME, ...ALL.map((t) => t.id)]
    expect(new Set(ids).size).toBe(ids.length)
    for (const id of ids) expect(id).toMatch(/^[a-z0-9-]{1,40}$/)
  })

  test('todo tema tem as 16 cores ANSI e fundo do terminal igual ao da interface', () => {
    for (const t of ALL) {
      for (const key of ANSI) expect(t.terminal[key]).toMatch(/^#[0-9a-f]{6}$/i)
      expect(t.terminal.background).toBe(t.ui.bg)
    }
  })

  test('texto da interface sempre legível (contraste ≥ 4.5), inclusive nos importados', () => {
    for (const t of ALL) expect(contrast(t.ui.text, t.ui.bg)).toBeGreaterThanOrEqual(4.5)
  })

  test('temas do Termo: texto do terminal também legível', () => {
    for (const t of THEMES) {
      expect(contrast(t.terminal.foreground as string, t.terminal.background as string)).toBeGreaterThanOrEqual(4.5)
    }
  })

  test('destaque visível sobre o fundo (≥ 3) e esquema combina com o fundo', () => {
    for (const t of ALL) {
      expect(contrast(t.ui.accent, t.ui.bg)).toBeGreaterThanOrEqual(t.credit ? 1.5 : 3)
      expect(luminance(t.ui.bg) < 0.2).toBe(t.scheme === 'dark')
    }
  })

  test('TerminalSplash: todos os esquemas convertidos, com crédito', () => {
    expect(SPLASH_THEMES.length).toBe(splashSchemes.length)
    expect(SPLASH_THEMES.length).toBeGreaterThan(200)
    for (const t of SPLASH_THEMES) {
      expect(t.id.startsWith('ts-')).toBe(true)
      expect(t.credit?.source).toMatch(/^https?:\/\//)
    }
  })

  test('grupos: Termo com "Sistema" primeiro, depois TerminalSplash', () => {
    expect(THEME_GROUPS.map((g) => g.label)[0]).toBe('Termo')
    expect(THEME_OPTIONS[0].id).toBe(SYSTEM_THEME)
    expect(THEME_OPTIONS).toHaveLength(ALL.length + 1)
  })

  test('resolveTheme e findTheme', () => {
    expect(resolveTheme('dracula', false).id).toBe('dracula')
    expect(resolveTheme(SYSTEM_THEME, true)).toBe(DEFAULT_DARK)
    expect(resolveTheme(SYSTEM_THEME, false)).toBe(DEFAULT_LIGHT)
    expect(resolveTheme('nao-existe', true)).toBe(DEFAULT_DARK)
    const splash = SPLASH_THEMES[0]
    expect(resolveTheme(splash.id, true)).toBe(splash)
    expect(findTheme('nao-existe')).toBeUndefined()
  })
})

describe('derive', () => {
  test('mix e contraste', () => {
    expect(mix('#000000', '#ffffff', 0.5)).toBe('#808080')
    expect(contrast('#000000', '#ffffff')).toBeCloseTo(21, 0)
  })
})
