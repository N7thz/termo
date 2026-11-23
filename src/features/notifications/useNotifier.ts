import { useRef } from 'react'
import { ipc } from '../../lib/ipc'
import type { NotificationSettings } from '../../shared/types'
import type { AgentState } from '../agent-status/agentState'
import { agentNotice, commandNotice, type FinishedCommand, type Notice } from './notifications'

const send = (notice: Notice | null) => {
  if (notice) void ipc.notify(notice.title, notice.body).catch(() => undefined)
}

/**
 * Decide e manda os avisos do Windows. Guarda o último estado do Claude de cada aba para avisar só
 * na mudança; o foco é o da janela (`document.hasFocus`), não o da aba.
 */
export function useNotifier(settings: NotificationSettings) {
  const settingsRef = useRef(settings)
  settingsRef.current = settings
  const last = useRef(new Map<number, AgentState>())
  return useRef({
    agent(tabKey: number, title: string, state: AgentState) {
      const prev = last.current.get(tabKey)
      if (state === 'off') last.current.delete(tabKey)
      else last.current.set(tabKey, state)
      send(agentNotice(prev, state, title, settingsRef.current, document.hasFocus()))
    },
    command(cmd: FinishedCommand) {
      send(commandNotice(cmd, settingsRef.current, document.hasFocus()))
    },
  }).current
}
