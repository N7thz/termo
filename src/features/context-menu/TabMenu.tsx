import { Menu, MenuContent, MenuContextTrigger, MenuItem, MenuSeparator } from '@ui-sdk/react/menu'
import type { ReactElement, ReactNode } from 'react'
import { menuContent, menuItem, menuSeparator } from '../../lib/ui'
import type { TabMenuAction } from './types'

interface Props {
  /** O elemento da aba; vira a área que abre o menu com o botão direito. */
  trigger: ReactElement
  children: ReactNode
  first: boolean
  last: boolean
  alone: boolean
  onAction: (action: TabMenuAction) => void
}

export function TabMenu({ trigger, children, first, last, alone, onAction }: Props) {
  return (
    <Menu onAction={(value) => onAction(value as TabMenuAction)}>
      <MenuContextTrigger render={trigger}>{children}</MenuContextTrigger>
      <MenuContent className={menuContent} aria-label="Ações da aba">
        <MenuItem className={menuItem} value="new-shell" shortcut="mod+shift+t">
          Nova aba
        </MenuItem>
        <MenuItem className={menuItem} value="new-claude" shortcut="mod+shift+k">
          Nova aba com Claude Code
        </MenuItem>
        <MenuItem className={menuItem} value="duplicate" shortcut="mod+shift+d">
          Duplicar aba
        </MenuItem>
        <MenuSeparator className={menuSeparator} />
        <MenuItem className={menuItem} value="move-left" shortcut="ctrl+shift+pageup" disabled={first}>
          Mover para a esquerda
        </MenuItem>
        <MenuItem className={menuItem} value="move-right" shortcut="ctrl+shift+pagedown" disabled={last}>
          Mover para a direita
        </MenuItem>
        <MenuSeparator className={menuSeparator} />
        <MenuItem className={menuItem} value="close" shortcut="mod+shift+w">
          Fechar aba
        </MenuItem>
        <MenuItem className={menuItem} value="close-others" disabled={alone} destructive>
          Fechar as outras abas
        </MenuItem>
        <MenuItem className={menuItem} value="close-right" disabled={last} destructive>
          Fechar as abas à direita
        </MenuItem>
      </MenuContent>
    </Menu>
  )
}
