import { getCurrentWindow } from '@tauri-apps/api/window'
import { Copy, Minus, Square, X } from 'lucide-react'
import { useEffect, useState } from 'react'

// Botões no estilo do Windows: largos, colados no canto e da altura da barra. O fechar fica vermelho no hover.
const BUTTON =
  'flex h-10 w-11.5 items-center justify-center text-muted outline-none [transition:background-color_120ms_ease-out,color_120ms_ease-out] hover:bg-surface-hover hover:text-text focus-visible:bg-surface-hover focus-visible:text-text active:bg-border'

function run(action: () => Promise<void>) {
  action().catch((err) => console.error('[termo] falha ao controlar a janela', err))
}

/** Minimizar, maximizar/restaurar e fechar, para a janela sem a barra de título nativa. */
export function WindowControls() {
  const [maximized, setMaximized] = useState(false)

  useEffect(() => {
    const win = getCurrentWindow()
    let alive = true
    const sync = () =>
      win
        .isMaximized()
        .then((v) => alive && setMaximized(v))
        .catch(() => {})
    sync()
    const unlisten = win.onResized(sync)
    return () => {
      alive = false
      unlisten.then((off) => off()).catch(() => {})
    }
  }, [])

  const win = getCurrentWindow()
  return (
    <div className="-mr-2 flex self-stretch">
      <button
        type="button"
        tabIndex={-1}
        className={BUTTON}
        aria-label="Minimizar"
        onClick={() => run(() => win.minimize())}
      >
        <Minus size={15} strokeWidth={1.5} />
      </button>
      <button
        type="button"
        tabIndex={-1}
        className={BUTTON}
        aria-label={maximized ? 'Restaurar' : 'Maximizar'}
        onClick={() => run(() => win.toggleMaximize())}
      >
        {maximized ? (
          <Copy size={12} strokeWidth={1.5} className="-scale-x-100" />
        ) : (
          <Square size={12} strokeWidth={1.5} />
        )}
      </button>
      <button
        type="button"
        tabIndex={-1}
        className={`${BUTTON} hover:bg-[#c42b1c] hover:text-white active:bg-[#b22a1b] focus-visible:bg-[#c42b1c] focus-visible:text-white`}
        aria-label="Fechar"
        onClick={() => run(() => win.close())}
      >
        <X size={16} strokeWidth={1.5} />
      </button>
    </div>
  )
}
