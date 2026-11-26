/**
 * Esquemas de cores de outros terminais → `TerminalScheme` do Termo (o mesmo formato do Windows
 * Terminal, que `themeFromScheme` transforma no tema inteiro). Formatos aceitos, detectados pelo conteúdo:
 *
 * - Windows Terminal: um esquema JSON, uma lista deles ou um `settings.json` com `"schemes"`;
 * - iTerm2: `.itermcolors` (plist XML, componentes de 0 a 1);
 * - Ghostty: tema `chave = valor`, com `palette = N=#cor`;
 * - Alacritty: TOML com `[colors.primary]`, `[colors.normal]` e `[colors.bright]`;
 * - kitty: `chave valor`, com `color0`…`color15`.
 *
 * Tudo puro: o arquivo é lido no Rust (src-tauri/src/theme_import.rs) e o texto chega aqui.
 */
import type { TerminalScheme } from './derive'

export const ANSI = [
  'black',
  'red',
  'green',
  'yellow',
  'blue',
  'magenta',
  'cyan',
  'white',
  'brightBlack',
  'brightRed',
  'brightGreen',
  'brightYellow',
  'brightBlue',
  'brightMagenta',
  'brightCyan',
  'brightWhite',
] as const

type Colors = Partial<Record<(typeof ANSI)[number] | 'background' | 'foreground' | 'cursor' | 'selection', string>>

/** Prefixo dos ids dos temas importados (os outros temas nunca começam assim). */
export const CUSTOM_PREFIX = 'custom-'
export const MAX_CUSTOM_THEMES = 50

