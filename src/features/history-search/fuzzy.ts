/**
 * Busca aproximada (fuzzy) para o Ctrl+R: as letras da busca precisam aparecer em ordem no comando.
 * Pontua sequências seguidas, começo de palavra e começo do comando; desempata pela ordem de chegada
 * (a lista já vem do mais recente para o mais antigo).
 */

export interface Match {
  score: number
  /** Posições (no texto original) das letras que combinaram, para destacar. */
  positions: number[]
}

const isBoundary = (prev: string | undefined) => prev === undefined || /[\s\-_./\\:=]/.test(prev)

/** Pontua `query` contra `text`, ou `null` se as letras não aparecem em ordem. Sem diferenciar maiúsculas. */
export function fuzzyMatch(query: string, text: string): Match | null {
  const q = query.toLowerCase().replace(/\s+/g, '')
  if (!q) return { score: 0, positions: [] }
  const t = text.toLowerCase()
  if (q.length > t.length) return null

  // Uma busca contínua vale mais que qualquer outra: tenta primeiro a substring inteira.
  const at = t.indexOf(q)
  if (at >= 0) {
    const positions = Array.from({ length: q.length }, (_, i) => at + i)
    const bonus = (isBoundary(text[at - 1]) ? 30 : 0) + (at === 0 ? 20 : 0)
    return { score: 1000 + bonus - at / 4 - (t.length - q.length) / 20, positions }
  }

  // Senão, a melhor sequência em ordem, por programação dinâmica.
  const n = t.length
  const m = q.length
  const NEG = Number.NEGATIVE_INFINITY
  // best[j][i]: melhor pontuação casando q[0..j] com a letra j caindo em t[i].
  const best: number[][] = Array.from({ length: m }, () => new Array<number>(n).fill(NEG))
  const from: number[][] = Array.from({ length: m }, () => new Array<number>(n).fill(-1))
  for (let j = 0; j < m; j++) {
    // Melhor best[j-1][k] com k < i, e onde está.
    let run = NEG
    let runAt = -1
    for (let i = 0; i < n; i++) {
      if (j > 0 && i > 0 && best[j - 1][i - 1] > run) {
        run = best[j - 1][i - 1]
        runAt = i - 1
      }
      if (t[i] !== q[j]) continue
      const boundary = isBoundary(text[i - 1]) ? 8 : 0
      if (j === 0) {
        best[0][i] = boundary + (i === 0 ? 6 : 0) - i * 0.05
        continue
      }
      let score = NEG
      let pick = -1
      if (run > NEG) {
        // Com intervalo: custa o tamanho do salto.
        score = run - 1 - (i - 1 - runAt) * 0.2
        pick = runAt
      }
      // Letra colada na anterior: bônus de sequência.
      const adjacent = i > 0 ? best[j - 1][i - 1] : NEG
      if (adjacent > NEG && adjacent + 5 > score) {
        score = adjacent + 5
        pick = i - 1
      }
      if (score > NEG) {
        best[j][i] = score + boundary
        from[j][i] = pick
      }
    }
  }
  let end = -1
  let top = NEG
  for (let i = 0; i < n; i++) {
    if (best[m - 1][i] > top) {
      top = best[m - 1][i]
      end = i
    }
  }
  if (end < 0) return null
  const positions: number[] = []
  for (let j = m - 1, i = end; j >= 0; j--) {
    positions.push(i)
    i = from[j][i]
  }
  positions.reverse()
  return { score: top, positions }
}

export interface Ranked<T> {
  item: T
  match: Match
}

/** Filtra e ordena: melhor pontuação primeiro; em empate, a ordem original (mais recente primeiro). */
export function rank<T>(items: readonly T[], query: string, text: (item: T) => string, limit = 100): Ranked<T>[] {
  if (!query.trim()) return items.slice(0, limit).map((item) => ({ item, match: { score: 0, positions: [] } }))
  const out: (Ranked<T> & { i: number })[] = []
  items.forEach((item, i) => {
    const match = fuzzyMatch(query, text(item))
    if (match) out.push({ item, match, i })
  })
  out.sort((a, b) => b.match.score - a.match.score || a.i - b.i)
  return out.slice(0, limit).map(({ item, match }) => ({ item, match }))
}
