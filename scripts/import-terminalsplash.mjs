// Converte o themes.json do terminalsplash.com em esquemas de cor limpos para o Termo.
// Só as cores são usadas (perfis, fontes e imagens de fundo ficam de fora), com autor e link de origem.
// Uso:
//   curl -sL https://terminalsplash.com/themes.json -o themes.json
//   node scripts/import-terminalsplash.mjs themes.json src/features/theme/splash-themes.json
import { readFileSync, writeFileSync } from 'node:fs'

const [, , input, output] = process.argv
const raw = JSON.parse(readFileSync(input, 'utf8'))

const COLORS = ['black', 'red', 'green', 'yellow', 'blue', 'purple', 'cyan', 'white']
const ALL = [...COLORS, ...COLORS.map((c) => `bright${c[0].toUpperCase()}${c.slice(1)}`)]

const decode = (s) =>
  s
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')

/** Acha objetos {...} balanceados no texto (ignora chaves dentro de strings). */
function objects(text) {
  const out = []
  for (let i = 0; i < text.length; i++) {
    if (text[i] !== '{') continue
    let depth = 0
    let inStr = false
    for (let j = i; j < text.length; j++) {
      const c = text[j]
      if (inStr) {
        if (c === '\\') j++
        else if (c === '"') inStr = false
      } else if (c === '"') inStr = true
      else if (c === '{') depth++
      else if (c === '}' && --depth === 0) {
        out.push(text.slice(i, j + 1))
        break
      }
    }
  }
  return out
}

function lenientParse(s) {
  const cleaned = s
    .replace(/\/\/[^\n]*/g, '')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/,\s*([}\]])/g, '$1')
  try {
    return JSON.parse(cleaned)
  } catch {
    return null
  }
}

const HEX = /^#[0-9a-f]{6}$/i
const norm = (v) => {
  if (typeof v !== 'string') return null
  const m = v.trim().match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i)
  if (!m) return null
  const h = m[1].length === 3 ? [...m[1]].map((c) => c + c).join('') : m[1]
  return `#${h.toLowerCase()}`
}

const slug = (s) =>
  s
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 34)

const seenColors = new Set()
const seenIds = new Set()
const result = []
const skipped = []

for (const entry of raw) {
  const text = decode(entry.code ?? '')
  const candidates = objects(text).map(lenientParse).filter(Boolean)
  // Um tema pode trazer vários esquemas (ex.: claro e escuro); fica com todos os completos.
  const schemes = candidates.filter((o) => ALL.every((k) => norm(o[k])) && norm(o.background) && norm(o.foreground))
  if (schemes.length === 0) {
    skipped.push(entry.name)
    continue
  }
  for (const s of schemes) {
    const ansi = Object.fromEntries(
      ALL.map((k) => [k === 'purple' ? 'magenta' : k === 'brightPurple' ? 'brightMagenta' : k, norm(s[k])]),
    )
    const scheme = {
      background: norm(s.background),
      foreground: norm(s.foreground),
      cursor: norm(s.cursorColor) ?? norm(s.foreground),
      selection: norm(s.selectionBackground),
      ...ansi,
    }
    const fingerprint = JSON.stringify(scheme)
    if (seenColors.has(fingerprint)) continue
    seenColors.add(fingerprint)

    const name = (schemes.length > 1 && s.name ? s.name : entry.name || s.name || 'Sem nome').toString().trim()
    let id = `ts-${slug(s.name || entry.name)}` || 'ts-tema'
    for (let n = 2; seenIds.has(id); n++) id = `ts-${slug(s.name || entry.name).slice(0, 30)}-${n}`
    seenIds.add(id)
    result.push({
      id,
      name: name.replace(/\s+for (the )?(new )?Windows Terminal$/i, '').replace(/^Windows Terminal (Theme )?/i, ''),
      author: entry.author_name ?? '',
      source: entry.source ?? entry.author_url ?? '',
      ...scheme,
    })
  }
}

for (const r of result) if (!HEX.test(r.background)) throw new Error(`cor inválida em ${r.id}`)
result.sort((a, b) => a.name.localeCompare(b.name, 'en', { sensitivity: 'base' }))
writeFileSync(output, `${JSON.stringify(result, null, 1)}\n`)
console.log(
  `temas no site: ${raw.length}; convertidos: ${result.length}; sem esquema de cores completo: ${skipped.length}`,
)
console.log('sem esquema (amostra):', skipped.slice(0, 15).join(' | '))
