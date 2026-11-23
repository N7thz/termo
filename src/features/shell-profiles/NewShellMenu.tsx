import { Menu, MenuContent, MenuItem, MenuTrigger } from '@ui-sdk/react/menu'
import { ChevronDown } from 'lucide-react'
import { useEffect, useState } from 'react'
import { ipc } from '../../lib/ipc'
import { actionButton, menuContent, menuItem } from '../../lib/ui'
import type { ShellInfo } from '../../shared/types'

interface Props {
  /** `defaultShell` das configurações (`auto` marca o primeiro da lista). */
  defaultShell: string
  onPick: (shell: string) => void
}

/**
 * Seta ao lado do "+": abre uma aba nova com outro shell (PowerShell, cmd, distros do WSL).
 * Só aparece quando há mais de um shell instalado.
 */
export function NewShellMenu({ defaultShell, onPick }: Props) {
  const [shells, setShells] = useState<ShellInfo[]>([])
  useEffect(() => {
    ipc
      .shellList()
      .then(setShells)
      .catch(() => setShells([]))
  }, [])
  if (shells.length < 2) return null
  const current = defaultShell === 'auto' ? shells[0]?.id : defaultShell
  return (
    <Menu onAction={(value) => onPick(String(value))}>
      <MenuTrigger
        className={`${actionButton} px-1.5`}
        aria-label="Nova aba com outro shell"
        title="Nova aba com outro shell"
      >
        <ChevronDown size={13} />
      </MenuTrigger>
      <MenuContent className={menuContent} aria-label="Shells">
        {shells.map((s) => (
          <MenuItem key={s.id} className={menuItem} value={s.id}>
            {s.label}
            {s.id === current && <span className="ml-auto text-[11px] text-muted">padrão</span>}
          </MenuItem>
        ))}
      </MenuContent>
    </Menu>
  )
}
