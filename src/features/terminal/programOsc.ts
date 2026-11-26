/**
 * Sequências OSC que os programas mandam para o terminal, além da integração do shell:
 *
 * - `OSC 9;4;<estado>;<0-100>`: progresso (ConEmu/Windows Terminal). `winget`, `cargo`, `bun` e scripts
 *   usam para mostrar a barra no ícone da barra de tarefas.
 * - `OSC 9;<texto>`: aviso (iTerm2/ConEmu). `OSC 9;<número>;...` são outros comandos do ConEmu (o 9;9 é a
 *   pasta atual) e não viram aviso.
 * - `OSC 777;notify;<título>;<texto>`: aviso (rxvt, foot, Ghostty).
 * - `OSC 52;<destino>;<base64>`: copiar para a área de transferência (tmux, nvim, ssh). `?` pediria o
 *   conteúdo de volta: ler nunca é permitido.
 *
 * As funções de leitura são puras; `attachProgramOsc` liga tudo num xterm.
 */
import type { Terminal } from '@xterm/xterm'

export type ProgressState = 'normal' | 'error' | 'indeterminate' | 'paused'

export interface Progress {
  state: ProgressState
  /** 0 a 100 (no `indeterminate`, o último valor conhecido ou 0). */
  value: number
}

/** Maior texto copiado pelo OSC 52 (em base64): ~1 MB de texto. */
export const MAX_CLIPBOARD_BASE64 = 1_400_000
/** Intervalo mínimo entre dois avisos de programa na mesma aba (contra laço que inunda a central). */
export const NOTICE_INTERVAL_MS = 3000
const MAX_NOTICE = 240

const STATES: Record<string, ProgressState | null> = {
  '0': null,
  '1': 'normal',
  '2': 'error',
  '3': 'indeterminate',
  '4': 'paused',
}

/**
 * `OSC 9`: `{ progress }` para o 9;4 (`null` = some a barra), `{ notice }` para um aviso de texto, ou
 * `null` para os outros comandos do ConEmu e conteúdo vazio.
 */
export function parseOsc9(data: string): { progress: Progress | null } | { notice: string } | null {
  if (data.startsWith('4;') || data === '4') {
    const [, st = '0', pr = ''] = data.split(';')
    if (!(st in STATES)) return null
    const state = STATES[st]
    if (state == null) return { progress: null }
    const n = Number.parseInt(pr, 10)
    const value = Number.isFinite(n) ? Math.min(100, Math.max(0, n)) : 0
    return { progress: { state, value } }
  }
  // Comandos numéricos do ConEmu (9;1 dormir, 9;9 pasta...): não são avisos.
  if (/^\d+(;|$)/.test(data)) return null
  const text = clean(data)
  return text ? { notice: text } : null
}

/** `OSC 777;notify;<título>;<texto>`; o texto pode ter `;`. */
export function parseOsc777(data: string): { title: string; body: string } | null {
  const [kind, title = '', ...rest] = data.split(';')
  if (kind !== 'notify') return null
  const t = clean(title)
  const body = clean(rest.join(';'))
  if (!t && !body) return null
  return { title: t, body }
}

/** `OSC 52;<destino>;<base64>`: o texto a copiar, ou `null` (pedido de leitura, vazio, inválido ou grande demais). */
export function parseOsc52(data: string): string | null {
  const at = data.indexOf(';')
  if (at === -1) return null
  const target = data.slice(0, at)
  const payload = data.slice(at + 1).replace(/\s+/g, '')
  if (!/^[cpqs0-7]*$/.test(target)) return null
  if (payload === '' || payload === '?' || payload.length > MAX_CLIPBOARD_BASE64) return null
  if (!/^[A-Za-z0-9+/]*={0,2}$/.test(payload)) return null
  try {
    const bin = atob(payload)
    const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0))
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes)
  } catch {
    return null
  }
}

/** Sem caracteres de controle, espaços simples e no máximo 240 caracteres. */
function clean(text: string): string {
  // \p{Cc}: os caracteres de controle (C0, DEL e C1), que viram espaço.
  const flat = text
    .replace(/\p{Cc}+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  return flat.length > MAX_NOTICE ? `${flat.slice(0, MAX_NOTICE - 1)}…` : flat
}

export interface ProgramOscHandlers {
  onProgress: (p: Progress | null) => void
  /** Aviso de um programa (já limitado a um a cada 3 s por aba). */
  onNotice: (title: string, body: string) => void
  onCopy: (text: string) => void
  /** Lido a cada sequência: as opções podem mudar com o terminal aberto. */
  allow: () => { clipboard: boolean; notifications: boolean }
}

/** Liga os handlers no xterm. As sequências são sempre consumidas, mesmo quando a opção está desligada. */
export function attachProgramOsc(term: Terminal, h: ProgramOscHandlers, now: () => number = Date.now) {
  let lastNotice = -Infinity
  const notice = (title: string, body: string) => {
    if (!h.allow().notifications) return
    const t = now()
    if (t - lastNotice < NOTICE_INTERVAL_MS) return
    lastNotice = t
    h.onNotice(title, body)
  }
  const disposables = [
    term.parser.registerOscHandler(9, (data) => {
      const r = parseOsc9(data)
      if (r && 'progress' in r) h.onProgress(r.progress)
      else if (r) notice('', r.notice)
      // 9;9 (pasta) e outros do ConEmu ficam para quem mais os tratar.
      return r != null
    }),
    term.parser.registerOscHandler(777, (data) => {
      const r = parseOsc777(data)
      if (r) notice(r.title, r.body)
      return true
    }),
    term.parser.registerOscHandler(52, (data) => {
      if (!h.allow().clipboard) return true
      const text = parseOsc52(data)
      if (text != null) h.onCopy(text)
      return true
    }),
  ]
  return {
    dispose: () => {
      for (const d of disposables) d.dispose()
    },
  }
}

/** O que vai para a barra de tarefas: o progresso da aba ativa; sem ele, um erro de outra aba ou o primeiro que houver. */
export function taskbarProgress(all: ReadonlyMap<number, Progress>, active: number | null): Progress | null {
  if (active != null) {
    const own = all.get(active)
    if (own) return own
  }
  const list = [...all.values()]
  return list.find((p) => p.state === 'error') ?? list[0] ?? null
}
