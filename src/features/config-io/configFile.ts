/**
 * Regras da importação do arquivo de configurações (`termo-config.json`, gravado em
 * src-tauri/src/config_io.rs): em que seções o arquivo se divide, o que cada uma muda e o patch que
 * vai para `settings_set`, que valida tudo no Rust.
 *
 * Importar nunca apaga o que você já tem nas listas: perfis (pelo id), workflows e layouts (pelo nome)
 * do arquivo substituem os de mesmo nome e os novos entram no fim. Pastas e imagens que não existem
 * nesta máquina podem ficar de fora.
 */
import type { Profile, SavedLayout, Settings, Workflow } from '../../shared/types'

/** O que `config_import_read` devolve. */
export interface ImportFile {
  path: string
  /** As configurações do arquivo, só com as chaves que ele tem (o formato não é confiável). */
  settings: Record<string, unknown>
  /** Versão do Termo que exportou; vazio no `settings.json` cru. */
  appVersion: string
  /** ISO 8601; vazio no `settings.json` cru. */
  exportedAt: string
  /** Pastas e imagens citadas no arquivo que não existem nesta máquina. */
  missing: string[]
}

export type SectionId =
  | 'appearance'
  | 'terminal'
  | 'background'
  | 'highlights'
  | 'profiles'
  | 'workflows'
  | 'layouts'
  | 'system'

export interface Section {
  id: SectionId
  label: string
  keys: (keyof Settings)[]
}

export const SECTIONS: Section[] = [
  {
    id: 'appearance',
    label: 'Aparência',
    keys: ['theme', 'fontFamily', 'fontSize', 'interfaceSize', 'layout', 'minimumContrast', 'dimInactivePane'],
  },
  {
    id: 'terminal',
    label: 'Terminal e abertura',
    keys: [
      'defaultShell',
      'defaultCwd',
      'shellPredictions',
      'inputEditor',
      'historySearch',
      'linkTarget',
      'startWithClaude',
      'restoreSession',
      'restoreOutput',
      'oscClipboard',
      'oscNotifications',
    ],
  },
  { id: 'background', label: 'Imagem de fundo', keys: ['background'] },
  { id: 'highlights', label: 'Destaques', keys: ['highlights'] },
  { id: 'profiles', label: 'Perfis', keys: ['profiles'] },
  { id: 'workflows', label: 'Workflows', keys: ['workflows'] },
  { id: 'layouts', label: 'Layouts salvos', keys: ['layouts'] },
  { id: 'system', label: 'Avisos e sistema', keys: ['notifications', 'globalHotkey', 'tray', 'autoUpdate'] },
]

/** Chaves que são objetos: o do arquivo vai por cima do atual (arquivo antigo sem um campo novo não o zera). */
const OBJECT_KEYS = new Set<keyof Settings>(['layout', 'highlights', 'notifications', 'tray', 'background'])

