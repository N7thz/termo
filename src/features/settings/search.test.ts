import { expect, test } from 'bun:test'
import { normalize } from './search'

test('normalize ignora acento, caixa e espaços repetidos', () => {
  expect(normalize('  Avisos   e SISTEMA ')).toBe('avisos e sistema')
  expect(normalize('Configurações')).toBe('configuracoes')
  expect(normalize('Ação').includes(normalize('acao'))).toBe(true)
})
