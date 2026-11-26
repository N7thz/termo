/**
 * Reconhecimento de trechos na saída do terminal. Funções puras: recebem o texto de uma linha
 * e devolvem posições (colunas, fim exclusivo) — o TerminalView transforma isso em links e marcas.
 */

export type LinkKind = 'file' | 'hash' | 'address' | 'ip'

export interface TextMatch {
  kind: LinkKind
  start: number
  end: number
  text: string
  /** Para `file`: caminho sem a posição, e linha/coluna se vieram junto. */
  path?: string
  line?: number
  column?: number
}

export type Severity = 'error' | 'warning'

// Extensões comuns de código/config; exigir extensão evita casar palavras soltas como "a/b".
const EXT =
  'tsx?|jsx?|mjs|cjs|json|jsonc|rs|toml|py|go|java|kt|cs|cpp|cc|c|h|hpp|rb|php|swift|css|scss|html|vue|svelte|md|mdx|ya?ml|sql|sh|ps1|psm1|lock|env|txt|log|prisma|graphql|astro|xml|ini|cfg|conf|dockerfile|gradle|lua|zig|dart|ex|exs|erl|hs|ml|scala|clj|r|pl'

/**
 * Caminhos com extensão, opcionalmente com posição:
 * `src/App.tsx:42:10`, `C:\proj\main.rs:7`, `./a/b.ts(12,5)`, `../x.json`, `D:/x/y.md`.
 */
const FILE_RE = new RegExp(
  String.raw`(?<![\w/\\.@-])((?:[A-Za-z]:[\\/]|\.{1,2}[\\/]|[\\/])?(?:[\w@.+-]+[\\/])*[\w@.+-]*\.(?:${EXT}))(?:(?::(\d+))(?::(\d+))?|\((\d+),(\d+)\))?(?![\w])`,
  'gi',
)

// Hash do git: 7 a 40 hex, com pelo menos uma letra e um dígito (não casa números nem palavras).
const HASH_RE = /(?<![\w-])(?=[0-9a-f]*[a-f])(?=[0-9a-f]*\d)[0-9a-f]{7,40}(?![\w-])/g

// Endereço com porta: localhost:1420, 127.0.0.1:4747, 0.0.0.0:3000, [::1]:8080.
const ADDRESS_RE = /(?<![\w./:-])((?:localhost|\d{1,3}(?:\.\d{1,3}){3}|\[::1\]):\d{2,5})(?![\w:])/g

// IPv4 solto (sem porta).
const IP_RE = /(?<![\w.:-])((?:25[0-5]|2[0-4]\d|1?\d?\d)(?:\.(?:25[0-5]|2[0-4]\d|1?\d?\d)){3})(?![\w.:])/g

function overlaps(a: TextMatch, list: TextMatch[]) {
  return list.some((b) => a.start < b.end && b.start < a.end)
}

