import { Menu, MenuContent, MenuItem, MenuSeparator, MenuShortcut, MenuTrigger } from '@ui-sdk/react/menu'
import { ChevronDown } from 'lucide-react'
import type { ReactNode } from 'react'
import { actionButton, menuContent, menuItem, menuSeparator } from '../../lib/ui'
import type { SessionKind } from '../../shared/types'
import { ModeIcon } from './ModeIcon'
import { familyOf, resolveDefaultShell } from './modes'
import { useShells } from './useShells'

interface Props {
  /** `defaultShell` das configurações (`auto` marca o primeiro da lista). */
  defaultShell: string
  /** Abre a aba: shell com o id escolhido, ou Claude Code. */
  onPick: (kind: SessionKind, shellId?: string) => void
  /** Classe e conteúdo do botão que abre o menu (padrão: a seta ao lado do "+"). */
  triggerClassName?: string
  triggerLabel?: string
  children?: ReactNode
}

const CLAUDE = '__claude'

/**
 * Menu "nova aba" com todos os modos: cada shell instalado (PowerShell 7, Windows PowerShell, cmd,
 * distros do WSL) e o Claude Code, cada um com o seu ícone e tom.
 */
export function NewShellMenu({
  defaultShell,
  onPick,
  triggerClassName = `${actionButton} px-1.5`,
  triggerLabel = 'Nova aba em outro modo',
  children,
}: Props) {
  const shells = useShells()
  const current = resolveDefaultShell(defaultShell, shells)
  return (
    <Menu onAction={(value) => (value === CLAUDE ? onPick('claude') : onPick('shell', String(value)))}>
      <MenuTrigger className={triggerClassName} aria-label={triggerLabel} title={triggerLabel}>
        {children ?? <ChevronDown size={13} />}
      </MenuTrigger>
      <MenuContent className={`${menuContent} max-w-80`} aria-label="Modos de nova aba">
        {shells.length === 0 && (
          <MenuItem className={menuItem} value={defaultShell === 'auto' ? 'pwsh' : defaultShell}>
            <ModeIcon mode={familyOf(current) ?? 'pwsh'} size={14} />
            Shell padrão
            <MenuShortcut>Ctrl+Shift+T</MenuShortcut>
          </MenuItem>
        )}
        {shells.map((s) => (
          <MenuItem key={s.id} className={menuItem} value={s.id}>
            <ModeIcon mode={s.family} size={14} />
            <span className="min-w-0 truncate">{s.label}</span>
            {s.id === current && <MenuShortcut>Ctrl+Shift+T</MenuShortcut>}
          </MenuItem>
        ))}
        <MenuSeparator className={menuSeparator} />
        <MenuItem className={menuItem} value={CLAUDE}>
          <ModeIcon mode="claude" size={14} />
          Claude Code
          <MenuShortcut>Ctrl+Shift+K</MenuShortcut>
        </MenuItem>
      </MenuContent>
    </Menu>
  )
}
