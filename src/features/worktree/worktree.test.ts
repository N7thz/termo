import { describe, expect, test } from 'bun:test'
import { isInside, worktreeName, worktreeSlug, worktreeSummary } from './worktree'

describe('worktree', () => {
  test('slug do nome', () => {
    expect(worktreeSlug('Corrige o login!')).toBe('corrige-o-login')
    expect(worktreeSlug('  Ação   rápida ')).toBe('acao-rapida')
    expect(worktreeSlug('.oculto')).toBe('oculto')
    expect(worktreeSlug('v2.1_beta')).toBe('v2.1_beta')
    expect(worktreeSlug('!!!')).toBe('')
    expect(worktreeSlug('a'.repeat(60)).length).toBe(40)
  })

  test('nome e pasta dentro da cópia', () => {
    expect(worktreeName('D:\\p\\termo.worktrees\\tarefa')).toBe('tarefa')
    expect(isInside('D:\\P\\termo.worktrees\\tarefa\\src', 'D:\\p\\termo.worktrees\\tarefa')).toBe(true)
    expect(isInside('D:/p/termo.worktrees/tarefa', 'D:\\p\\termo.worktrees\\tarefa\\')).toBe(true)
    expect(isInside('D:\\p\\termo.worktrees\\tarefa2', 'D:\\p\\termo.worktrees\\tarefa')).toBe(false)
    expect(isInside(null, 'D:\\p')).toBe(false)
  })

  test('resumo', () => {
    expect(worktreeSummary({ ahead: 0, dirty: 0 })).toBe('sem alterações')
    expect(worktreeSummary({ ahead: 1, dirty: 3 })).toBe('1 commit · 3 não commitados')
  })
})
