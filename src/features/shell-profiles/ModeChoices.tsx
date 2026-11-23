import { Button } from '@ui-sdk/react/button'
import { actionButton } from '../../lib/ui'
import type { SessionKind } from '../../shared/types'
import { ModeIcon } from './ModeIcon'
import { resolveDefaultShell } from './modes'
import { useShells } from './useShells'

/** Um botão por modo (cada shell instalado e o Claude Code), para a tela sem abas. */
export function ModeChoices({
  defaultShell,
  onPick,
}: {
  defaultShell: string
  onPick: (kind: SessionKind, shellId?: string) => void
}) {
  const shells = useShells()
  const current = resolveDefaultShell(defaultShell, shells)
  // O padrão vem primeiro: é o que o Ctrl+Shift+T abriria.
  const ordered = [...shells].sort((a, b) => Number(b.id === current) - Number(a.id === current))
  return (
    <ul className="m-0 flex max-w-[34rem] list-none flex-wrap justify-center gap-2 p-0" aria-label="Abrir uma aba">
      {ordered.length === 0 && (
        <li>
          <Button className={`${actionButton} text-text`} onClick={() => onPick('shell')}>
            <ModeIcon mode="pwsh" size={14} /> Nova aba
          </Button>
        </li>
      )}
      {ordered.map((s) => (
        <li key={s.id}>
          <Button
            className={`${actionButton} max-w-60 text-text`}
            onClick={() => onPick('shell', s.id)}
            title={s.id === current ? `${s.label} (padrão, Ctrl+Shift+T)` : s.label}
          >
            <ModeIcon mode={s.family} size={14} />
            <span className="truncate">{s.label}</span>
          </Button>
        </li>
      ))}
      <li>
        <Button className={`${actionButton} text-claude`} onClick={() => onPick('claude')} title="Ctrl+Shift+K">
          <ModeIcon mode="claude" size={13} /> Claude Code
        </Button>
      </li>
    </ul>
  )
}
