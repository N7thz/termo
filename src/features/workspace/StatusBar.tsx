import { Button } from '@ui-sdk/react/button'
import { Folder, Search } from 'lucide-react'
import { ipc } from '../../lib/ipc'
import type { SessionKind } from '../../shared/types'
import { TabKindIcon } from '../tabs/TabKindIcon'
import { type DiffColors, GitBranch, GitDiff } from './GitDiff'
import type { TabInfo } from './useWorkspace'

interface Props {
  info: TabInfo
  kind: SessionKind | undefined
  shellName: string
  colors: DiffColors
  /** Abre a busca geral. */
  onSearch: () => void
  searchKeys?: string
}

const item =
  'inline-flex h-full min-w-0 items-center gap-2 rounded-[8px] px-2.5 text-muted [transition:background-color_140ms_ease-out,color_140ms_ease-out] hover:bg-surface-hover hover:text-text focus-visible:outline-2 focus-visible:outline-accent'

/** Rodapé com a pasta, a branch e as alterações da aba ativa, como nos editores. */
export function StatusBar({ info, kind, shellName, colors, onSearch, searchKeys }: Props) {
  const { cwd, git } = info
  return (
    <footer className="flex h-11 flex-none items-center gap-2 px-2.5 py-1.5 text-[12.5px] tracking-[0.005em] select-none">
      {cwd && (
        <Button
          className={`${item} max-w-[45%]`}
          title={`${cwd}\nClique para abrir no Explorador`}
          onClick={() => void ipc.openFolder(cwd)}
        >
          <Folder aria-hidden size={14} className="flex-none" />
          <span className="truncate">{cwd}</span>
        </Button>
      )}
      {git && (
        <Button
          className={item}
          title="Clique para copiar o nome da branch"
          onClick={() => void ipc.writeClipboard(git.branch ?? git.commit ?? '')}
        >
          <GitBranch git={git} />
        </Button>
      )}
      {git && <GitDiff git={git} colors={colors} className="px-1" />}
      <span className="flex-1" />
      <Button className={item} onClick={onSearch} title="Buscar abas, pastas e arquivos">
        <Search aria-hidden size={14} className="flex-none" /> Buscar
        {searchKeys && <kbd className="font-mono text-[10.5px] opacity-70">{searchKeys}</kbd>}
      </Button>
      <span className="inline-flex items-center gap-2 px-2.5 text-muted">
        <TabKindIcon kind={kind ?? 'shell'} size={14} />
        {kind === 'claude' ? 'Claude Code' : shellName}
      </span>
    </footer>
  )
}
