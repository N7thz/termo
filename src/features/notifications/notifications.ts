import type { IDisposable, Terminal } from '@xterm/xterm'
import type { NotificationSettings } from '../../shared/types'
import type { AgentState } from '../agent-status/agentState'
import { decodeCommand } from '../blocks/blocks'

export interface Notice {
  title: string
  body: string
}

/**
 * Aviso para a mudança de estado do Claude numa aba, ou `null`. Só avisa ao entrar em "terminou"
 * ou "pedindo permissão" (o "esperando você" vem logo depois do "terminou" e repetiria o aviso),
 * e só com a janela sem foco: com ela na frente, o avatar da aba já mostra.
 */
export function agentNotice(
  prev: AgentState | undefined,
  next: AgentState,
  tabTitle: string,
  settings: NotificationSettings,
  windowFocused: boolean,
): Notice | null {
  if (!settings.enabled || !settings.claude || windowFocused || prev === next) return null
  const where = tabTitle.trim() || 'Claude Code'
  if (next === 'blocked') return { title: 'Claude pedindo permissão', body: `${where}: responda para ele continuar.` }
  if (next === 'done') return { title: 'Claude terminou', body: `${where}: a resposta está pronta.` }
  return null
}

export interface FinishedCommand {
  command: string
  exitCode: number | null
  durationMs: number
}

/** Aviso para um comando que terminou, ou `null` se foi rápido, a janela está na frente ou está desligado. */
export function commandNotice(
  cmd: FinishedCommand,
  settings: NotificationSettings,
  windowFocused: boolean,
): Notice | null {
  if (!settings.enabled || !settings.commands || windowFocused) return null
  if (!cmd.command.trim() || cmd.durationMs < settings.commandSecs * 1000) return null
  const ok = cmd.exitCode === 0 || cmd.exitCode == null
  const title = ok ? 'Comando concluído' : `Comando falhou (código ${cmd.exitCode})`
  return { title, body: `${cmd.command.trim()} · ${formatSeconds(cmd.durationMs)}` }
}

export function formatSeconds(ms: number): string {
  const s = Math.round(ms / 1000)
  if (s < 60) return `${s} s`
  const m = Math.floor(s / 60)
  const rest = s % 60
  if (m < 60) return rest ? `${m} min ${rest} s` : `${m} min`
  const h = Math.floor(m / 60)
  return `${h} h ${m % 60} min`
}

/**
 * Mede cada comando pelas marcas do shell (OSC 633;E com o texto, 133;C no início, 133;D;<código> no fim),
 * sem depender dos blocos. Os tratadores devolvem `false` para os blocos também receberem as marcas.
 */
export function watchCommands(term: Terminal, onEnd: (cmd: FinishedCommand) => void, now = () => Date.now()) {
  let pending = ''
  let running: { command: string; startedAt: number } | null = null
  const disposables: IDisposable[] = [
    term.parser.registerOscHandler(633, (data) => {
      if (data.startsWith('E;')) pending = decodeCommand(data.slice(2))
      return false
    }),
    term.parser.registerOscHandler(133, (data) => {
      if (data.startsWith('C')) {
        running = { command: pending, startedAt: now() }
        pending = ''
      } else if (data.startsWith('D') && running) {
        const code = Number.parseInt(data.split(';')[1] ?? '', 10)
        onEnd({
          command: running.command,
          exitCode: Number.isFinite(code) ? code : null,
          durationMs: now() - running.startedAt,
        })
        running = null
      }
      return false
    }),
  ]
  return {
    dispose() {
      for (const d of disposables) d.dispose()
    },
  }
}
