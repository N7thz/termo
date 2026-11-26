/**
 * Tela de carregamento (#boot no index.html, pintada por public/boot.js antes do React).
 * Aqui ela some quando o app fica pronto, e o tema em uso é guardado para a próxima abertura
 * começar já com as cores dele, na página e na janela nativa.
 */
import { ipc } from '../../lib/ipc'
import type { ThemeDefinition } from '../theme/themes'

const STORAGE_KEY = 'termo.boot'
const SAVE_DELAY_MS = 800

let done = false
let pending: ThemeDefinition | null = null
let saveTimer: number | undefined

declare global {
  interface Window {
    __termoBootTimers?: number[]
  }
}

/** O app terminou de abrir: a camada some num fade curto e o tema atual passa a ser guardado. */
export function bootDone() {
  if (done) return
  done = true
  for (const t of window.__termoBootTimers ?? []) window.clearTimeout(t)
  const el = document.getElementById('boot')
  if (el) {
    el.classList.add('is-done')
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    window.setTimeout(() => el.remove(), reduce ? 0 : 220)
  }
  if (pending) rememberBootTheme(pending)
}

/**
 * Guarda as cores do tema para a próxima abertura. Antes do app ficar pronto o tema ainda é o padrão
 * (as configurações não chegaram), então só vale depois de `bootDone`; com espera, para a prévia da
 * lista de temas não gravar a cada item.
 */
export function rememberBootTheme(theme: ThemeDefinition) {
  pending = theme
  if (!done) return
  window.clearTimeout(saveTimer)
  saveTimer = window.setTimeout(() => save(theme), SAVE_DELAY_MS)
}

function save(theme: ThemeDefinition) {
  const { bg, text, muted, accent } = theme.ui
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ bg, text, muted, accent, scheme: theme.scheme }))
  } catch {
    /* sem armazenamento: a próxima abertura usa o tema padrão */
  }
  const hex = toHex(bg)
  if (hex) ipc.setWindowColor(hex).catch((err) => console.warn('[termo] cor da janela', err))
}

/** Converte qualquer cor CSS opaca em #rrggbb (o Rust só aceita esse formato); null se não der. */
export function toHex(color: string): string | null {
  if (/^#[0-9a-f]{6}$/i.test(color)) return color.toLowerCase()
  const ctx = document.createElement('canvas').getContext('2d')
  if (!ctx) return null
  ctx.fillStyle = '#000000'
  ctx.fillStyle = color
  const out = String(ctx.fillStyle)
  return /^#[0-9a-f]{6}$/i.test(out) ? out.toLowerCase() : null
}
