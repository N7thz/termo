import { Menu, MenuContent, MenuGroup, MenuGroupLabel, MenuItem, MenuSeparator, MenuTrigger } from '@ui-sdk/react/menu'
import { Check, ChevronDown, Download, Hexagon } from 'lucide-react'
import { useState } from 'react'
import { ipc } from '../../lib/ipc'
import { menuContent, menuItem, menuSeparator } from '../../lib/ui'
import { INSTALL_FNM, installCommand, MANAGER_NAME, satisfies, switchCommand } from './commands'
import type { NodeInfo, NodeVersions } from './types'

const groupLabel = 'px-2.5 pt-1.5 pb-1 text-[11px] font-semibold tracking-[0.04em] text-muted uppercase'

interface Props {
  info: NodeInfo
  /** Cor do ícone (verde do tema do terminal). */
  color: string
  className?: string
  /** Só com o prompt ocioso dá para mandar o comando ao shell. */
  canRun: boolean
  /** Manda o comando ao shell da aba, como se fosse digitado. */
  onRun: (command: string) => void
}

/**
 * Versão do Node da aba, com a lista do gerenciador (fnm, nvm-windows ou Volta) para trocar.
 * A troca é um comando no próprio shell (`fnm use 20.11.0`): fica no histórico e, com o fnm, vale só
 * para esta aba. A versão nova aparece no próximo prompt.
 */
export function NodePicker({ info, color, className = '', canRun, onRun }: Props) {
  const [open, setOpen] = useState(false)
  const [list, setList] = useState<NodeVersions | null>(null)

  const onOpenChange = (next: boolean) => {
    setOpen(next)
    if (next) void ipc.nodeVersions().then(setList, () => setList({ manager: null, versions: [] }))
  }

  const run = (command: string) => {
    setOpen(false)
    onRun(command)
  }

  const label = info.version ? `v${info.version}` : 'sem node'
  const mismatch = info.wanted != null && info.version != null && !satisfies(info.version, info.wanted)
  const manager = list?.manager ?? null
  const wantedInstalled = info.wanted != null && list?.versions.some((v) => satisfies(v, info.wanted as string))

  return (
    <Menu open={open} onOpenChange={onOpenChange}>
      <MenuTrigger
        className={className}
        title={mismatch ? `Node ${label} — o projeto pede ${info.wanted}` : `Node ${label}: trocar de versão`}
        aria-label="Trocar a versão do Node"
      >
        <Hexagon aria-hidden size={12} className="flex-none" style={{ color }} />
        <span className="truncate">{label}</span>
        {mismatch && <span className="text-claude">≠ {info.wanted}</span>}
        <ChevronDown aria-hidden size={12} className="flex-none opacity-60" />
      </MenuTrigger>
      <MenuContent
        // font-sans: o menu herda a fonte do terminal da linha de contexto; os menus usam a da interface.
        className={`${menuContent} max-h-[min(420px,70vh)] max-w-[min(380px,90vw)] overflow-y-auto font-sans`}
        side="top"
        align="start"
        sideOffset={6}
        collisionPadding={8}
        aria-label="Versões do Node"
      >
        {!canRun && <div className="px-2.5 py-[5px] text-muted">Espere o comando atual terminar</div>}
        {list == null && <div className="px-2.5 py-[5px] text-muted">Procurando versões…</div>}
        {list && manager == null && (
          <>
            <div className="max-w-[300px] px-2.5 py-[5px] text-[12px] text-muted">
              Nenhum gerenciador de versões encontrado (fnm, nvm-windows ou Volta). Instale o fnm e abra uma aba nova
              para trocar de versão por aqui.
            </div>
            <MenuItem className={menuItem} disabled={!canRun} onSelect={() => run(INSTALL_FNM)}>
              <Download aria-hidden size={13} className="flex-none text-muted" />
              <span className="flex-1">Instalar o fnm</span>
              <span className="font-mono text-[11px] text-muted">winget</span>
            </MenuItem>
          </>
        )}
        {manager && (
          <MenuGroup>
            <MenuGroupLabel className={groupLabel}>Instaladas · {MANAGER_NAME[manager]}</MenuGroupLabel>
            {list?.versions.length === 0 && <div className="px-2.5 py-[5px] text-muted">Nenhuma versão instalada</div>}
            {list?.versions.map((v) => {
              const current = v === info.version
              return (
                <MenuItem
                  key={v}
                  className={menuItem}
                  disabled={!canRun}
                  onSelect={() => !current && run(switchCommand(manager, v))}
                >
                  <span className="grid size-3.5 flex-none place-items-center">
                    {current && <Check aria-hidden size={13} className="text-accent" />}
                  </span>
                  <span className={`flex-1 font-mono ${current ? 'font-[600]' : ''}`}>v{v}</span>
                  {info.wanted && satisfies(v, info.wanted) && (
                    <span className="text-[11px] text-muted">pedida pelo projeto</span>
                  )}
                </MenuItem>
              )
            })}
          </MenuGroup>
        )}
        {manager && (
          <>
            <MenuSeparator className={menuSeparator} />
            {info.wanted && !wantedInstalled && (
              <MenuItem
                className={menuItem}
                disabled={!canRun}
                onSelect={() => run(installCommand(manager, info.wanted as string))}
              >
                <Download aria-hidden size={13} className="flex-none text-muted" />
                <span className="flex-1">Instalar a {info.wanted} (pedida pelo projeto)</span>
              </MenuItem>
            )}
            <MenuItem className={menuItem} disabled={!canRun} onSelect={() => run(installCommand(manager, 'lts'))}>
              <Download aria-hidden size={13} className="flex-none text-muted" />
              <span className="flex-1">Instalar a LTS mais recente</span>
            </MenuItem>
          </>
        )}
      </MenuContent>
    </Menu>
  )
}
