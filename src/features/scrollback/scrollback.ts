import { SerializeAddon } from '@xterm/addon-serialize'
import type { Terminal } from '@xterm/xterm'
import { ipc } from '../../lib/ipc'

/** Linhas guardadas de cada aba (o fim do histórico). */
export const SAVED_ROWS = 1000
/** Abaixo do limite do Rust (1 MiB). */
export const MAX_CHARS = 900_000
const SAVE_EVERY_MS = 10_000

/** Corta o começo (linhas inteiras) até caber em `max` caracteres. */
export function trimToFit(text: string, max = MAX_CHARS): string {
  if (text.length <= max) return text
  const cut = text.indexOf('\n', text.length - max)
  return cut < 0 ? text.slice(text.length - max) : text.slice(cut + 1)
}

/** Separador escrito depois do texto restaurado, antes do shell novo. */
export const RESTORED_BANNER = '\r\n\x1b[2m── fim da sessão anterior ──\x1b[0m\r\n'

/**
 * Guarda o fim da saída da aba a cada 10 s (só se mudou) e ao fechar, e devolve o texto da última
 * vez ao reabrir. O texto é o do xterm serializado: cores e estilos voltam iguais. O buffer
 * alternativo (vim, less) fica de fora.
 */
export function attachScrollback(term: Terminal, id: string) {
  const serializer = new SerializeAddon()
  term.loadAddon(serializer)
  let dirty = false
  const sub = term.onWriteParsed(() => {
    dirty = true
  })
  const save = () => {
    if (!dirty) return
    dirty = false
    let text: string
    try {
      text = serializer.serialize({ scrollback: SAVED_ROWS, excludeAltBuffer: true, excludeModes: true })
    } catch {
      return
    }
    void ipc.saveScrollback(id, trimToFit(text)).catch(() => {
      dirty = true
    })
  }
  const timer = window.setInterval(save, SAVE_EVERY_MS)
  return {
    /** Escreve o texto guardado (se houver) antes do shell abrir. */
    async restore() {
      const text = await ipc.loadScrollback(id).catch(() => null)
      if (!text) return
      await new Promise<void>((resolve) => term.write(text, resolve))
      term.write(RESTORED_BANNER)
    },
    dispose() {
      window.clearInterval(timer)
      save()
      sub.dispose()
      serializer.dispose()
    },
  }
}