/** `#rgb`, `#rrggbb(aa)`, `rgb:rr/gg/bb` (X11), `0xRRGGBB` e `RRGGBB` → `#rrggbb`; `null` se não for cor. */
export function normalizeColor(raw: string | undefined | null): string | null {
  if (raw == null) return null
  const v = raw.trim().replace(/^['"]|['"]$/g, '')
  let m = /^#?([0-9a-f]{6})([0-9a-f]{2})?$/i.exec(v) ?? /^0x([0-9a-f]{6})$/i.exec(v)
  if (m) return `#${m[1].toLowerCase()}`
  m = /^#([0-9a-f])([0-9a-f])([0-9a-f])$/i.exec(v)
  if (m) return `#${m[1]}${m[1]}${m[2]}${m[2]}${m[3]}${m[3]}`.toLowerCase()
  m = /^rgb:([0-9a-f]{1,4})\/([0-9a-f]{1,4})\/([0-9a-f]{1,4})$/i.exec(v)
  if (m) {
    const part = (h: string) =>
      Math.round((Number.parseInt(h, 16) / (16 ** h.length - 1)) * 255)
        .toString(16)
        .padStart(2, '0')
    return `#${part(m[1])}${part(m[2])}${part(m[3])}`
  }
  return null
}

/** "dracula_pro.itermcolors" → "Dracula Pro". */
export function nameFromFile(file: string): string {
  const stem = file
    .replace(/^.*[\\/]/, '')
    .replace(/\.[^.]+$/, '')
    .replace(/[-_.]+/g, ' ')
    .trim()
  const name = stem.replace(/\b\p{L}/gu, (c) => c.toUpperCase())
  return (name || 'Tema importado').slice(0, 60)
}

const slug = (name: string) =>
  name
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 30) || 'tema'

/** Monta o esquema completo; erro em português se faltar fundo, texto ou alguma das 16 cores. */
function toScheme(c: Colors, name: string, source: string): TerminalScheme {
  const missing = (['background', 'foreground', ...ANSI] as const).filter((k) => !c[k])
  if (missing.length > 0) {
    throw new Error(
      `"${name}" não tem todas as cores de terminal (faltam ${missing.length}: ${missing.slice(0, 4).join(', ')}${missing.length > 4 ? '…' : ''})`,
    )
  }
  const color = (k: keyof Colors) => c[k] as string
  return {
    id: `${CUSTOM_PREFIX}${slug(name)}`,
    name: name.slice(0, 60),
    author: '',
    source,
    background: color('background'),
    foreground: color('foreground'),
    cursor: c.cursor ?? color('foreground'),
    selection: c.selection ?? null,
    ...(Object.fromEntries(ANSI.map((k) => [k, color(k)])) as Record<(typeof ANSI)[number], string>),
  }
}

// ---- Windows Terminal ----

function fromWindowsTerminal(data: unknown, fallbackName: string): TerminalScheme[] {
  const list: unknown[] = Array.isArray(data)
    ? data
    : data && typeof data === 'object' && Array.isArray((data as { schemes?: unknown }).schemes)
      ? (data as { schemes: unknown[] }).schemes
      : [data]
  const out: TerminalScheme[] = []
  for (const item of list) {
    if (!item || typeof item !== 'object') continue
    const o = item as Record<string, unknown>
    const c: Colors = {}
    for (const k of ['background', 'foreground', ...ANSI] as const) {
      const v = normalizeColor(typeof o[k] === 'string' ? (o[k] as string) : null)
      if (v) c[k] = v
    }
    c.cursor = normalizeColor(o.cursorColor as string) ?? undefined
    c.selection = normalizeColor(o.selectionBackground as string) ?? undefined
    const name = typeof o.name === 'string' && o.name.trim() ? o.name.trim() : fallbackName
    out.push(toScheme(c, name, 'Windows Terminal'))
  }
  if (out.length === 0) throw new Error('o JSON não tem esquemas de cores do Windows Terminal')
  return out
}

// ---- iTerm2 ----

const ITERM_KEYS: Record<string, keyof Colors> = {
  'Background Color': 'background',
  'Foreground Color': 'foreground',
  'Cursor Color': 'cursor',
  'Selection Color': 'selection',
  ...Object.fromEntries(ANSI.map((k, i) => [`Ansi ${i} Color`, k])),
}

function fromITerm(text: string, name: string): TerminalScheme {
  const c: Colors = {}
  const entry = /<key>([^<]+)<\/key>\s*<dict>([\s\S]*?)<\/dict>/g
  for (const m of text.matchAll(entry)) {
    const key = ITERM_KEYS[m[1].trim()]
    if (!key) continue
    const comp = (n: string) => {
      const r = new RegExp(`<key>${n} Component</key>\\s*<real>([^<]+)</real>`).exec(m[2])
      const v = r ? Number.parseFloat(r[1]) : Number.NaN
      return Number.isFinite(v) ? Math.round(Math.min(1, Math.max(0, v)) * 255) : null
    }
    const rgb = [comp('Red'), comp('Green'), comp('Blue')]
    if (rgb.some((x) => x == null)) continue
    c[key] = `#${rgb.map((x) => (x as number).toString(16).padStart(2, '0')).join('')}`
  }
  return toScheme(c, name, 'iTerm2')
}

// ---- Ghostty ----

function fromGhostty(text: string, name: string): TerminalScheme {
  const c: Colors = {}
  for (const line of text.split(/\r?\n/)) {
    const m = /^\s*([\w-]+)\s*=\s*(.+?)\s*$/.exec(line)
    if (!m || line.trim().startsWith('#')) continue
    const [, key, value] = m
    if (key === 'palette') {
      const p = /^(\d{1,2})\s*=\s*(.+)$/.exec(value)
      const i = p ? Number(p[1]) : -1
      const col = p ? normalizeColor(p[2]) : null
      if (col && i >= 0 && i < 16) c[ANSI[i]] = col
      continue
    }
    const col = normalizeColor(value)
    if (!col) continue
    if (key === 'background') c.background = col
    else if (key === 'foreground') c.foreground = col
    else if (key === 'cursor-color') c.cursor = col
    else if (key === 'selection-background') c.selection = col
  }
  return toScheme(c, name, 'Ghostty')
}

// ---- Alacritty (TOML) ----

function fromAlacritty(text: string, name: string): TerminalScheme {
  const c: Colors = {}
  let section = ''
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.replace(/\s+#.*$/, '').trim()
    if (!line || line.startsWith('#')) continue
    const head = /^\[([^\]]+)\]$/.exec(line)
    if (head) {
      section = head[1].trim()
      continue
    }
    const m = /^(\w+)\s*=\s*(.+)$/.exec(line)
    if (!m) continue
    const col = normalizeColor(m[2])
    if (!col) continue
    const key = m[1]
    if (section === 'colors.primary' && (key === 'background' || key === 'foreground')) c[key] = col
    else if (section === 'colors.cursor' && key === 'cursor') c.cursor = col
    else if (section === 'colors.selection' && key === 'background') c.selection = col
    else if (section === 'colors.normal' || section === 'colors.bright') {
      const i = ANSI.indexOf(key as (typeof ANSI)[number])
      if (i >= 0 && i < 8) c[ANSI[section === 'colors.bright' ? i + 8 : i]] = col
    }
  }
  return toScheme(c, name, 'Alacritty')
}

