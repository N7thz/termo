import { describe, expect, test } from 'bun:test'
import { DEFAULT_SETTINGS } from '../../shared/settings'
import {
  addImages,
  clampBlur,
  clampChangeSecs,
  clampOpacity,
  fileName,
  imageStyle,
  isBackgroundActive,
  isTranslucent,
  MAX_BACKGROUNDS,
  nextIndex,
  transparentTheme,
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
      background: '#00000000',
      foreground: '#fff',
    })
    expect(isTranslucent('#00000000')).toBe(true)
    expect(isTranslucent('#1a1b26ff')).toBe(false)
    expect(isTranslucent('#1a1b26')).toBe(false)
    expect(isTranslucent('rgba(0, 0, 0, 0.5)')).toBe(true)
    expect(isTranslucent('rgb(0 0 0 / 1)')).toBe(false)
    expect(isTranslucent(undefined)).toBe(false)
  })
})
