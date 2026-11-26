/**
 * Tela dividida em árvore (como no Windows Terminal, no WezTerm e no tmux): cada divisão parte um espaço
 * em dois, lado a lado (`row`) ou um em cima do outro (`col`), e cada lado pode ser dividido de novo.
 * As folhas são abas. Funções puras; o estado fica em `tabs.ts`.
 *
 * Para o disco e para os layouts salvos, a árvore vira uma lista de divisões `{ left, right, ratio, dir }`:
 * "divida o painel `left`, pondo `right` depois dele". É o mesmo formato dos pares antigos (sem `dir`, que
 * vale `row`), então sessões e layouts de antes continuam abrindo.
 */

export type SplitDir = 'row' | 'col'

export type SplitNode =
  | { type: 'leaf'; key: number }
  | { type: 'split'; dir: SplitDir; ratio: number; a: SplitNode; b: SplitNode }

/** Um conjunto de abas mostradas juntas no cartão. */
export interface SplitLayout {
  root: SplitNode
  /** A aba ativa ocupa o cartão sozinha, sem desfazer a divisão. Não vai para o disco. */
  zoomed?: boolean
}

/** Uma divisão no formato do disco (chaves ou índices, conforme quem usa). */
export interface SplitOp {
  left: number
  right: number
  ratio: number
  dir?: SplitDir
}

/** Retângulo em frações do cartão (0 a 1). */
export interface Rect {
  x: number
  y: number
  w: number
  h: number
}

/** Mais painéis que isso num cartão ficam pequenos demais para um terminal. */
export const MAX_PANES = 8
export const clampRatio = (r: number) => (Number.isFinite(r) ? Math.min(0.9, Math.max(0.1, r)) : 0.5)

export const leaf = (key: number): SplitNode => ({ type: 'leaf', key })

export function leaves(node: SplitNode): number[] {
  return node.type === 'leaf' ? [node.key] : [...leaves(node.a), ...leaves(node.b)]
}

export const hasKey = (node: SplitNode, key: number): boolean =>
  node.type === 'leaf' ? node.key === key : hasKey(node.a, key) || hasKey(node.b, key)

/** Troca a folha `key` por uma divisão entre ela e `added` (depois dela, ou antes com `before`). */
export function splitLeaf(node: SplitNode, key: number, added: number, dir: SplitDir, before = false): SplitNode {
  if (node.type === 'leaf') {
    if (node.key !== key) return node
    const [a, b] = before ? [leaf(added), node] : [node, leaf(added)]
    return { type: 'split', dir, ratio: 0.5, a, b }
  }
  return { ...node, a: splitLeaf(node.a, key, added, dir, before), b: splitLeaf(node.b, key, added, dir, before) }
}

/** Tira a folha `key`; o irmão dela sobe para o lugar do pai. `null` se a árvore ficou vazia. */
export function removeLeaf(node: SplitNode, key: number): SplitNode | null {
  if (node.type === 'leaf') return node.key === key ? null : node
  const a = removeLeaf(node.a, key)
  const b = removeLeaf(node.b, key)
  if (!a) return b
  if (!b) return a
  return a === node.a && b === node.b ? node : { ...node, a, b }
}

/** Caminho de uma divisão: `''` a raiz, `'a'`/`'b'` os filhos e assim por diante. */
export function setRatio(node: SplitNode, path: string, ratio: number): SplitNode {
  if (node.type === 'leaf') return node
  if (path === '') return { ...node, ratio: clampRatio(ratio) }
  const [head, rest] = [path[0], path.slice(1)]
  return head === 'a' ? { ...node, a: setRatio(node.a, rest, ratio) } : { ...node, b: setRatio(node.b, rest, ratio) }
}

export interface Divider {
  path: string
  dir: SplitDir
  ratio: number
  /** Espaço da divisão inteira (o divisor fica em `ratio` dele). */
  rect: Rect
}