export interface SectionPreview {
  id: SectionId
  label: string
  /** O patch desta seção (só as chaves que mudam). */
  patch: Partial<Settings>
  /** Resumo do que muda, para a lista do diálogo. */
  summary: string
}

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b)
const sameName = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase()
const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`

/** Junta as listas: o item do arquivo substitui o de mesma chave; os novos entram no fim. */
function mergeList<T>(
  current: T[],
  incoming: T[],
  sameItem: (a: T, b: T) => boolean,
): { list: T[]; added: number; replaced: number } {
  const list = [...current]
  let added = 0
  let replaced = 0
  for (const item of incoming) {
    const at = list.findIndex((c) => sameItem(c, item))
    if (at === -1) {
      list.push(item)
      added++
    } else if (!same(list[at], item)) {
      list[at] = item
      replaced++
    }
  }
  return { list, added, replaced }
}

/** Itens de uma lista do arquivo que têm a forma mínima esperada (o resto o Rust valida). */
function listOf<T>(value: unknown, valid: (item: Record<string, unknown>) => boolean): T[] | null {
  if (!Array.isArray(value)) return null
  return value.filter((item) => isObject(item) && valid(item)) as T[]
}

const hasText = (item: Record<string, unknown>, key: string) =>
  typeof item[key] === 'string' && (item[key] as string).trim() !== ''

function listSummary(added: number, replaced: number, noun: [string, string]) {
  const parts: string[] = []
  if (added) parts.push(`${plural(added, noun[0], noun[1])} ${added === 1 ? 'novo' : 'novos'}`)
  if (replaced) parts.push(`${plural(replaced, 'atualizado', 'atualizados')}`)
  return parts.join(', ')
}

/**
 * O que cada seção do arquivo muda nas configurações atuais. Seções que o arquivo não tem ficam de fora;
 * as que ele tem mas não mudam nada vêm com o patch vazio.
 */
export function previewImport(file: ImportFile, current: Settings, dropMissing: boolean): SectionPreview[] {
  const src = file.settings
  const missing = new Set(dropMissing ? file.missing.map((p) => p.trim()) : [])
  const keep = (path: unknown) => typeof path === 'string' && !missing.has(path.trim())
  const out: SectionPreview[] = []

  for (const section of SECTIONS) {
    const present = section.keys.filter((k) => k in src)
    if (present.length === 0) continue
    const patch: Partial<Settings> = {}
    let summary = ''

    if (section.id === 'profiles') {
      const incoming = listOf<Profile>(src.profiles, (p) => hasText(p, 'id') && hasText(p, 'name'))
      if (incoming) {
        const cleaned = incoming.map((p) => ({
          ...p,
          cwd: keep(p.cwd) ? p.cwd : '',
          pinned: Array.isArray(p.pinned) ? p.pinned.filter(keep) : [],
        }))
        const r = mergeList(current.profiles, cleaned, (a, b) => a.id === b.id)
        if (r.added || r.replaced) patch.profiles = r.list
        summary = listSummary(r.added, r.replaced, ['perfil', 'perfis'])
      }
    } else if (section.id === 'workflows') {
      const incoming = listOf<Workflow>(src.workflows, (w) => hasText(w, 'name') && hasText(w, 'command'))
      if (incoming) {
        const r = mergeList(current.workflows, incoming, (a, b) => sameName(a.name, b.name))
        if (r.added || r.replaced) patch.workflows = r.list
        summary = listSummary(r.added, r.replaced, ['workflow', 'workflows'])
      }
    } else if (section.id === 'layouts') {
      const incoming = listOf<SavedLayout>(src.layouts, (l) => hasText(l, 'name') && Array.isArray(l.tabs))
      if (incoming) {
        const cleaned = incoming.map((l) => ({
          ...l,
          tabs: l.tabs.map((t) => (isObject(t) && !keep(t.cwd) ? { ...t, cwd: '' } : t)),
        }))
        const r = mergeList(current.layouts, cleaned, (a, b) => sameName(a.name, b.name))
        if (r.added || r.replaced) patch.layouts = r.list
        summary = listSummary(r.added, r.replaced, ['layout', 'layouts'])
      }
    } else {
      for (const key of present) {
        let value: unknown = src[key]
        if (OBJECT_KEYS.has(key)) {
          if (!isObject(value)) continue
          value = { ...(current[key] as object), ...value }
          if (key === 'background') {
            const bg = value as Settings['background']
            value = { ...bg, images: Array.isArray(bg.images) ? bg.images.filter(keep) : [] }
          }
        }
        if (key === 'defaultCwd' && !keep(value)) continue
        if (!same(value, current[key])) (patch as Record<string, unknown>)[key] = value
      }
      const n = Object.keys(patch).length
      summary = n ? plural(n, 'mudança', 'mudanças') : ''
    }
    out.push({ id: section.id, label: section.label, patch, summary: summary || 'Igual ao atual' })
  }
  return out
}

/** O patch das seções escolhidas, numa chamada só a `settings_set`. */
export function patchFor(previews: SectionPreview[], chosen: ReadonlySet<SectionId>): Partial<Settings> {
  return Object.assign({}, ...previews.filter((p) => chosen.has(p.id)).map((p) => p.patch))
}

export function isEmptyPatch(patch: Partial<Settings>) {
  return Object.keys(patch).length === 0
}

/** "26/11/2026 18:40" a partir do ISO do arquivo; vazio se não der para ler. */
export function formatExportedAt(iso: string): string {
  const d = new Date(iso)
  if (!iso || Number.isNaN(d.getTime())) return ''
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

export interface CliImportPlan {
  patch: Partial<Settings>
  /** Texto para o terminal: o arquivo, o que muda por seção e o que fica de fora. */
  report: string
}

/**
 * `termo config import`: as mesmas regras da tela, sem perguntas. `sections` vazio = todas as que mudam;
 * `keepMissing` mantém pastas e imagens que não existem nesta máquina.
 */
export function planCliImport(
  file: ImportFile,
  current: Settings,
  opts: { sections: readonly string[]; keepMissing: boolean },
): CliImportPlan {
  const previews = previewImport(file, current, !opts.keepMissing)
  const wanted = (id: SectionId) => opts.sections.length === 0 || opts.sections.includes(id)
  const chosen = new Set(previews.filter((p) => wanted(p.id) && !isEmptyPatch(p.patch)).map((p) => p.id))
  const when = formatExportedAt(file.exportedAt)
  const from = [when && `exportado em ${when}`, file.appVersion && `Termo ${file.appVersion}`].filter(Boolean)
  const lines = [from.length ? `${file.path} (${from.join(' · ')})` : file.path]
  const width = Math.max(0, ...previews.map((p) => p.label.length))
  for (const p of previews) {
    const note = wanted(p.id) ? p.summary : 'fora do --only'
    lines.push(`  ${chosen.has(p.id) ? '+' : ' '} ${p.label.padEnd(width)}  ${note}`)
  }
  if (previews.length === 0) lines.push('  o arquivo não tem nenhuma configuração conhecida')
  if (file.missing.length > 0) {
    const n = file.missing.length
    const what = n === 1 ? '1 pasta ou imagem não existe' : `${n} pastas e imagens não existem`
    lines.push(
      opts.keepMissing
        ? `${what} nesta máquina e foram mantidas (--keep-missing)`
        : `${what} nesta máquina e ficaram de fora (--keep-missing mantém)`,
    )
  }
  return { patch: patchFor(previews, chosen), report: lines.join('\n') }
}
