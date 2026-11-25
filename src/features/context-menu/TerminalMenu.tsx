import { Menu, MenuContent, MenuContextTrigger, MenuItem, MenuSeparator } from '@ui-sdk/react/menu'
import { type ReactNode, useRef, useState } from 'react'
import { menuContent, menuItem, menuSeparator } from '../../lib/ui'
import type { TerminalActions, TerminalMenuAction } from './types'

interface Props {
  children: ReactNode
  /** Lido na hora de abrir: o terminal pode ainda não ter entregado as ações. */
  actions: () => TerminalActions | undefined
  onAction: (action: TerminalMenuAction) => void
}

export function TerminalMenu({ children, actions, onAction }: Props) {
  const [hasSelection, setHasSelection] = useState(false)
  const [ready, setReady] = useState(false)
  const areaRef = useRef<HTMLDivElement>(null)

  return (
    <Menu
      onOpenChange={(open) => {
        if (!open) return
        const a = actions()
        setReady(Boolean(a))
        setHasSelection(a?.hasSelection() ?? false)
      }}
      onAction={(value) => onAction(value as TerminalMenuAction)}
    >
      {/*
        Sem cliques na área em si: as abas ficam empilhadas e a área de uma aba escondida, que vem depois no
        DOM, tapava os botões da aba ativa (sessão restaurada com a ativa no meio). O clique direito no terminal
        visível (pointer-events-auto) ainda sobe até aqui e abre o menu.
      */}
      <MenuContextTrigger ref={areaRef} className="pointer-events-none absolute inset-0">
        {children}
      </MenuContextTrigger>
      {/* O foco volta ao xterm, não à área do gatilho, que não é focável. */}
      <MenuContent
        className={menuContent}
        aria-label="Ações do terminal"
        finalFocus={() => areaRef.current?.querySelector<HTMLElement>('.xterm-helper-textarea') ?? null}
      >
        <MenuItem className={menuItem} value="copy" shortcut="mod+shift+c" disabled={!hasSelection}>
          Copiar
        </MenuItem>
        <MenuItem className={menuItem} value="paste" shortcut="mod+v" disabled={!ready}>
          Colar
        </MenuItem>
        <MenuItem className={menuItem} value="select-all" disabled={!ready}>
          Selecionar tudo
        </MenuItem>
        <MenuItem className={menuItem} value="clear" disabled={!ready}>
          Limpar a tela
        </MenuItem>
        <MenuSeparator className={menuSeparator} />
        <MenuItem className={menuItem} value="find" shortcut="mod+shift+f" disabled={!ready}>
          Buscar na saída…
        </MenuItem>
        <MenuSeparator className={menuSeparator} />
        <MenuItem className={menuItem} value="new-shell" shortcut="mod+shift+t">
          Nova aba
        </MenuItem>
        <MenuItem className={menuItem} value="new-claude" shortcut="mod+shift+k">
          Nova aba com Claude Code
        </MenuItem>
        <MenuSeparator className={menuSeparator} />
        <MenuItem className={menuItem} value="themes" shortcut="mod+shift+,">
          Temas…
        </MenuItem>
        <MenuItem className={menuItem} value="settings" shortcut="mod+,">
          Configurações…
        </MenuItem>
        <MenuSeparator className={menuSeparator} />
        <MenuItem className={menuItem} value="close" shortcut="mod+shift+w">
          Fechar aba
        </MenuItem>
      </MenuContent>
    </Menu>
  )
}
