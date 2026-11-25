/**
 * Barra do Claude (aba do Claude Code): tipos da linha de status (src-tauri/src/usage.rs, `ClaudeLine`) e as
 * escolhas de modelo, esforço e comandos, que viram comandos de barra digitados no próprio Claude Code.
 */

export interface ClaudeLine {
  modelId: string | null
  modelName: string | null
  effort: string | null
  permissionMode: string | null
  cwd: string | null
  costUsd: number | null
  durationMs: number | null
  linesAdded: number | null
  linesRemoved: number | null
  /** Contexto usado, de 0 a 100. */
  contextPct: number | null
  contextSize: number | null
  fastMode: boolean
  updatedAt: number
}

/** Modelos do `/model` (o alias que o Claude Code aceita e o nome mostrado). */
export const MODELS = [
  // Dicas do guia de modelo e esforço: modelo maior quando o Claude "não sabia o bastante".
  { alias: 'opus', label: 'Opus', hint: 'bugs sutis, arquitetura' },
  { alias: 'sonnet', label: 'Sonnet', hint: 'o dia a dia' },
  { alias: 'haiku', label: 'Haiku', hint: 'rotina, edições exatas' },
  { alias: 'fable', label: 'Fable', hint: 'o que os outros não resolvem' },
  { alias: 'default', label: 'Padrão da conta', hint: '' },
] as const

export const EFFORTS = ['low', 'medium', 'high', 'xhigh', 'max'] as const
export type Effort = (typeof EFFORTS)[number]

export const EFFORT_LABEL: Record<Effort, string> = {
  low: 'baixo',
  medium: 'médio',
  high: 'alto',
  xhigh: 'muito alto',
  max: 'máximo',
}

/** Comandos rápidos (comandos de barra do Claude Code). */
export const QUICK_COMMANDS = [
  { command: '/compact', label: 'Compactar a conversa', hint: 'resume o que veio antes e libera contexto' },
  { command: '/clear', label: 'Limpar a conversa', hint: 'começa do zero; a antiga fica no /resume' },
  { command: '/context', label: 'Ver o contexto', hint: 'o que está ocupando o contexto' },
  { command: '/usage', label: 'Ver o uso e o custo', hint: 'custo da sessão e limites do plano' },
  { command: '/resume', label: 'Retomar outra conversa', hint: 'lista as conversas anteriores' },
] as const

/** Modo de permissão com nome em português (o Shift+Tab do Claude Code alterna entre eles). */
export const PERMISSION_LABEL: Record<string, string> = {
  default: 'pede permissão',
  acceptEdits: 'aceita edições',
  plan: 'modo plano',
  auto: 'automático',
  bypassPermissions: 'sem perguntar',
}

/** Shift+Tab no terminal (CSI Z): o Claude Code troca o modo de permissão. */
export const SHIFT_TAB = '\x1b[Z'

/** Família do modelo pelo id ou nome (`claude-opus-5-5`, `Opus 5.5`) para marcar a opção atual. */
export function modelAlias(line: Pick<ClaudeLine, 'modelId' | 'modelName'> | null): string | null {
  const text = `${line?.modelId ?? ''} ${line?.modelName ?? ''}`.toLowerCase()
  return MODELS.find((m) => m.alias !== 'default' && text.includes(m.alias))?.alias ?? null
}

/** Nome curto do modelo para o chip: o da linha de status ou "Modelo". */
export function modelLabel(line: ClaudeLine | null): string {
  return line?.modelName?.trim() || 'Modelo'
}

export function isEffort(v: string | null | undefined): v is Effort {
  return (EFFORTS as readonly string[]).includes(v ?? '')
}

/**
 * Esforço padrão do modelo, como na documentação do Claude Code (model-config): `medium` no Fable 5.2,
 * Opus 5.5, Sonnet 5.5 e Haiku 5.5; `xhigh` no Opus 4.7; `high` no Opus 5, Sonnet 5, Opus 4.8, Opus 4.6
 * e Sonnet 4.6. `null` quando o modelo não é um desses (ou não tem esforço, como o Haiku 4.5).
 */
export function defaultEffort(modelId: string | null | undefined): Effort | null {
  const id = (modelId ?? '').toLowerCase().replace(/\[.*\]$/, '')
  const is = (family: string, version: string) => new RegExp(`${family}-${version}(?![-.]?\\d)`).test(id)
  if (is('fable', '5-2') || is('opus', '5-5') || is('sonnet', '5-5') || is('haiku', '5-5')) return 'medium'
  if (is('opus', '4-7')) return 'xhigh'
  if (is('opus', '5') || is('sonnet', '5') || is('opus', '4-8') || is('opus', '4-6') || is('sonnet', '4-6'))
    return 'high'
  return null
}

/** O esforço escolhido está abaixo do padrão do modelo? É quando o guia manda subir se o Claude pulou etapas. */
export function belowDefault(effort: Effort | null, def: Effort | null): boolean {
  return effort != null && def != null && EFFORTS.indexOf(effort) < EFFORTS.indexOf(def)
}

/** "US$ 0,42". */
export function formatCost(usd: number | null): string | null {
  if (usd == null) return null
  return `US$ ${usd.toFixed(usd < 10 ? 2 : 1).replace('.', ',')}`
}

/** "42% do contexto" e o tom: cheio demais pede /compact. */
export function contextInfo(pct: number | null): { label: string; tone: 'ok' | 'warn' | 'full' } | null {
  if (pct == null) return null
  const p = Math.round(pct)
  return { label: `${p}% do contexto`, tone: p >= 85 ? 'full' : p >= 65 ? 'warn' : 'ok' }
}

/** O Claude está no meio de uma resposta: comandos de barra esperam ele terminar. */
export function isBusy(state: string | null | undefined): boolean {
  return state === 'thinking' || state === 'working' || state === 'blocked'
}

/** Imagens que o Claude Code abre como imagem (o resto ele lê como texto ou PDF). */
export const IMAGE_EXTENSIONS = ['png', 'jpg', 'jpeg', 'gif', 'webp'] as const

/** Filtros do seletor de anexos: tudo primeiro (o Claude lê qualquer texto), depois atalhos por tipo. */
export const ATTACH_FILTERS = [
  { name: 'Todos os arquivos', extensions: ['*'] },
  { name: 'Imagens', extensions: [...IMAGE_EXTENSIONS] },
  { name: 'PDF', extensions: ['pdf'] },
  { name: 'Notebooks', extensions: ['ipynb'] },
]

const normSlashes = (p: string) => p.replace(/\\/g, '/')

/**
 * Caminho como o Claude Code entende numa menção: relativo à pasta da sessão quando o arquivo está dentro
 * dela, absoluto (com `/`) quando não.
 */
export function mentionPath(path: string, cwd: string | null): string {
  const file = normSlashes(path)
  if (!cwd) return file
  const base = normSlashes(cwd).replace(/\/+$/, '')
  if (file.toLowerCase().startsWith(`${base.toLowerCase()}/`)) return file.slice(base.length + 1)
  return file
}

/** `@arquivo` para cada anexo (entre aspas quando tem espaço), separados por espaço e com um espaço no fim. */
export function attachmentText(paths: readonly string[], cwd: string | null): string {
  const mentions = paths
    .filter((p) => p.trim())
    .map((p) => {
      const rel = mentionPath(p, cwd)
      return /[\s"']/.test(rel) ? `@"${rel.replace(/"/g, '')}"` : `@${rel}`
    })
  return mentions.length ? `${mentions.join(' ')} ` : ''
}
