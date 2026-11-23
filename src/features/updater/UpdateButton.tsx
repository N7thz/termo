import { Button } from '@ui-sdk/react/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@ui-sdk/react/tooltip'
import { ArrowDownCircle, LoaderCircle } from 'lucide-react'
import { useEffect, useState } from 'react'
import { ipc } from '../../lib/ipc'
import { actionButton, tooltip } from '../../lib/ui'
import type { UpdateInfo } from './types'

/**
 * Botão na barra de título quando há versão nova (achada ao abrir ou em "Procurar atualização").
 * Instalar é sempre um clique: baixa, instala e reinicia.
 */
export function UpdateButton() {
  const [info, setInfo] = useState<UpdateInfo | null>(null)
  const [installing, setInstalling] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let unlisten: (() => void) | undefined
    let gone = false
    void ipc
      .onUpdateAvailable(setInfo)
      .then((fn) => {
        if (gone) fn()
        else unlisten = fn
      })
      .catch(() => undefined)
    // A verificação das Configurações também acende o botão.
    const onFound = (e: Event) => setInfo((e as CustomEvent<UpdateInfo>).detail)
    window.addEventListener(UPDATE_FOUND_EVENT, onFound)
    return () => {
      gone = true
      unlisten?.()
      window.removeEventListener(UPDATE_FOUND_EVENT, onFound)
    }
  }, [])

  if (!info) return null

  const install = () => {
    setInstalling(true)
    setError(null)
    ipc.updateInstall().catch((err) => {
      setInstalling(false)
      setError(String(err))
    })
  }

  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <Button
            className={`${actionButton} text-[12px] font-[560] text-accent`}
            onClick={install}
            disabled={installing}
            aria-label={`Atualizar para a versão ${info.version}`}
          />
        }
      >
        {installing ? (
          <LoaderCircle size={14} className="animate-spin motion-reduce:animate-none" />
        ) : (
          <ArrowDownCircle size={14} />
        )}
        {installing ? 'Atualizando…' : `v${info.version}`}
      </TooltipTrigger>
      <TooltipContent className={`${tooltip} max-w-72 whitespace-pre-line`} sideOffset={6}>
        {error
          ? `Não deu para atualizar: ${error}`
          : `Termo ${info.version} disponível (você tem a ${info.current}). Clique para instalar e reiniciar.${
              info.notes ? `\n\n${info.notes.slice(0, 400)}` : ''
            }`}
      </TooltipContent>
    </Tooltip>
  )
}

/** Evento da janela com a versão achada por uma verificação manual (Configurações). */
export const UPDATE_FOUND_EVENT = 'termo:update-found'

export function announceUpdate(info: UpdateInfo) {
  window.dispatchEvent(new CustomEvent(UPDATE_FOUND_EVENT, { detail: info }))
}
