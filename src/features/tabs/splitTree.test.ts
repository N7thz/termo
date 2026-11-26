import { expect, test } from 'bun:test'
import {
  fromOps,
  hasKey,
  layoutRects,
  leaf,
  leaves,
  MAX_PANES,
  neighbor,
  removeLeaf,
  type SplitNode,
  setRatio,
  splitLeaf,
  toOps,
} from './splitTree'

// 1 | 2 em cima, 3 embaixo da direita:  [1][2]
//                                         [1][3]
const tree = (): SplitNode => splitLeaf(splitLeaf(leaf(1), 1, 2, 'row'), 2, 3, 'col')

test('dividir e listar as abas em ordem', () => {
  const t = tree()
  expect(leaves(t)).toEqual([1, 2, 3])
  expect(hasKey(t, 3)).toBe(true)
  expect(leaves(splitLeaf(t, 1, 9, 'col', true))).toEqual([9, 1, 2, 3])
})

test('retângulos dos painéis e divisores', () => {
  const { panes, dividers } = layoutRects(tree())
  expect(panes.get(1)).toEqual({ x: 0, y: 0, w: 0.5, h: 1 })
  expect(panes.get(2)).toEqual({ x: 0.5, y: 0, w: 0.5, h: 0.5 })
  expect(panes.get(3)).toEqual({ x: 0.5, y: 0.5, w: 0.5, h: 0.5 })
  expect(dividers.map((d) => `${d.path || 'raiz'}:${d.dir}`)).toEqual(['raiz:row', 'b:col'])
  const wider = layoutRects(setRatio(tree(), '', 0.7))
  expect(wider.panes.get(2)?.x).toBeCloseTo(0.7)
  expect(layoutRects(setRatio(tree(), '', 5)).panes.get(1)?.w).toBeCloseTo(0.9)
})

test('fechar um painel sobe o irmão; o último some', () => {
  expect(leaves(removeLeaf(tree(), 2) as SplitNode)).toEqual([1, 3])
  expect(removeLeaf(tree(), 1)).toMatchObject({ type: 'split', dir: 'col' })
  expect(removeLeaf(leaf(1), 1)).toBeNull()
  const t = tree()
  expect(removeLeaf(t, 42)).toBe(t)
})

test('vizinho por direção', () => {
  const t = tree()
  expect(neighbor(t, 1, 'right')).toBe(2)
  expect(neighbor(t, 3, 'left')).toBe(1)
  expect(neighbor(t, 2, 'down')).toBe(3)
  expect(neighbor(t, 3, 'up')).toBe(2)
  expect(neighbor(t, 1, 'left')).toBeNull()
})

test('ida e volta pelo formato do disco, e os pares antigos', () => {
  const t = setRatio(tree(), 'b', 0.3)
  const ops = toOps(t)
  expect(ops).toEqual([
    { left: 1, right: 2, ratio: 0.5, dir: 'row' },
    { left: 2, right: 3, ratio: 0.3, dir: 'col' },
  ])
  expect(fromOps(ops)).toEqual([t])
  // Pares antigos: sem `dir`, cada par vira uma árvore própria.
  const old = fromOps([
    { left: 1, right: 2, ratio: 0.6 },
    { left: 3, right: 4, ratio: 0.5 },
  ])
  expect(old.map(leaves)).toEqual([
    [1, 2],
    [3, 4],
  ])
  expect(old[0]).toMatchObject({ dir: 'row', ratio: 0.6 })
})

test('divisões inválidas ficam de fora', () => {
  expect(fromOps([{ left: 1, right: 1, ratio: 0.5 }])).toEqual([])
  // `right` repetido.
  expect(
    fromOps([
      { left: 1, right: 2, ratio: 0.5 },
      { left: 3, right: 2, ratio: 0.5 },
    ]).map(leaves),
  ).toEqual([[1, 2]])
  expect(fromOps([{ left: 1, right: 2, ratio: 0.5 }], (k) => k !== 2)).toEqual([])
  const many = Array.from({ length: 12 }, (_, i) => ({ left: 1, right: i + 2, ratio: 0.5 }))
  expect(leaves(fromOps(many)[0])).toHaveLength(MAX_PANES)
})
