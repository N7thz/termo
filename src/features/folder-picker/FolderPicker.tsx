import { open as openDialog } from '@tauri-apps/plugin-dialog'
import { Menu, MenuContent, MenuGroup, MenuGroupLabel, MenuItem, MenuSeparator, MenuTrigger } from '@ui-sdk/react/menu'
import { ArrowUp, ChevronDown, Clock, ExternalLink, Folder, FolderOpen } from 'lucide-react'
import { useState } from 'react'
import { ipc } from '../../lib/ipc'
import { menuContent, menuItem, menuSeparator } from '../../lib/ui'
import { cdCommand, folderName, otherRecent, parentDir } from './commands'

const groupLabel = 'px-2.5 pt-1.5 pb-1 text-[11px] font-semibold tracking-[0.04em] text-muted uppercase'

interface Props {
  cwd: string
  className?: string
  /** Só com o prompt ocioso dá para mandar o `cd` ao shell. */
  canRun: boolean
  /** Manda o comando ao shell da aba, como se fosse digitado. */
  onRun: (command: string) => void
}

/**
 * Pasta atual da aba, com um menu para trocar: escolher no seletor do Windows, subir uma pasta, ir para uma
 * pasta recente ou abrir a atual no Explorador. A troca é um `cd` no próprio shell (fica no histórico).
 */
export function FolderPicker({ cwd, className = '', canRun, onRun }: Props) {
  const [open, setOpen] = useState(false)
  const [recent, setRecent] = useState<string[] | null>(null)
  const parent = parentDir(cwd)

  const onOpenChange = (next: boolean) => {
    setOpen(next)
    if (next)
      void ipc.recentDirs(30).then(
        (list) => setRecent(otherRecent(list, cwd)),
        () => setRecent([]),
      )
  }

  const go = (dir: string) => {
    setOpen(false)
    onRun(cdCommand(dir))
  }

  const choose = async () => {
    setOpen(false)
    const picked = await openDialog({ directory: true, multiple: false, defaultPath: cwd, title: 'Trocar de pasta' })
    if (typeof picked === 'string' && picked) onRun(cdCommand(picked))
  }

  return (
    <Menu open={open} onOpenChange={onOpenChange}>
      <MenuTrigger className={className} title={`${cwd}\nClique para trocar de pasta`} aria-label="Trocar de pasta">
        <Folder aria-hidden size={12} className="flex-none text-muted" />
        <span className="truncate">{cwd}</span>
        <ChevronDown aria-hidden size={12} className="flex-none opacity-60" />
      </MenuTrigger>
      <MenuContent
        className={`${menuContent} max-h-[min(420px,70vh)] max-w-[min(420px,90vw)] overflow-y-auto`}
        side="top"
        align="start"
        sideOffset={6}
        collisionPadding={8}
        aria-label="Trocar de pasta"
      >
        {!canRun && <div className="px-2.5 py-[5px] text-muted">Espere o comando atual terminar</div>}
        <MenuItem className={menuItem} disabled={!canRun} onSelect={() => void choose()}>
          <FolderOpen aria-hidden size={13} className="flex-none text-muted" />
          <span className="flex-1">Escolher pasta…</span>
        </MenuItem>
        {parent && (
          <MenuItem className={menuItem} disabled={!canRun} onSelect={() => go(parent)}>
            <ArrowUp aria-hidden size={13} className="flex-none text-muted" />
            <span className="flex-1">Pasta acima</span>
            <span className="max-w-[180px] truncate text-[11px] text-muted">{folderName(parent)}</span>
          </MenuItem>
        )}
        {recent && recent.length > 0 && (
          <>
            <MenuSeparator className={menuSeparator} />
            <MenuGroup>
              <MenuGroupLabel className={groupLabel}>Recentes</MenuGroupLabel>
              {recent.map((dir) => (
                <MenuItem key={dir} className={menuItem} disabled={!canRun} onSelect={() => go(dir)} title={dir}>
                  <Clock aria-hidden size={13} className="flex-none text-muted" />
                  <span className="flex-none">{folderName(dir)}</span>
                  <span className="min-w-0 flex-1 truncate text-right text-[11px] text-muted">{dir}</span>
                </MenuItem>
              ))}
            </MenuGroup>
          </>
        )}
        <MenuSeparator className={menuSeparator} />
        <MenuItem
          className={menuItem}
          onSelect={() => {
            setOpen(false)
            void ipc.openFolder(cwd)
          }}
        >
          <ExternalLink aria-hidden size={13} className="flex-none text-muted" />
          <span className="flex-1">Abrir no Explorador</span>
        </MenuItem>
      </MenuContent>
    </Menu>
  )
}
