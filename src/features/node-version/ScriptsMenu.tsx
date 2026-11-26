import { Menu, MenuContent, MenuGroup, MenuGroupLabel, MenuItem, MenuTrigger } from '@ui-sdk/react/menu'
import { ChevronDown, Play } from 'lucide-react'
import { useState } from 'react'
import { Scroller } from '../../lib/Scroller'
import { menuContent, menuItem } from '../../lib/ui'
import { runScriptCommand, type ShellFamily, sortScripts } from './scripts'
import type { NodeInfo } from './types'

const groupLabel = 'px-2.5 pt-1.5 pb-1 text-[11px] font-semibold tracking-[0.04em] text-muted uppercase'

interface Props {
  info: NodeInfo
  /** Cor do ícone (do tema do terminal). */
  color: string
  className?: string
  family?: ShellFamily
  /** Só com o prompt ocioso dá para mandar o comando ao shell. */
  canRun: boolean
  /** Manda o comando ao shell da aba, como se fosse digitado. */
  onRun: (command: string) => void
}

/**
 * Scripts do package.json da pasta, como o "NPM Scripts" do VS Code: um clique roda o script nesta aba
 * com o gerenciador do projeto (`npm run dev`, `bun run build`...). O comando fica no histórico do shell.
 */
export function ScriptsMenu({ info, color, className = '', family, canRun, onRun }: Props) {
  const [open, setOpen] = useState(false)
  const pm = info.packageManager ?? 'npm'
  const scripts = sortScripts(info.scripts)
  if (scripts.length === 0) return null

  return (
    <Menu open={open} onOpenChange={setOpen}>
      <MenuTrigger
        className={className}
        title={`Rodar um script do package.json (${pm})`}
        aria-label="Rodar um script do package.json"
      >
        <Play aria-hidden size={11} className="flex-none" style={{ color }} />
        <span className="truncate">Scripts</span>
        <ChevronDown aria-hidden size={12} className="flex-none opacity-60" />
      </MenuTrigger>
      <MenuContent
        // font-sans: o menu herda a fonte do terminal da linha de contexto; os menus usam a da interface.
        className={`${menuContent} max-w-[min(440px,90vw)] font-sans`}
        side="top"
        align="start"
        sideOffset={6}
        collisionPadding={8}
        aria-label="Scripts do package.json"
      >
        <Scroller viewportClassName="max-h-[min(420px,70vh)] min-h-0">
          {!canRun && <div className="px-2.5 py-[5px] text-muted">Espere o comando atual terminar</div>}
          <MenuGroup>
            <MenuGroupLabel className={groupLabel}>Scripts · {pm} run</MenuGroupLabel>
            {scripts.map((s) => {
              const command = runScriptCommand(pm, s.name, family)
              return (
                <MenuItem
                  key={s.name}
                  className={menuItem}
                  disabled={!canRun || command == null}
                  title={command ?? 'Nome de script que não dá para digitar neste shell'}
                  onSelect={() => {
                    setOpen(false)
                    if (command) onRun(command)
                  }}
                >
                  <Play aria-hidden size={11} className="flex-none text-muted" />
                  <span className="flex-none font-mono">{s.name}</span>
                  <span className="min-w-0 flex-1 truncate text-right font-mono text-[11px] text-muted">
                    {s.command}
                  </span>
                </MenuItem>
              )
            })}
          </MenuGroup>
        </Scroller>
      </MenuContent>
    </Menu>
  )
}