/** Onde cada aba fica no cartão e onde ficam os divisores. */
export function layoutRects(root: SplitNode): { panes: Map<number, Rect>; dividers: Divider[] } {
  const panes = new Map<number, Rect>()
  const dividers: Divider[] = []
  const walk = (node: SplitNode, rect: Rect, path: string) => {
    if (node.type === 'leaf') {
      panes.set(node.key, rect)
      return
    }
    dividers.push({ path, dir: node.dir, ratio: node.ratio, rect })
    if (node.dir === 'row') {
      const wa = rect.w * node.ratio
      walk(node.a, { ...rect, w: wa }, `${path}a`)
      walk(node.b, { ...rect, x: rect.x + wa, w: rect.w - wa }, `${path}b`)
    } else {
      const ha = rect.h * node.ratio
      walk(node.a, { ...rect, h: ha }, `${path}a`)
      walk(node.b, { ...rect, y: rect.y + ha, h: rect.h - ha }, `${path}b`)
    }
  }
  walk(root, { x: 0, y: 0, w: 1, h: 1 }, '')
  return { panes, dividers }
}

export type Direction = 'left' | 'right' | 'up' | 'down'

/**
 * Painel vizinho na direção (Alt+setas): entre os que encostam no lado do painel atual, o que mais se
 * sobrepõe a ele. `null` se não houver nenhum.
 */
export function neighbor(root: SplitNode, key: number, dir: Direction): number | null {
  const { panes } = layoutRects(root)
  const from = panes.get(key)
  if (!from) return null
  const eps = 1e-6
  let best: { key: number; overlap: number } | null = null
  for (const [k, r] of panes) {
    if (k === key) continue
    const touches =
      dir === 'left'
        ? Math.abs(r.x + r.w - from.x) < eps
        : dir === 'right'
          ? Math.abs(from.x + from.w - r.x) < eps
          : dir === 'up'
            ? Math.abs(r.y + r.h - from.y) < eps
            : Math.abs(from.y + from.h - r.y) < eps
    if (!touches) continue
    const horizontal = dir === 'left' || dir === 'right'
    const overlap = horizontal
      ? Math.min(from.y + from.h, r.y + r.h) - Math.max(from.y, r.y)
      : Math.min(from.x + from.w, r.x + r.w) - Math.max(from.x, r.x)
    if (overlap > eps && (!best || overlap > best.overlap)) best = { key: k, overlap }
  }
  return best?.key ?? null
}

const firstLeaf = (node: SplitNode): number => (node.type === 'leaf' ? node.key : firstLeaf(node.a))

/** A árvore como lista de divisões (pré-ordem): aplicar em ordem com `fromOps` refaz a mesma árvore. */
export function toOps(root: SplitNode): SplitOp[] {
  if (root.type === 'leaf') return []
  return [
    { left: firstLeaf(root.a), right: firstLeaf(root.b), ratio: root.ratio, dir: root.dir },
    ...toOps(root.a),
    ...toOps(root.b),
  ]
}

/**
 * Refaz as árvores a partir das divisões. Divisões inválidas (mesma aba dos dois lados, `right` que já
 * apareceu, árvore cheia) ficam de fora; `left` novo começa uma árvore nova.
 */
export function fromOps(ops: readonly SplitOp[], isKey: (k: number) => boolean = () => true): SplitNode[] {
  const roots: SplitNode[] = []
  const seen = new Set<number>()
  for (const op of ops) {
    const { left, right } = op
    if (left === right || !isKey(left) || !isKey(right) || seen.has(right)) continue
    const dir: SplitDir = op.dir === 'col' ? 'col' : 'row'
    const at = roots.findIndex((r) => hasKey(r, left))
    if (at === -1) {
      roots.push({ type: 'split', dir, ratio: clampRatio(op.ratio), a: leaf(left), b: leaf(right) })
    } else {
      if (leaves(roots[at]).length >= MAX_PANES) continue
      roots[at] = withRatioAt(splitLeaf(roots[at], left, right, dir), left, right, clampRatio(op.ratio))
    }
    seen.add(left)
    seen.add(right)
  }
  return roots
}

/** Põe a proporção na divisão recém-criada entre `a` e `b` (a que tem as duas folhas como filhos diretos). */
function withRatioAt(node: SplitNode, a: number, b: number, ratio: number): SplitNode {
  if (node.type === 'leaf') return node
  if (node.a.type === 'leaf' && node.b.type === 'leaf' && node.a.key === a && node.b.key === b)
    return { ...node, ratio }
  return { ...node, a: withRatioAt(node.a, a, b, ratio), b: withRatioAt(node.b, a, b, ratio) }
}
