import { expect, test } from 'bun:test'
import { fixCommand, naturalLanguageRequest, parseAnswer } from './answer'

const answer = 'O módulo não existe.\n\n```powershell\nnpm install left-pad\n```\n\nDepois rode de novo.'

test('separa texto e código', () => {
  expect(parseAnswer(answer)).toEqual([
    { type: 'text', text: 'O módulo não existe.' },
    { type: 'code', lang: 'powershell', code: 'npm install left-pad' },
    { type: 'text', text: 'Depois rode de novo.' },
  ])
  expect(parseAnswer('só texto')).toEqual([{ type: 'text', text: 'só texto' }])
})

test('comando de correção', () => {
  expect(fixCommand(answer)).toBe('npm install left-pad')
  expect(fixCommand('```json\n{}\n```\n```\nls\n```')).toBe('ls')
  expect(fixCommand('sem código')).toBeNull()
})

test('pedido em linguagem natural começa com #', () => {
  expect(naturalLanguageRequest('# listar arquivos grandes')).toBe('listar arquivos grandes')
  expect(naturalLanguageRequest('  #achar porta 3000')).toBe('achar porta 3000')
  expect(naturalLanguageRequest('# a')).toBeNull()
  expect(naturalLanguageRequest('ls # comentário')).toBeNull()
})
