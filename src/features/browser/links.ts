/**
 * Decide onde um link do terminal abre: no painel ao lado ou no navegador padrão.
 * O terminal chama `openLink`; o `BrowserPanel` assina os pedidos e informa a preferência atual.
 */
import { ipc } from '../../lib/ipc'
import type { LinkTarget } from './types'

export interface LinkRequest {
  url: string
  /** Muda a cada pedido, para reabrir o mesmo endereço. */
  id: number
}

let target: LinkTarget = 'panel'
let panelMounted = false
let nextId = 1
const listeners = new Set<(req: LinkRequest) => void>()

/** O destino do clique: `invert` (Ctrl+clique) troca painel por navegador e vice-versa. */
export function resolveTarget(preferred: LinkTarget, invert: boolean, panelAvailable: boolean): LinkTarget {
  const chosen = invert ? (preferred === 'panel' ? 'browser' : 'panel') : preferred
  return chosen === 'panel' && !panelAvailable ? 'browser' : chosen
}

export function openLink(url: string, invert = false) {
  if (resolveTarget(target, invert, panelMounted && listeners.size > 0) === 'browser') {
    void ipc.openUrl(url)
    return
  }
  const req = { url, id: nextId++ }
  for (const fn of listeners) fn(req)
}

/** Usado pelo painel: recebe os pedidos e mantém a preferência em dia. */
export function connectPanel(onRequest: (req: LinkRequest) => void) {
  listeners.add(onRequest)
  panelMounted = true
  return () => {
    listeners.delete(onRequest)
    panelMounted = listeners.size > 0
  }
}

export function setLinkTarget(value: LinkTarget) {
  target = value
}
