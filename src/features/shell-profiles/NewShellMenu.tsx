import { Menu, MenuContent, MenuItem, MenuSeparator, MenuShortcut, MenuTrigger } from '@ui-sdk/react/menu'
import { ChevronDown, GitBranch, LayoutGrid, UserRound } from 'lucide-react'
import type { ReactNode } from 'react'
import { actionButton, menuContent, menuItem, menuSeparator } from '../../lib/ui'
import type { SessionKind } from '../../shared/types'
import { useLayouts } from '../layouts/LayoutsContext'
import { useRoles } from '../roles/RolesContext'
import { useOpenWorktrees } from '../worktree/WorktreeContext'
import { ModeIcon } from './ModeIcon'
import { familyOf, resolveDefaultShell } from './modes'
import { useShells } from './useShells'
import { useSshHosts } from './useSshHosts'

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
const MANAGE_LAYOUTS = '__layouts'
const WORKTREE = '__worktree'
const ROLE = '__role:'

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
  const sshHosts = useSshHosts()
  const layouts = useLayouts()
  const openWorktrees = useOpenWorktrees()
  const roles = useRoles()
  const current = resolveDefaultShell(defaultShell, shells)
  return (
    <Menu
      onAction={(value) => {
        const v = String(value)
        if (v === CLAUDE) return onPick('claude')
        if (v === MANAGE_LAYOUTS) return layouts?.onManage()
        if (v === WORKTREE) return openWorktrees?.()
        if (v.startsWith(ROLE)) return roles?.onOpen(v.slice(ROLE.length))
        if (v.startsWith('layout:')) return layouts?.onOpen(Number(v.slice('layout:'.length)))
        onPick('shell', v)
      }}
    >
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
        {sshHosts.length > 0 && (
          <>
            <MenuSeparator className={menuSeparator} />
            {sshHosts.map((host) => (
              <MenuItem key={host} className={menuItem} value={`ssh:${host}`}>
                <ModeIcon mode="ssh" size={14} />
                <span className="min-w-0 truncate">SSH: {host}</span>
              </MenuItem>
            ))}
          </>
        )}
        <MenuSeparator className={menuSeparator} />
        <MenuItem className={menuItem} value={CLAUDE}>
          <ModeIcon mode="claude" size={14} />
          Claude Code
          <MenuShortcut>Ctrl+Shift+K</MenuShortcut>
        </MenuItem>
        {openWorktrees && (
          <MenuItem className={menuItem} value={WORKTREE}>
            <GitBranch aria-hidden size={14} className="flex-none text-muted" />
            Claude Code numa cópia isolada…
          </MenuItem>
        )}
        {roles && roles.agents.length > 0 && (
          <>
            <MenuSeparator className={menuSeparator} />
            {roles.agents.map((a) => (
              <MenuItem key={a.name} className={menuItem} value={`${ROLE}${a.name}`}>
                <UserRound aria-hidden size={14} className="flex-none text-claude" />
                <span className="flex min-w-0 flex-col" title={a.description || undefined}>
                  <span className="truncate">Claude como {a.name}</span>
                  {a.description && <span className="truncate text-[11px] text-muted">{a.description}</span>}
                </span>
              </MenuItem>
            ))}
          </>
        )}
        {layouts && (
          <>
            <MenuSeparator className={menuSeparator} />
            {layouts.layouts.map((l, i) => (
              <MenuItem key={l.name} className={menuItem} value={`layout:${i}`}>
                <LayoutGrid aria-hidden size={14} className="flex-none text-muted" />
                <span className="min-w-0 truncate">Layout: {l.name}</span>
              </MenuItem>
            ))}
            <MenuItem className={menuItem} value={MANAGE_LAYOUTS}>
              <LayoutGrid aria-hidden size={14} className="flex-none text-muted" />
              Layouts salvos…
            </MenuItem>
          </>
        )}
      </MenuContent>
    </Menu>
  )
}
