import { expect, test } from 'bun:test'
import {
  attachmentText,
  contextInfo,
  formatCost,
  isBusy,
  isEffort,
  mentionPath,
  modelAlias,
  modelLabel,
  SHIFT_TAB,
} from './claude'

test('modelo atual pelo id ou pelo nome', () => {
  expect(modelAlias({ modelId: 'claude-opus-5-5', modelName: 'Opus 5.5' })).toBe('opus')
  expect(modelAlias({ modelId: null, modelName: 'Sonnet 5.5' })).toBe('sonnet')
  expect(modelAlias({ modelId: 'outro', modelName: null })).toBeNull()
  expect(modelAlias(null)).toBeNull()
  expect(modelLabel(null)).toBe('Modelo')
})

test('esforço válido', () => {
  expect(isEffort('high')).toBe(true)
  expect(isEffort('turbo')).toBe(false)
  expect(isEffort(null)).toBe(false)
})

test('custo e contexto', () => {
  expect(formatCost(0.4213)).toBe('US$ 0,42')
  expect(formatCost(12.345)).toBe('US$ 12,3')
  expect(formatCost(null)).toBeNull()
  expect(contextInfo(42.4)).toEqual({ label: '42% do contexto', tone: 'ok' })
  expect(contextInfo(70)?.tone).toBe('warn')
  expect(contextInfo(90)?.tone).toBe('full')
  expect(contextInfo(null)).toBeNull()
})

test('ocupado e Shift+Tab', () => {
  expect(isBusy('working')).toBe(true)
  expect(isBusy('waiting')).toBe(false)
  expect(isBusy(undefined)).toBe(false)
  expect(SHIFT_TAB).toBe('\u001b[Z')
})

test('menções dos anexos', () => {
  expect(mentionPath('D:\\proj\\src\\a.ts', 'D:\\proj')).toBe('src/a.ts')
  expect(mentionPath('d:\\PROJ\\b.png', 'D:\\proj\\')).toBe('b.png')
  expect(mentionPath('C:\\fora\\c.pdf', 'D:\\proj')).toBe('C:/fora/c.pdf')
  expect(mentionPath('D:\\projeto2\\x.ts', 'D:\\proj')).toBe('D:/projeto2/x.ts')
  expect(attachmentText(['D:\\proj\\a.ts', 'D:\\proj\\minha foto.png', 'C:\\x\\doc.pdf'], 'D:\\proj')).toBe(
    '@a.ts @"minha foto.png" @C:/x/doc.pdf ',
  )
  expect(attachmentText([], 'D:\\proj')).toBe('')
})
