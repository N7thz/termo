import { Maximize2, Radio } from 'lucide-react'
import { keysFor } from './shortcuts'

const CHIP =
  'pointer-events-auto flex h-6 cursor-pointer items-center gap-1.5 rounded-full border border-hairline bg-surface px-2.5 text-[11.5px] text-muted shadow-tip outline-none [transition:background-color_140ms_ease-out,color_140ms_ease-out] hover:bg-surface-hover hover:text-text focus-visible:outline-2 focus-visible:outline-accent'

const keys = (action: 'zoom-pane' | 'broadcast') =>
  (keysFor(action) ?? '').replace('mod', 'Ctrl').replace(/\b[a-z]/g, (c) => c.toUpperCase())

/** Avisos no canto do cartão: painel escondido pelo zoom e digitação em vários painéis ligada. */
export function PaneNotice({
  hiddenPanes,
  broadcast,
  onUnzoom,
  onStopBroadcast,
}: {
  /** Painéis da tela dividida escondidos pelo zoom (0 = nenhum). */
  hiddenPanes: number
  /** Abas recebendo o que é digitado (com a ativa); `null` = recurso desligado. */
  broadcast: number | null
  onUnzoom: () => void
  onStopBroadcast: () => void
}) {
  if (hiddenPanes === 0 && broadcast == null) return null
  return (
    <div className="pointer-events-none absolute top-2 right-4 z-20 flex flex-col items-end gap-1.5">
      {broadcast != null && (
        <button
          type="button"
          className={`${CHIP} text-text`}
          title={`Desligar (${keys('broadcast')})`}
          onClick={onStopBroadcast}
        >
          <Radio aria-hidden size={12} className="text-accent" />
          {broadcast > 1 ? `Digitando em ${broadcast} abas` : 'Digitando em vários painéis: sem outra aba aqui'}
        </button>
      )}
      {hiddenPanes > 0 && (
        <button
          type="button"
          className={CHIP}
          title={`Voltar aos dois painéis (${keys('zoom-pane')})`}
          onClick={onUnzoom}
        >
          <Maximize2 aria-hidden size={12} />
          {hiddenPanes} painel escondido
        </button>
      )}
    </div>
  )
}
