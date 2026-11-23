import { useEffect, useRef } from 'react'
import { ipc } from '../../lib/ipc'
import type { SessionKind } from '../../shared/types'

/** Abre a aba pedida pelo menu da bandeja (o Rust já trouxe a janela para a frente). */
export function useTrayActions(open: (kind: SessionKind) => void) {
  const openRef = useRef(open)
  openRef.current = open
  useEffect(() => {
    let unlisten: (() => void) | undefined
    let gone = false
    void ipc
      .onTrayAction((action) => openRef.current(action === 'new-claude' ? 'claude' : 'shell'))
      .then((fn) => {
        if (gone) fn()
        else unlisten = fn
      })
      .catch(() => undefined)
    return () => {
      gone = true
      unlisten?.()
    }
  }, [])
}