/** Links da linha: arquivos, endereços com porta, IPs e hashes (nesta prioridade, sem sobreposição). */
export function findLinks(line: string): TextMatch[] {
  const found: TextMatch[] = []

  for (const m of line.matchAll(FILE_RE)) {
    const [text, path, l1, c1, l2, c2] = m
    // URLs são tratadas pelo addon de links da web.
    if (/^[a-z]+:\/\//i.test(line.slice(Math.max(0, m.index - 10), m.index + text.length)) && !/^[A-Za-z]:/.test(path))
      continue
    const lineNo = Number(l1 ?? l2) || undefined
    const col = Number(c1 ?? c2) || undefined
    found.push({ kind: 'file', start: m.index, end: m.index + text.length, text, path, line: lineNo, column: col })
  }

  const add = (re: RegExp, kind: LinkKind) => {
    for (const m of line.matchAll(re)) {
      const match: TextMatch = { kind, start: m.index, end: m.index + m[0].length, text: m[0] }
      if (!overlaps(match, found) && !insideUrl(line, match)) found.push(match)
    }
  }
  add(ADDRESS_RE, 'address')
  add(IP_RE, 'ip')
  add(HASH_RE, 'hash')

  return found.sort((a, b) => a.start - b.start)
}

/** Trecho que faz parte de uma URL (http://...) — o addon de links já cuida dela. */
function insideUrl(line: string, m: TextMatch) {
  for (const u of line.matchAll(/https?:\/\/\S+/g)) {
    if (m.start >= u.index && m.end <= u.index + u[0].length) return true
  }
  return false
}

const ERROR_RE =
  /(?<![\w-])(error|errors|erro|erros|failed|failure|fail|panicked|panic|exception|fatal|traceback)(?![\w-])|[✖✗✘×]|\bERR!/i
const WARNING_RE = /(?<![\w-])(warn|warning|warnings|aviso|avisos|deprecated|obsoleto)(?![\w-])|⚠/i
/** "0 errors", "no errors", "sem erros", "error: 0" — resumo sem problema. */
const ZERO_RE =
  /(?<![\w.])(0|no|zero|sem|nenhum)\s+(errors?|erros?|warnings?|avisos?|failures?|failed|fail)\b|\b(errors?|warnings?|failed|fail)\s*[:=]\s*0\b/i

/**
 * Classifica a linha. Linhas que só falam de "0 erros" não contam; quando uma linha tem
 * erro e aviso, vale o erro.
 */
export function classifyLine(line: string): Severity | null {
  const text = line.trim()
  if (!text) return null
  const cleaned = text.replace(new RegExp(ZERO_RE.source, 'gi'), '')
  if (ERROR_RE.test(cleaned)) return 'error'
  if (WARNING_RE.test(cleaned)) return 'warning'
  return null
}

export interface CustomRule {
  pattern: string
  color: string
  notify?: boolean
  mark?: boolean
}

export interface CompiledRule {
  re: RegExp
  color: string
  /** O padrão como foi escrito (aparece no aviso do gatilho). */
  pattern: string
  notify: boolean
  mark: boolean
}

/** Regra que disparou numa linha (gatilho): o que fazer e a linha inteira. */
export interface TriggerHit {
  pattern: string
  notify: boolean
  mark: boolean
  line: string
}

/** Compila as regras do usuário; padrões inválidos são ignorados (não quebram o terminal). */
export function compileRules(rules: readonly CustomRule[]): CompiledRule[] {
  const out: CompiledRule[] = []
  for (const r of rules) {
    if (!r.pattern || r.pattern.length > 200 || !/^#[0-9a-f]{6}$/i.test(r.color)) continue
    try {
      out.push({
        re: new RegExp(r.pattern, 'gi'),
        color: r.color,
        pattern: r.pattern,
        notify: r.notify === true,
        mark: r.mark === true,
      })
    } catch {
      // regex inválida: ignora
    }
  }
  return out
}

/** Gatilhos da linha: cada regra com avisar ou marcar que casa com ela (mesmo se outra regra pintou o trecho). */
export function findTriggers(line: string, rules: readonly CompiledRule[]): TriggerHit[] {
  const out: TriggerHit[] = []
  for (const r of rules) {
    if (!r.notify && !r.mark) continue
    r.re.lastIndex = 0
    const hit = r.re.test(line)
    r.re.lastIndex = 0
    if (hit) out.push({ pattern: r.pattern, notify: r.notify, mark: r.mark, line: line.trim() })
  }
  return out
}

/** Um disparo por regra a cada `TRIGGER_INTERVAL_MS` por aba: saída em laço não inunda a central. */
export const TRIGGER_INTERVAL_MS = 5000

export function triggerGate(now: () => number = Date.now) {
  const last = new Map<string, number>()
  return (pattern: string) => {
    const t = now()
    const prev = last.get(pattern)
    if (prev != null && t - prev < TRIGGER_INTERVAL_MS) return false
    last.set(pattern, t)
    return true
  }
}

/** Trechos da linha que casam com as regras próprias (sem sobreposição, a primeira regra vence). */
export function findCustom(line: string, rules: readonly CompiledRule[]) {
  const out: { start: number; end: number; color: string }[] = []
  for (const { re, color } of rules) {
    re.lastIndex = 0
    for (const m of line.matchAll(re)) {
      if (!m[0]) continue
      const hit = { start: m.index, end: m.index + m[0].length, color }
      if (!out.some((o) => hit.start < o.end && o.start < hit.end)) out.push(hit)
      if (out.length > 50) return out
    }
  }
  return out
}

export function isValidRulePattern(pattern: string) {
  if (!pattern || pattern.length > 200) return false
  try {
    new RegExp(pattern)
    return true
  } catch {
    return false
  }
}

export type TokenKind = 'level-error' | 'level-warning' | 'level-info' | 'level-debug' | 'timestamp' | 'uuid'

export interface TokenMatch {
  kind: TokenKind
  start: number
  end: number
}

export interface TokenToggles {
  logLevels: boolean
  timestamps: boolean
  uuids: boolean
}

// Nível de log em maiúsculas (INFO, WARN...) ou entre colchetes em qualquer caixa ([info], [Error]).
// Exigir maiúsculas fora dos colchetes evita colorir "info" e "error" no meio de frases.
const LEVEL_RE =
  /(?<![\w-])(?:\[(fatal|crit(?:ical)?|error|err|warn(?:ing)?|info|notice|debug|trace)\]|(FATAL|CRIT(?:ICAL)?|ERROR|ERR|WARN(?:ING)?|INFO|NOTICE|DEBUG|TRACE))(?![\w-])/gi

const LEVEL_KIND: Record<string, TokenKind> = {
  fatal: 'level-error',
  crit: 'level-error',
  critical: 'level-error',
  error: 'level-error',
  err: 'level-error',
  warn: 'level-warning',
  warning: 'level-warning',
  info: 'level-info',
  notice: 'level-info',
  debug: 'level-debug',
  trace: 'level-debug',
}

// ISO 8601 (2026-11-22T14:05:09.123Z, 2026-11-22 14:05), data dd/mm/aaaa e hora solta (14:05:09).
const TIMESTAMP_RE =
  /(?<![\w:.-])(?:\d{4}-\d{2}-\d{2}(?:[T ]\d{2}:\d{2}(?::\d{2}(?:[.,]\d+)?)?(?:Z|[+-]\d{2}:?\d{2})?)?|\d{2}\/\d{2}\/\d{4}(?: \d{2}:\d{2}(?::\d{2})?)?|\d{2}:\d{2}:\d{2}(?:[.,]\d+)?)(?![\w:])/g

const UUID_RE = /(?<![\w-])[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}(?![\w-])/gi

/** Níveis de log, datas/horas e UUIDs da linha, sem sobreposição (nesta prioridade). */
export function findTokens(line: string, on: TokenToggles): TokenMatch[] {
  const out: TokenMatch[] = []
  const push = (m: TokenMatch) => {
    if (!out.some((o) => m.start < o.end && o.start < m.end)) out.push(m)
  }
  if (on.logLevels) {
    for (const m of line.matchAll(LEVEL_RE)) {
      // Fora dos colchetes, só vale em maiúsculas (a flag `i` é para o caso entre colchetes).
      if (m[2] && m[2] !== m[2].toUpperCase()) continue
      const word = (m[1] ?? m[2]).toLowerCase()
      push({ kind: LEVEL_KIND[word], start: m.index, end: m.index + m[0].length })
    }
  }
  if (on.timestamps) {
    for (const m of line.matchAll(TIMESTAMP_RE)) push({ kind: 'timestamp', start: m.index, end: m.index + m[0].length })
  }
  if (on.uuids) {
    for (const m of line.matchAll(UUID_RE)) push({ kind: 'uuid', start: m.index, end: m.index + m[0].length })
  }
  return out.sort((a, b) => a.start - b.start).slice(0, 50)
}

export type DiffKind = 'added' | 'removed' | 'hunk'

/**
 * Linha de diff unificado (git diff, patch). `inDiff` diz se a saída está dentro de um diff:
 * fora dele, "- item" de uma lista não vira linha removida. Devolve o tipo e se o diff continua.
 */
export function diffLine(line: string, inDiff: boolean): { kind: DiffKind | null; inDiff: boolean } {
  if (/^(diff --git |index [0-9a-f]+\.\.|--- (a\/|\/dev\/null)|\+\+\+ (b\/|\/dev\/null))/.test(line)) {
    return { kind: null, inDiff: true }
  }
  if (/^@@ -\d+(,\d+)? \+\d+(,\d+)? @@/.test(line)) return { kind: 'hunk', inDiff: true }
  if (!inDiff) return { kind: null, inDiff: false }
  if (line.startsWith('+')) return { kind: 'added', inDiff: true }
  if (line.startsWith('-')) return { kind: 'removed', inDiff: true }
  // Contexto do diff começa com espaço; qualquer outra coisa encerra o diff.
  if (line.startsWith(' ') || line.startsWith(' No newline')) return { kind: null, inDiff: true }
  return { kind: null, inDiff: false }
}
