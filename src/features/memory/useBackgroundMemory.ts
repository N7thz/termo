import { useEffect } from 'react'
import { ipc } from '../../lib/ipc'

/** Em segundo plano, devolve a memória ociosa de novo de tempos em tempos (os processos voltam a crescer). */
const RETRIM_MS = 5 * 60_000

/**
 * Modo leve em segundo plano: quando a janela some (minimizada ou na bandeja), avisa o Rust, que põe o
 * WebView2 no modo de pouca memória e devolve ao Windows a memória ociosa do Termo e das abas (se a
 * opção estiver ligada). Ao voltar, o WebView2 volta ao normal.
 */
export function useBackgroundMemory() {
  useEffect(() => {
    let timer: number | undefined
    const apply = () => {
      const hidden = document.hidden
      void ipc.memoryBackground(hidden).catch(() => undefined)
      window.clearInterval(timer)
      if (hidden) timer = window.setInterval(() => void ipc.memoryBackground(true).catch(() => undefined), RETRIM_MS)
    }
    document.addEventListener('visibilitychange', apply)
    return () => {
      document.removeEventListener('visibilitychange', apply)
      window.clearInterval(timer)
    }
  }, [])
}

/** "1,2 GB", "640 MB". */
export function formatBytes(bytes: number): string {
  const mb = bytes / 1024 / 1024
  if (mb >= 1024) return `${(mb / 1024).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} GB`
  return `${Math.round(mb)} MB`
}