// ---- kitty ----

function fromKitty(text: string, name: string): TerminalScheme {
  const c: Colors = {}
  for (const raw of text.split(/\r?\n/)) {
    const m = /^\s*(\w+)\s+(\S+)/.exec(raw)
    if (!m || raw.trim().startsWith('#')) continue
    const col = normalizeColor(m[2])
    if (!col) continue
    const key = m[1]
    const idx = /^color(\d{1,2})$/.exec(key)
    if (idx && Number(idx[1]) < 16) c[ANSI[Number(idx[1])]] = col
    else if (key === 'background' || key === 'foreground' || key === 'cursor') c[key] = col
    else if (key === 'selection_background') c.selection = col
  }
  return toScheme(c, name, 'kitty')
}

/**
 * Lê o arquivo de esquema (texto) e devolve os esquemas dele, com ids `custom-…`. Erro em português se o
 * formato não for reconhecido ou se faltarem cores.
 */
export function parseSchemeFile(text: string, fileName: string): TerminalScheme[] {
  const body = text.replace(/^﻿/, '').trim()
  const name = nameFromFile(fileName)
  if (!body) throw new Error('o arquivo está vazio')
  if (body.startsWith('<') && /Ansi 0 Color/.test(body)) return [fromITerm(body, name)]
  // Alacritty antes do JSON: o TOML também começa com "[".
  if (/^\s*\[colors[.\]]/m.test(body)) return [fromAlacritty(body, name)]
  if (body.startsWith('{') || body.startsWith('[')) {
    let data: unknown
    try {
      // Comentários de linha (o settings.json do Windows Terminal aceita).
      data = JSON.parse(body.replace(/^\s*\/\/.*$/gm, ''))
    } catch {
      throw new Error('o JSON do arquivo é inválido')
    }
    return fromWindowsTerminal(data, name)
  }
  if (/^\s*palette\s*=/m.test(body)) return [fromGhostty(body, name)]
  if (/^\s*color\d{1,2}\s+\S/m.test(body)) return [fromKitty(body, name)]
  throw new Error(
    'formato não reconhecido: use um esquema do Windows Terminal (JSON), iTerm2 (.itermcolors), Ghostty, Alacritty (TOML) ou kitty',
  )
}

/**
 * Junta os importados aos que já existem: o mesmo nome substitui o antigo (mantendo o id), nomes novos
 * ganham ids únicos. Devolve a lista nova e os ids dos que entraram.
 */
export function addCustomThemes(
  current: readonly TerminalScheme[],
  incoming: readonly TerminalScheme[],
): { list: TerminalScheme[]; ids: string[] } {
  const list = [...current]
  const ids: string[] = []
  for (const s of incoming) {
    const same = list.findIndex((x) => x.name.toLowerCase() === s.name.toLowerCase())
    if (same >= 0) {
      list[same] = { ...s, id: list[same].id }
      ids.push(list[same].id)
      continue
    }
    let id = s.id
    for (let n = 2; list.some((x) => x.id === id); n++) id = `${s.id}-${n}`
    list.push({ ...s, id })
    ids.push(id)
  }
  if (list.length > MAX_CUSTOM_THEMES) throw new Error(`no máximo ${MAX_CUSTOM_THEMES} temas importados`)
  return { list, ids }
}
