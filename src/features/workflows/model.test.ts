import { describe, expect, test } from 'bun:test'
import { EXAMPLE_WORKFLOWS, moveItem, validateWorkflow } from './model'
import { extractParams, fillTemplate } from './params'

describe('validateWorkflow', () => {
  const ok = { name: 'Log', command: 'git log {{n}}', description: '' }

  test('aceita um workflow válido', () => {
    expect(validateWorkflow(ok)).toBeNull()
  })

  test('nome, comando e descrição respeitam os limites do Rust', () => {
    expect(validateWorkflow({ ...ok, name: '  ' })).toContain('nome')
    expect(validateWorkflow({ ...ok, name: 'x'.repeat(61) })).toContain('60')
    expect(validateWorkflow({ ...ok, command: ' ' })).toContain('comando')
    expect(validateWorkflow({ ...ok, command: 'x'.repeat(2001) })).toContain('2000')
    expect(validateWorkflow({ ...ok, description: 'x'.repeat(201) })).toContain('200')
    expect(validateWorkflow({ ...ok, name: 'x'.repeat(60), description: 'y'.repeat(200) })).toBeNull()
  })
})

describe('moveItem', () => {
  test('reordena sem alterar a lista original', () => {
    const list = ['a', 'b', 'c']
    expect(moveItem(list, 0, 2)).toEqual(['b', 'c', 'a'])
    expect(moveItem(list, 2, 1)).toEqual(['a', 'c', 'b'])
    expect(list).toEqual(['a', 'b', 'c'])
  })

  test('fora dos limites ou no mesmo lugar não muda nada', () => {
    expect(moveItem(['a', 'b'], 0, 5)).toEqual(['a', 'b'])
    expect(moveItem(['a', 'b'], 1, 1)).toEqual(['a', 'b'])
  })
})

describe('sugestões', () => {
  test('são válidas e cada uma tem parâmetros preenchíveis', () => {
    for (const w of EXAMPLE_WORKFLOWS) {
      expect(validateWorkflow(w)).toBeNull()
      const names = extractParams(w.command)
      expect(names.length).toBeGreaterThan(0)
      const values = Object.fromEntries(names.map((n) => [n, 'x']))
      expect(fillTemplate(w.command, values)).not.toContain('{{')
    }
  })
})
