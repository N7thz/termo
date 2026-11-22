import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandGroupLabel,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
  CommandShortcut,
} from '@ui-sdk/react/command'
import { Dialog, DialogBackdrop, DialogContent, DialogTitle } from '@ui-sdk/react/dialog'
import { File, History, Search } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { ipc } from '../../lib/ipc'
import type { FileHit } from '../../shared/types'
import { TabKindIcon } from '../tabs/TabKindIcon'
import type { Tab } from '../tabs/tabs'
import { folderName, shortPath } from '../workspace/format'
import type { TabInfo } from '../workspace/useWorkspace'

export interface PaletteAction {
  id: string
  label: string
  /** Atalho no formato do UI SDK (`mod+shift+t`), só para mostrar. */
  keys?: string
  run: () => void
}

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  tabs: readonly Tab[]
  active: number | null
  info: (key: number) => TabInfo
  actions: readonly PaletteAction[]
  onActivateTab: (key: number) => void
  /** Vai para a pasta na aba ativa (`cd`). */
  onGoToFolder: (path: string) => void
}

const ITEM =
  'flex cursor-default items-center gap-2.5 rounded-md px-2.5 py-1.5 text-[13px] outline-none select-none data-highlighted:bg-surface-hover [&_[data-slot=command-shortcut]]:ml-auto [&_[data-slot=command-shortcut]]:font-mono [&_[data-slot=command-shortcut]]:text-[11px] [&_[data-slot=command-shortcut]]:text-muted'
const GROUP_LABEL = 'px-2.5 pt-2 pb-1 text-[10px] font-semibold tracking-[0.06em] text-muted uppercase'
const ICON = 'flex w-4 flex-none justify-center text-muted'

/**
 * Busca geral (Ctrl+Shift+P): abas abertas, pastas recentes, arquivos da pasta da aba ativa
 * e ações do app, numa lista só com correspondência difusa.
 */
