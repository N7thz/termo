import { expect, test } from 'bun:test'
import { addAttachments, fileName, isImagePath, pathsText, quotePath } from './attachments'

test('isImagePath', () => {
  expect(isImagePath('C:\\a\\print.PNG')).toBe(true)
  expect(isImagePath('foto.jpeg')).toBe(true)
  expect(isImagePath('notas.txt')).toBe(false)
  expect(isImagePath('png')).toBe(false)
})

test('quotePath: um argumento literal em cada shell', () => {
  const p = "C:\\Users\\Ana\\O'Brien $HOME\\a.png"
  expect(quotePath(p, 'pwsh')).toBe("'C:\\Users\\Ana\\O''Brien $HOME\\a.png'")
  expect(quotePath(p, 'powershell')).toBe("'C:\\Users\\Ana\\O''Brien $HOME\\a.png'")
  expect(quotePath('C:\\x y\\a.png', 'cmd')).toBe('"C:\\x y\\a.png"')
  expect(quotePath(p, 'wsl')).toBe("'/mnt/c/Users/Ana/O'\\''Brien $HOME/a.png'")
  expect(quotePath('D:\\b\\c.png', 'bash')).toBe("'/d/b/c.png'")
  expect(quotePath('C:\\a\\b.png', 'claude')).toBe('C:\\a\\b.png')
  expect(quotePath('C:\\a b\\c.png', 'claude')).toBe('"C:\\a b\\c.png"')
})

test('pathsText separa com espaço e não cola no texto já escrito', () => {
  expect(pathsText(['C:\\a.png', 'C:\\b.png'], 'pwsh')).toBe(" 'C:\\a.png' 'C:\\b.png' ")
  expect(pathsText([], 'pwsh')).toBe('')
})

test('addAttachments não repete e guarda os mais recentes', () => {
  let list = addAttachments([], ['a.png', 'b.txt'])
  expect(list).toEqual([
    { path: 'a.png', image: true },
    { path: 'b.txt', image: false },
  ])
  list = addAttachments(list, ['a.png', 'c.png', 'd.png'], 3)
  expect(list.map((a) => a.path)).toEqual(['b.txt', 'c.png', 'd.png'])
})

test('fileName', () => {
  expect(fileName('C:\\x\\y\\print.png')).toBe('print.png')
  expect(fileName('/mnt/c/z.jpg')).toBe('z.jpg')
})
