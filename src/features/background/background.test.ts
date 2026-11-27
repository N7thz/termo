import { describe, expect, test } from 'bun:test'
import { DEFAULT_SETTINGS } from '../../shared/settings'
import {
  addImages,
  clampBlur,
  clampChangeSecs,
  clampGlow,
  clampOpacity,
  fileName,
  glowStyle,
  glowTone,
  imageStyle,
  isBackgroundActive,
  isTranslucent,
  MAX_BACKGROUNDS,
  nextIndex,
  transparentTheme,
  wantsGlow,
  wantsTransparentTerminal,
} from './background'

const bg = DEFAULT_SETTINGS.background

describe('fundo ativo', () => {
  test('precisa estar ligado e ter imagem', () => {
    expect(isBackgroundActive(bg)).toBe(false)
    expect(isBackgroundActive({ ...bg, enabled: true })).toBe(false)
    expect(isBackgroundActive({ ...bg, enabled: true, images: ['C:/a.png'] })).toBe(true)
    expect(isBackgroundActive(undefined)).toBe(false)
  })

  test('só o modo terminal deixa o xterm transparente', () => {
    const on = { ...bg, enabled: true, images: ['C:/a.png'] }
    expect(wantsTransparentTerminal(on)).toBe(true)
    expect(wantsTransparentTerminal({ ...on, target: 'window' })).toBe(false)
  })
})

describe('limites', () => {
  test('mesmas faixas do Rust', () => {
    expect(clampOpacity(0)).toBe(5)
    expect(clampOpacity(150)).toBe(100)
    expect(clampOpacity(Number.NaN)).toBe(20)
    expect(clampBlur(-3)).toBe(0)
    expect(clampBlur(99)).toBe(40)
    expect(clampChangeSecs(0)).toBe(0)
    expect(clampChangeSecs(1)).toBe(5)
    expect(clampChangeSecs(1e9)).toBe(86_400)
  })
})

describe('lista de imagens', () => {
  test('não repete e respeita o limite', () => {
    expect(addImages(['a'], ['a', ' b ', ''])).toEqual(['a', 'b'])
    const many = Array.from({ length: 80 }, (_, i) => `img${i}.png`)
    expect(addImages([], many)).toHaveLength(MAX_BACKGROUNDS)
  })

  test('nome do arquivo', () => {
    expect(fileName('C:\\Users\\eu\\Fotos\\praia.jpg')).toBe('praia.jpg')
    expect(fileName('/home/eu/a.png')).toBe('a.png')
  })
})

describe('slideshow', () => {
  test('em ordem dá a volta', () => {
    expect(nextIndex(0, 3, false)).toBe(1)
    expect(nextIndex(2, 3, false)).toBe(0)
    expect(nextIndex(0, 1, false)).toBe(0)
  })

  test('aleatório nunca repete a atual', () => {
    for (let r = 0; r < 1; r += 0.05) {
      const next = nextIndex(1, 3, true, () => r)
      expect(next).not.toBe(1)
      expect(next).toBeGreaterThanOrEqual(0)
      expect(next).toBeLessThan(3)
    }
  })
})

describe('estilo', () => {
  test('ajuste e desfoque', () => {
    expect(imageStyle({ fit: 'cover', blur: 0 }, 'data:x')).toMatchObject({
      backgroundSize: 'cover',
      backgroundRepeat: 'no-repeat',
      filter: undefined,
      inset: 0,
    })
    expect(imageStyle({ fit: 'tile', blur: 4 }, 'data:x')).toMatchObject({
      backgroundSize: 'auto',
      backgroundRepeat: 'repeat',
      filter: 'blur(4px)',
      inset: '-8px',
    })
  })

  test('tema transparente e detecção de alfa', () => {
    expect(transparentTheme({ background: '#1a1b26', foreground: '#fff' })).toEqual({
      background: '#1a1b2600',
      foreground: '#fff',
    })
    expect(transparentTheme({ background: 'rgb(1, 2, 3)' }).background).toBe('#00000000')
    expect(isTranslucent('#00000000')).toBe(true)
    expect(isTranslucent('#1a1b26ff')).toBe(false)
    expect(isTranslucent('#1a1b26')).toBe(false)
    expect(isTranslucent('rgba(0, 0, 0, 0.5)')).toBe(true)
    expect(isTranslucent('rgb(0 0 0 / 1)')).toBe(false)
    expect(isTranslucent(undefined)).toBe(false)
  })
})

describe('brilho do tema', () => {
  const bg = (over: Partial<typeof DEFAULT_SETTINGS.background> = {}) => ({ ...DEFAULT_SETTINGS.background, ...over })

  test('liga por padrão e convive com a imagem de fundo', () => {
    expect(wantsGlow(bg())).toBe(true)
    expect(wantsGlow(bg({ glow: false }))).toBe(false)
    expect(wantsGlow(bg({ enabled: true, images: ['C:/a.png'], target: 'terminal' }))).toBe(true)
    expect(wantsGlow(bg({ enabled: true, images: ['C:/a.png'], target: 'window' }))).toBe(true)
    expect(wantsGlow(bg({ enabled: false, images: ['C:/a.png'] }))).toBe(true)
  })

  test('intensidade presa entre 10 e 100', () => {
    expect([clampGlow(0), clampGlow(55), clampGlow(400), clampGlow(Number.NaN)]).toEqual([10, 55, 100, 50])
  })

  test('segundo tom foge do destaque', () => {
    expect(glowTone('#7aa2ff', { magenta: '#bb9af7', cyan: '#7dcfff' })).toBe('#bb9af7')
    expect(glowTone('#bd93f9', { magenta: '#ff79c6', cyan: '#8be9fd' })).toBe('#ff79c6')
    expect(glowTone('#ff79c6', { magenta: '#ff79c6', cyan: '#8be9fd' })).toBe('#8be9fd')
    expect(glowTone('#123456', {})).toBe('#123456')
  })

  test('halo mais fraco no tema claro e proporcional à intensidade', () => {
    const style = (scheme: 'dark' | 'light', strength: number) =>
      String(glowStyle({ accent: '#ff0000', tone: '#00ff00', scheme, strength }).backgroundImage)
    expect(style('dark', 100)).toContain('#ff0000 30%')
    expect(style('dark', 50)).toContain('#ff0000 15%')
    expect(style('light', 100)).toContain('#ff0000 24%')
    expect(style('dark', 100)).toContain('#00ff00 24%')
  })
})