export function CommandPalette({
  open,
  onOpenChange,
  tabs,
  active,
  info,
  actions,
  onActivateTab,
  onGoToFolder,
}: Props) {
  const [query, setQuery] = useState('')
  const [dirs, setDirs] = useState<string[]>([])
  const [files, setFiles] = useState<FileHit[]>([])
  const cwd = active == null ? null : info(active).cwd
  const seq = useRef(0)

  useEffect(() => {
    if (!open) return
    setQuery('')
    setFiles([])
    void ipc
      .recentDirs(40)
      .then(setDirs)
      .catch(() => setDirs([]))
  }, [open])

  // Arquivos vêm do Rust a cada pausa na digitação (só com texto: sem busca, a lista fica curta).
  useEffect(() => {
    if (!open || !cwd || !query.trim()) {
      setFiles([])
      return
    }
    const mine = ++seq.current
    const t = setTimeout(() => {
      void ipc
        .searchFiles(cwd, query, 30)
        .then((hits) => mine === seq.current && setFiles(hits))
        .catch(() => undefined)
    }, 120)
    return () => clearTimeout(t)
  }, [open, cwd, query])

  const close = () => onOpenChange(false)

  const run = (value: string) => {
    const [kind, ...rest] = value.split(':')
    const arg = rest.join(':')
    close()
    if (kind === 'tab') onActivateTab(Number(arg))
    else if (kind === 'dir') onGoToFolder(arg)
    else if (kind === 'file' && cwd) {
      void ipc.openInEditor(arg, undefined, undefined, cwd).catch((err) => console.warn('[termo]', err))
    } else if (kind === 'action') actions.find((a) => a.id === arg)?.run()
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogBackdrop className="fixed inset-0 bg-black/30 transition-opacity duration-150 data-ending-style:opacity-0 data-starting-style:opacity-0" />
      <DialogContent className="mx-auto mt-[12vh] flex max-h-[min(520px,70vh)] w-[min(640px,calc(100vw-48px))] origin-top flex-col overflow-hidden rounded-[14px] border border-hairline bg-material-thick p-0 text-text shadow-panel backdrop-blur-[28px] backdrop-saturate-180 [transition:opacity_140ms_ease-out,scale_220ms_var(--spring-soft)] data-ending-style:scale-[0.98] data-ending-style:opacity-0 data-starting-style:scale-[0.98] data-starting-style:opacity-0 reduced-transparency:bg-surface reduced-transparency:backdrop-blur-none motion-reduce:scale-100">
        <DialogTitle className="sr-only">Busca geral</DialogTitle>
        <Command filter="fuzzy" loop onAction={run} onQueryChange={setQuery} className="flex min-h-0 flex-1 flex-col">
          <div className="flex items-center gap-2 border-b border-hairline px-4">
            <Search aria-hidden size={16} className="flex-none text-muted" />
            <CommandInput
              aria-label="Buscar abas, pastas, arquivos e ações"
              placeholder="Buscar abas, pastas, arquivos e ações…"
              className="h-11 min-w-0 flex-1 bg-transparent text-[14px] text-text outline-none placeholder:text-muted"
            />
          </div>
          <CommandEmpty className="px-4 py-6 text-center text-[13px] text-muted">Nada encontrado.</CommandEmpty>
          <CommandList className="min-h-0 flex-1 overflow-y-auto p-1.5">
            <CommandGroup>
              <CommandGroupLabel className={GROUP_LABEL}>Abas</CommandGroupLabel>
              {tabs.map((tab) => {
                const { cwd: tabCwd, git } = info(tab.key)
                return (
                  <CommandItem
                    key={tab.key}
                    value={`tab:${tab.key}`}
                    label={tab.title}
                    keywords={[tabCwd ?? '', git?.branch ?? '']}
                    className={ITEM}
                  >
                    <span className={ICON}>
                      <TabKindIcon kind={tab.kind} />
                    </span>
                    <span className="truncate">{tab.title}</span>
                    {tabCwd && <span className="truncate text-[12px] text-muted">{shortPath(tabCwd)}</span>}
                    {tab.key === active && <span className="ml-auto text-[11px] text-muted">atual</span>}
                  </CommandItem>
                )
              })}
            </CommandGroup>

            {files.length > 0 && (
              <>
                <CommandSeparator className="mx-1 my-1 h-px bg-hairline" />
                <CommandGroup>
                  <CommandGroupLabel className={GROUP_LABEL}>Arquivos em {folderName(cwd)}</CommandGroupLabel>
                  {files.map((f) => (
                    <CommandItem key={f.path} value={`file:${f.path}`} label={f.path} className={ITEM}>
                      <span className={ICON}>
                        <File size={13} />
                      </span>
                      <span className="truncate">{f.path.split('/').pop()}</span>
                      <span className="truncate text-[12px] text-muted">{f.path}</span>
                    </CommandItem>
                  ))}
                </CommandGroup>
              </>
            )}

            {dirs.length > 0 && (
              <>
                <CommandSeparator className="mx-1 my-1 h-px bg-hairline" />
                <CommandGroup>
                  <CommandGroupLabel className={GROUP_LABEL}>Pastas recentes (cd na aba atual)</CommandGroupLabel>
                  {dirs.map((dir) => (
                    <CommandItem key={dir} value={`dir:${dir}`} label={dir} className={ITEM}>
                      <span className={ICON}>
                        <History size={13} />
                      </span>
                      <span className="truncate">{folderName(dir)}</span>
                      <span className="truncate text-[12px] text-muted">{dir}</span>
                    </CommandItem>
                  ))}
                </CommandGroup>
              </>
            )}

            <CommandSeparator className="mx-1 my-1 h-px bg-hairline" />
            <CommandGroup>
              <CommandGroupLabel className={GROUP_LABEL}>Ações</CommandGroupLabel>
              {actions.map((a) => (
                <CommandItem key={a.id} value={`action:${a.id}`} label={a.label} shortcut={a.keys} className={ITEM}>
                  <span className={ICON}>›</span>
                  <span className="truncate">{a.label}</span>
                  {a.keys && <CommandShortcut />}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </DialogContent>
    </Dialog>
  )
}
