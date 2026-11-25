import type { SessionKind } from '../../shared/types'

/** Pedido do `termo` (linha de comando), já interpretado pelo Rust (`control.rs`). */
export type CliAction =
  | { type: 'open'; cwd: string; shell: string | null; split: boolean }
  | { type: 'run'; cwd: string; command: string; split: boolean }
  | { type: 'claude'; cwd: string; prompt: string | null }
  | { type: 'tabs'; json: boolean }
  | { type: 'send'; tab: number | null; text: string; enter: boolean }
  | { type: 'focus'; tab: number | null }
  | { type: 'close'; tab: number }

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
  title: string
  profile: string
  cwd: string | null
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
