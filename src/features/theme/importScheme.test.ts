import { expect, test } from 'bun:test'
import { ANSI, addCustomThemes, nameFromFile, normalizeColor, parseSchemeFile } from './importScheme'

const HEX = ['000000', 'cc0000', '00cc00', 'cccc00', '0000cc', 'cc00cc', '00cccc', 'cccccc']
const BRIGHT = ['555555', 'ff5555', '55ff55', 'ffff55', '5555ff', 'ff55ff', '55ffff', 'ffffff']
const ALL = [...HEX, ...BRIGHT]

function expectFull(s: ReturnType<typeof parseSchemeFile>[number]) {
  expect(s.background).toBe('#101010')
  expect(s.foreground).toBe('#e0e0e0')
  expect(ANSI.map((k) => s[k])).toEqual(ALL.map((h) => `#${h}`))
}

test('cores em vários formatos', () => {
  expect(normalizeColor('#ABC')).toBe('#aabbcc')
  expect(normalizeColor('#AABBCC')).toBe('#aabbcc')
  expect(normalizeColor('#aabbccdd')).toBe('#aabbcc')
  expect(normalizeColor('0x1E1E2E')).toBe('#1e1e2e')
  expect(normalizeColor("'#ff0000'")).toBe('#ff0000')
  expect(normalizeColor('rgb:ff/80/00')).toBe('#ff8000')
  expect(normalizeColor('rgb:ffff/8080/0000')).toBe('#ff8000')
  expect(normalizeColor('1d1f21')).toBe('#1d1f21')
  expect(normalizeColor('red')).toBeNull()
})

test('nome a partir do arquivo', () => {
  expect(nameFromFile('C:\\temas\\dracula_pro.itermcolors')).toBe('Dracula Pro')
  expect(nameFromFile('tokyo-night.toml')).toBe('Tokyo Night')
})

test('Windows Terminal: um esquema, uma lista e o settings.json com comentários', () => {
  const scheme = {
    name: 'Meu Tema',
    background: '#101010',
    foreground: '#E0E0E0',
    cursorColor: '#FFFFFF',
    selectionBackground: '#333333',
    ...Object.fromEntries(ANSI.map((k, i) => [k, `#${ALL[i]}`])),
  }
  const [one] = parseSchemeFile(JSON.stringify(scheme), 'x.json')
  expectFull(one)
  expect(one).toMatchObject({ id: 'custom-meu-tema', name: 'Meu Tema', cursor: '#ffffff', selection: '#333333' })
  expect(parseSchemeFile(JSON.stringify([scheme, { ...scheme, name: 'Outro' }]), 'x.json')).toHaveLength(2)
  const settings = `{\n  // comentário\n  "schemes": [${JSON.stringify(scheme)}]\n}`
  expect(parseSchemeFile(settings, 'settings.json')[0].name).toBe('Meu Tema')
})

test('iTerm2 (.itermcolors)', () => {
  const dict = (hex: string) => {
    const [r, g, b] = [0, 2, 4].map((i) => Number.parseInt(hex.slice(i, i + 2), 16) / 255)
    return `<dict><key>Color Space</key><string>sRGB</string><key>Blue Component</key><real>${b}</real><key>Green Component</key><real>${g}</real><key>Red Component</key><real>${r}</real></dict>`
  }
  const entries = [
    ...ALL.map((h, i) => `<key>Ansi ${i} Color</key>${dict(h)}`),
    `<key>Background Color</key>${dict('101010')}`,
    `<key>Foreground Color</key>${dict('e0e0e0')}`,
  ].join('\n')
  const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<plist version="1.0"><dict>${entries}</dict></plist>`
  const [s] = parseSchemeFile(xml, 'Solar.itermcolors')
  expectFull(s)
  expect(s.name).toBe('Solar')
  expect(s.cursor).toBe('#e0e0e0')
})

test('Ghostty', () => {
  const text = [
    '# tema',
    'background = 101010',
    'foreground = #e0e0e0',
    'cursor-color = #ffcc00',
    'selection-background = #444444',
    ...ALL.map((h, i) => `palette = ${i}=#${h}`),
  ].join('\n')
  const [s] = parseSchemeFile(text, 'meu-ghostty')
  expectFull(s)
  expect(s).toMatchObject({ cursor: '#ffcc00', selection: '#444444', source: 'Ghostty' })
})

test('Alacritty (TOML)', () => {
  const names = ['black', 'red', 'green', 'yellow', 'blue', 'magenta', 'cyan', 'white']
  const text = [
    '[colors.primary]',
    "background = '0x101010'",
    'foreground = "#e0e0e0" # texto',
    '[colors.cursor]',
    'cursor = "#ffcc00"',
    '[colors.normal]',
    ...names.map((n, i) => `${n} = "#${HEX[i]}"`),
    '[colors.bright]',
    ...names.map((n, i) => `${n} = "#${BRIGHT[i]}"`),
  ].join('\n')
  const [s] = parseSchemeFile(text, 'alacritty.toml')
  expectFull(s)
  expect(s.cursor).toBe('#ffcc00')
})

test('kitty', () => {
  const text = [
    'foreground #e0e0e0',
    'background #101010',
    'selection_background #222222',
    ...ALL.map((h, i) => `color${i} #${h}`),
  ].join('\n')
  const [s] = parseSchemeFile(text, 'kitty.conf')
  expectFull(s)
  expect(s.selection).toBe('#222222')
})

test('erros em português', () => {
  expect(() => parseSchemeFile('', 'a')).toThrow('vazio')
  expect(() => parseSchemeFile('{ quebrado', 'a.json')).toThrow('JSON')
  expect(() => parseSchemeFile('qualquer coisa', 'a.txt')).toThrow('formato não reconhecido')
  expect(() => parseSchemeFile('background = #000000\npalette = 0=#000000', 'g')).toThrow('faltam')
})

test('juntar importados: mesmo nome substitui, ids únicos', () => {
  const base = parseSchemeFile(
    JSON.stringify({
      name: 'A',
      background: '#101010',
      foreground: '#e0e0e0',
      ...Object.fromEntries(ANSI.map((k, i) => [k, `#${ALL[i]}`])),
    }),
    'a.json',
  )[0]
  const first = addCustomThemes([], [base])
  expect(first.ids).toEqual(['custom-a'])
  const again = addCustomThemes(first.list, [{ ...base, foreground: '#ffffff' }])
  expect(again.list).toHaveLength(1)
  expect(again.list[0].foreground).toBe('#ffffff')
  // Nome diferente com o mesmo id gerado ("a!" → custom-a): entra como outro, com id novo.
  const clash = addCustomThemes(first.list, [{ ...base, name: 'a!' }])
  expect(clash.list).toHaveLength(2)
  expect(clash.ids).toEqual(['custom-a-2'])
})
