import { expect, test } from 'bun:test'
import { createWebglPool, type WebglSlot } from './webglPool'

const slot = (name: string, released: string[], visible = false): WebglSlot & { shown: boolean } => {
  const s = {
    shown: visible,
    visible: () => s.shown,
    release: () => released.push(name),
  }
  return s
}

test('passando do teto, solta o escondido usado há mais tempo', () => {
  const released: string[] = []
  const pool = createWebglPool(2)
  const [a, b, c] = ['a', 'b', 'c'].map((n) => slot(n, released))
  pool.touch(a)
  pool.touch(b)
  pool.touch(c)
  expect(released).toEqual(['a'])
  expect(pool.size).toBe(2)
})

test('usar de novo põe na frente', () => {
  const released: string[] = []
  const pool = createWebglPool(2)
  const [a, b, c] = ['a', 'b', 'c'].map((n) => slot(n, released))
  pool.touch(a)
  pool.touch(b)
  pool.touch(a)
  pool.touch(c)
  expect(released).toEqual(['b'])
})

test('nunca solta um terminal na tela, nem o que acabou de entrar', () => {
  const released: string[] = []
  const pool = createWebglPool(1)
  const a = slot('a', released, true)
  const b = slot('b', released, true)
  pool.touch(a)
  pool.touch(b)
  expect(released).toEqual([])
  expect(pool.size).toBe(2)
  a.shown = false
  pool.touch(b)
  expect(released).toEqual(['a'])
})

test('remove tira do pool sem soltar', () => {
  const released: string[] = []
  const pool = createWebglPool(1)
  const a = slot('a', released)
  pool.touch(a)
  pool.remove(a)
  expect(pool.size).toBe(0)
  expect(released).toEqual([])
})
