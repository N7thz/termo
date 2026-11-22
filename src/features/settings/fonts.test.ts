import { expect, test } from 'bun:test'
import { BUNDLED_FONT, fontStack, isFontAvailable, primaryFont } from './fonts'

test('pilha começa pela escolhida e cai na embutida', () => {
  expect(fontStack('Fira Code')).toBe("'Fira Code', 'JetBrains Mono', Consolas, monospace")
  expect(fontStack(BUNDLED_FONT)).toBe("'JetBrains Mono', Consolas, monospace")
})

test('primeira fonte da pilha, com ou sem aspas', () => {
  expect(primaryFont("'JetBrains Mono', 'Cascadia Code', monospace")).toBe('JetBrains Mono')
  expect(primaryFont('Consolas, monospace')).toBe('Consolas')
  expect(primaryFont('"Fira Code"')).toBe('Fira Code')
})

test('fonte instalada muda a largura medida; ausente não', () => {
  const installed = new Set(['Fira Code'])
  const measure = (font: string) => {
    const first = font.split(',')[0].trim().replace(/'/g, '')
    return installed.has(first) ? 100 : font.length > 0 ? 80 : 0
  }
  // Medida da genérica sozinha = 80; com a fonte ausente, cai na genérica = 80.
  expect(isFontAvailable('Fira Code', measure)).toBe(true)
  expect(isFontAvailable('Hack', measure)).toBe(false)
  expect(isFontAvailable(BUNDLED_FONT, () => 0)).toBe(true)
})

test('fonte do terminal compensa o zoom da interface', async () => {
  const { terminalFontSize, zoomFor } = await import('./interfaceSize')
  expect(zoomFor('medium')).toBe(1)
  expect(terminalFontSize(14, 'medium')).toBe(14)
  expect(terminalFontSize(14, 'large') * zoomFor('large')).toBeCloseTo(14, 1)
  expect(terminalFontSize(14, 'small') * zoomFor('small')).toBeCloseTo(14, 1)
})
