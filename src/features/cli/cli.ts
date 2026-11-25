import type { SessionKind } from '../../shared/types'

/** Pedido do `termo` (linha de comando), já interpretado pelo Rust (`control.rs`). */
export type CliAction =
  | { type: 'open'; cwd: string; shell: string | null; split: boolean }
  | { type: 'run'; cwd: string; command: string; split: boolean }
  | { type: 'claude'; cwd: string; prompt: string | null }
  | { type: 'tabs'; json: boolean }
  | { type: 'send'; tab: string | null; text: string; enter: boolean }
  | { type: 'focus'; tab: string | null }
  | { type: 'close'; tab: string }
  /** Nome da aba (`label: null` volta ao automático). Sem `tab`: a aba do terminal `pty`, ou a ativa. */
  | { type: 'title'; tab: string | null; pty: number | null; label: string | null }
  /** Nota da aba: `text` troca (ou, com `append`, junta uma linha); sem texto, mostra (ou apaga, com `clear`). */
  | { type: 'note'; tab: string | null; pty: number | null; text: string | null; append: boolean; clear: boolean }

export type CliRequest = CliAction & { id: number }

export interface CliReply {
  ok: boolean
  output: string
  error: string
}

export const ok = (output = ''): CliReply => ({ ok: true, output, error: '' })
export const fail = (error: string): CliReply => ({ ok: false, output: '', error })

export interface CliTab {
  key: number
  kind: SessionKind
  /** Nome mostrado na lateral: o dado pela pessoa/Claude ou o automático. */
  title: string
  /** Nome dado (`termo title`, renomear); `null` quando a aba usa o automático. */
  label: string | null
  profile: string
  cwd: string | null
}

const simplify = (text: string) =>
  text
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .trim()

/**
 * Aba de um `--tab`: o número (`3`, `#3`) ou o nome. Nome vale igual (sem caixa/acento) e, se nenhum
 * for igual, contido; mais de uma aba com o mesmo nome é erro, para não mandar texto à aba errada.
 */
export function resolveTab(tabs: readonly CliTab[], ref: string): { key: number } | { error: string } {
  const raw = ref.trim()
  const num = /^#?(\d+)$/.exec(raw)
  if (num) {
    const key = Number(num[1])
    return tabs.some((t) => t.key === key) ? { key } : { error: `aba ${key} não existe (veja termo tabs)` }
  }
  const q = simplify(raw)
  const names = (t: CliTab) => [t.label, t.title].filter((n): n is string => !!n).map(simplify)
  const exact = tabs.filter((t) => names(t).includes(q))
  const found = exact.length > 0 ? exact : tabs.filter((t) => names(t).some((n) => n.includes(q)))
  if (found.length === 1) return { key: found[0].key }
  if (found.length === 0) return { error: `nenhuma aba com o nome "${raw}" (veja termo tabs)` }
  return { error: `"${raw}" serve para várias abas (${found.map((t) => t.key).join(', ')}); use o número` }
}

/** Abas para o `termo tabs`: tabela legível ou JSON (`--json`). A ativa ganha `*`. */
export function formatTabs(tabs: readonly CliTab[], active: number | null, json: boolean): string {
  if (json)
    return JSON.stringify(
      tabs.map((t) => ({ ...t, active: t.key === active })),
      null,
      2,
    )
  if (tabs.length === 0) return 'nenhuma aba aberta'
  const rows = tabs.map((t) => [`${t.key === active ? '*' : ' '}${t.key}`, t.kind, t.title, t.cwd ?? ''])
  const widths = [0, 1, 2].map((i) => Math.max(...rows.map((r) => r[i].length)))
  return rows
    .map((r) =>
      r
        .map((cell, i) => (i < 3 ? cell.padEnd(widths[i]) : cell))
        .join('  ')
        .trimEnd(),
    )
    .join('\n')
}
