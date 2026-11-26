import {
  Menu,
  MenuContent,
  MenuContextTrigger,
  MenuGroup,
  MenuGroupLabel,
  MenuItem,
  MenuSeparator,
} from '@ui-sdk/react/menu'
import type { ReactElement, ReactNode } from 'react'
import { menuContent, menuItem, menuSeparator } from '../../lib/ui'
import { keysFor } from '../tabs/shortcuts'
import type { TabMenuAction } from './types'

interface Props {
  /** O elemento da aba; vira a área que abre o menu com o botão direito. */
  trigger: ReactElement
  children: ReactNode
  first: boolean
  last: boolean
  alone: boolean
  /** Rótulos na vertical (lateral): "acima/abaixo" no lugar de "esquerda/direita". */
  vertical?: boolean
  /** A aba tem pasta conhecida e ela ainda não está fixada no perfil. */
  canPin?: boolean
  /** Grupos do perfil para onde a aba pode ir (sem o dela). */
  groups?: readonly { id: string; name: string }[]
  /** A aba está num grupo. */
  inGroup?: boolean
  /** A aba está numa tela dividida. */
  split?: boolean
  /** Dá para pôr esta aba ao lado da ativa (ela não é a ativa nem já está com ela). */
  canSplitWithActive?: boolean
  /** Outras abas do perfil com que dá para dividir a tela (sem a própria e sem a que já está ao lado). */
  splitTargets?: readonly { key: number; title: string }[]
  onAction: (action: TabMenuAction) => void
}

const groupLabel = 'px-2.5 pt-1.5 pb-1 text-[11px] font-semibold tracking-[0.04em] text-muted uppercase'

export function TabMenu(props: Props) {
  const { trigger, children, first, last, alone, vertical, canPin, onAction } = props
  const { groups = [], inGroup, split, canSplitWithActive, splitTargets = [] } = props
  return (
    <Menu onAction={(value) => onAction(value as TabMenuAction)}>
      <MenuContextTrigger render={trigger}>{children}</MenuContextTrigger>
      <MenuContent className={menuContent} aria-label="Ações da aba">
        <MenuItem className={menuItem} value="new-shell" shortcut={keysFor('new-shell')}>
          Nova aba
        </MenuItem>
        <MenuItem className={menuItem} value="new-claude" shortcut={keysFor('new-claude')}>
          Nova aba com Claude Code
        </MenuItem>
        <MenuItem className={menuItem} value="duplicate" shortcut={keysFor('duplicate-tab')}>
          Duplicar aba
        </MenuItem>
        <MenuItem className={menuItem} value="rename">
          Renomear aba…
        </MenuItem>
        <MenuItem className={menuItem} value="note">
          Nota da aba…
        </MenuItem>
        <MenuSeparator className={menuSeparator} />
        <MenuItem className={menuItem} value="move-left" shortcut="ctrl+shift+pageup" disabled={first}>
          {vertical ? 'Mover para cima' : 'Mover para a esquerda'}
        </MenuItem>
        <MenuItem className={menuItem} value="move-right" shortcut="ctrl+shift+pagedown" disabled={last}>
          {vertical ? 'Mover para baixo' : 'Mover para a direita'}
        </MenuItem>
        {canPin && (
          <MenuItem className={menuItem} value="pin-folder">
            Fixar a pasta desta aba
          </MenuItem>
        )}
        <MenuSeparator className={menuSeparator} />
        <MenuItem className={menuItem} value="split-new" shortcut={keysFor('split-tab')}>
          Dividir com uma aba nova
        </MenuItem>
        {canSplitWithActive && (
          <MenuItem className={menuItem} value="split-with-active">
            Abrir ao lado da aba atual
          </MenuItem>
        )}
        {splitTargets.length > 0 && (
          <MenuGroup>
            <MenuGroupLabel className={groupLabel}>Dividir a tela com</MenuGroupLabel>
            {splitTargets.map((t) => (
              <MenuItem key={t.key} className={menuItem} value={`split-with:${t.key}`}>
                <span className="max-w-60 truncate">{t.title}</span>
              </MenuItem>
            ))}
          </MenuGroup>
        )}
        {split && (
          <MenuItem className={menuItem} value="unsplit">
            Desfazer a divisão
          </MenuItem>
        )}
        <MenuSeparator className={menuSeparator} />
        <MenuItem className={menuItem} value="new-group">
          Novo grupo com esta aba
        </MenuItem>
        {groups.length > 0 && (
          <MenuGroup>
            <MenuGroupLabel className={groupLabel}>Mover para o grupo</MenuGroupLabel>
            {groups.map((g) => (
              <MenuItem key={g.id} className={menuItem} value={`move-to-group:${g.id}`}>
                {g.name}
              </MenuItem>
            ))}
          </MenuGroup>
        )}
        {inGroup && (
          <MenuItem className={menuItem} value="ungroup">
            Tirar do grupo
          </MenuItem>
        )}
        <MenuSeparator className={menuSeparator} />
        <MenuItem className={menuItem} value="close" shortcut={keysFor('close-tab')}>
          Fechar aba
        </MenuItem>
        <MenuItem className={menuItem} value="close-others" disabled={alone} destructive>
          Fechar as outras abas
        </MenuItem>
        <MenuItem className={menuItem} value="close-right" disabled={last} destructive>
          {vertical ? 'Fechar as abas abaixo' : 'Fechar as abas à direita'}
        </MenuItem>
      </MenuContent>
    </Menu>
  )
}
