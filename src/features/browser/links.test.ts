import { expect, test } from 'bun:test'
import { resolveTarget } from './links'
import { splitUrl } from './url'

test('clique normal segue a preferência', () => {
  expect(resolveTarget('panel', false, true)).toBe('panel')
  expect(resolveTarget('browser', false, true)).toBe('browser')
})

test('Ctrl+clique faz o contrário', () => {
  expect(resolveTarget('panel', true, true)).toBe('browser')
  expect(resolveTarget('browser', true, true)).toBe('panel')
})

test('sem painel na tela, tudo vai para o navegador', () => {
  expect(resolveTarget('panel', false, false)).toBe('browser')
  expect(resolveTarget('browser', true, false)).toBe('browser')
})

test('endereço separado em host e resto', () => {
  expect(splitUrl('https://example.com/')).toEqual({ host: 'example.com', rest: '' })
  expect(splitUrl('http://localhost:5173/docs?a=1#x')).toEqual({ host: 'localhost:5173', rest: '/docs?a=1#x' })
  expect(splitUrl('lixo')).toEqual({ host: 'lixo', rest: '' })
})
