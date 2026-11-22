import { Tooltip, TooltipContent, TooltipShortcut, TooltipTrigger } from '@ui-sdk/react/tooltip'
import { Activity } from 'lucide-react'
import { useEffect, useState } from 'react'
import { ipc } from '../../lib/ipc'
import { actionButton, tooltip, tooltipKbd } from '../../lib/ui'
import { type AgentsResponse, counts } from './sessions'

/** `claude agents` custa um processo por leitura: o indicador lê devagar e para com a janela escondida. */
const POLL_MS = 30_000

/**
 * Botão da barra de título que abre a página de Sessões, com quantas sessões do Claude Code estão
 * trabalhando (acento) e quantas esperam você (amarelo do tema).
 */
export function SessionsIndicator({ onOpen }: { onOpen: () => void }) {
  const [n, setN] = useState<{ busy: number; waiting: number } | null>(null)

  useEffect(() => {
    let alive = true
    const load = () => {
      if (document.hidden) return
      ipc
        .coordAgents()
        .then((a) => alive && setN(counts((a as AgentsResponse).sessoes ?? [])))
        .catch(() => alive && setN(null))
    }
    load()
    const timer = window.setInterval(load, POLL_MS)
    document.addEventListener('visibilitychange', load)
    return () => {
      alive = false
      window.clearInterval(timer)
      document.removeEventListener('visibilitychange', load)
    }
  }, [])

  const label = n ? `Sessões do Claude: ${n.busy} trabalhando, ${n.waiting} esperando você` : 'Sessões do Claude Code'

  return (
    <Tooltip shortcut="mod+shift+a">
      <TooltipTrigger
        render={<button type="button" className={`${actionButton} tabular-nums`} aria-label={label} onClick={onOpen} />}
      >
        <Activity aria-hidden size={14} />
        {n && n.busy > 0 && <span className="text-[11.5px] text-accent">{n.busy}</span>}
        {n && n.waiting > 0 && (
          <span className="text-[11.5px]" style={{ color: 'var(--tone-yellow, var(--accent))' }}>
            {n.waiting}
          </span>
        )}
      </TooltipTrigger>
      <TooltipContent className={tooltip} sideOffset={6}>
        {label} <TooltipShortcut className={tooltipKbd} />
      </TooltipContent>
    </Tooltip>
  )
}
