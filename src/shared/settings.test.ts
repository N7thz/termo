import { expect, test } from 'bun:test'
import { clampFontSize, DEFAULT_SETTINGS, FONT_MAX, FONT_MIN } from './settings'

test('clampFontSize limita e arredonda', () => {
  expect(clampFontSize(1)).toBe(FONT_MIN)
  expect(clampFontSize(999)).toBe(FONT_MAX)
  expect(clampFontSize(15.6)).toBe(16)
  expect(clampFontSize(Number.NaN)).toBe(DEFAULT_SETTINGS.fontSize)
})
