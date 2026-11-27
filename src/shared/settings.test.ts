import { expect, test } from 'bun:test'
import {
  CONTRAST_LEVELS,
  clampFontSize,
  DEFAULT_SETTINGS,
  FONT_MAX,
  FONT_MIN,
  MAX_PATTERN,
  MAX_PINNED,
  MAX_PROFILES,
  MAX_RULES,
} from './settings'
import contract from './settings.contract.json'

test('clampFontSize limita e arredonda', () => {
  expect(clampFontSize(1)).toBe(FONT_MIN)
  expect(clampFontSize(999)).toBe(FONT_MAX)
  expect(clampFontSize(15.6)).toBe(16)
  expect(clampFontSize(Number.NaN)).toBe(DEFAULT_SETTINGS.fontSize)
})

// O contrato é gravado pelo teste `settings_contract_matches_the_frontend` do Rust (src-tauri/src/settings.rs):
// padrão ou limite mudado só de um lado quebra este teste ou aquele.
test('padrões e limites iguais aos do Rust', () => {
  expect(DEFAULT_SETTINGS).toEqual(contract.defaults as unknown as typeof DEFAULT_SETTINGS)
  expect({
    fontMin: FONT_MIN,
    fontMax: FONT_MAX,
    maxProfiles: MAX_PROFILES,
    maxPinned: MAX_PINNED,
    maxRules: MAX_RULES,
    maxPattern: MAX_PATTERN,
    contrastLevels: CONTRAST_LEVELS.map((l): number => l.value),
  }).toEqual(contract.limits)
})
