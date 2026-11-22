import { expect, test } from 'bun:test'
import { DEFAULT_SETTINGS, MAX_PINNED } from '../../shared/settings'
import { createProfile, isPinned, newProfileId, PROFILE_COLORS, pinFolder, profileColorCss } from './profiles'

const [trabalho] = DEFAULT_SETTINGS.profiles

test('newProfileId tira acentos e evita repetir', () => {
  expect(newProfileId('Ação Rápida!', [])).toBe('acao-rapida')
  expect(newProfileId('Trabalho', DEFAULT_SETTINGS.profiles)).toBe('trabalho-2')
  expect(newProfileId('***', [])).toBe('perfil')
})

test('createProfile usa uma cor ainda livre', () => {
  const p = createProfile(DEFAULT_SETTINGS.profiles)
  expect(p.name).toBe('Perfil 3')
  expect(p.color).toBe(PROFILE_COLORS[2])
  expect(p.id).toBe('perfil-3')
})

test('pinFolder não repete e respeita o limite', () => {
  let p = pinFolder(trabalho, String.raw`D:\estudos\termo`)
  expect(p.pinned).toEqual([String.raw`D:\estudos\termo`])
  expect(pinFolder(p, String.raw`d:\Estudos\termo\ `.trim())).toBe(p)
  expect(isPinned(p, 'D:/estudos/termo/'.replaceAll('/', '\\'))).toBe(true)
  for (let i = 0; i < 20; i++) p = pinFolder(p, `C:/p${i}`)
  expect(p.pinned).toHaveLength(MAX_PINNED)
})

test('profileColorCss usa os tons do tema', () => {
  expect(profileColorCss('green')).toBe('var(--tone-green)')
  expect(profileColorCss('accent')).toBe('var(--accent)')
  expect(profileColorCss('claude')).toBe('var(--claude)')
  expect(profileColorCss('#aabbcc')).toBe('#aabbcc')
})
