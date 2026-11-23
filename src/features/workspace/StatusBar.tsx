import { Button } from '@ui-sdk/react/button'
import { Folder, Search } from 'lucide-react'
import { ipc } from '../../lib/ipc'
import type { SessionKind } from '../../shared/types'
import { BranchPicker } from '../git-branch/BranchPicker'
import { modeLabel } from '../shell-profiles/modes'
import { TabKindIcon } from '../tabs/TabKindIcon'
import { type DiffColors, GitDiff } from './GitDiff'
import type { TabInfo } from './useWorkspace'

interface Props {
  info: TabInfo
  kind: SessionKind | undefined
  /** Id do shell da aba ativa (`pwsh`, `cmd`, `wsl:Ubuntu`...). */
  shell?: string
  shellName: string
  colors: DiffColors
  /** Abre a busca geral. */
  onSearch: () => void
  searchKeys?: string
}

/** Cada item é um botão de verdade: borda fina, fundo da superfície e pressão no clique. */
const chip =
  'inline-flex h-7 min-w-0 items-center gap-1.5 rounded-[7px] border border-border bg-surface px-2 text-muted shadow-[inset_0_1px_0_var(--highlight)]'
const item = `${chip} [transition:background-color_140ms_ease-out,color_140ms_ease-out,scale_300ms_var(--spring)] hover:bg-surface-hover hover:text-text active:scale-[0.96] active:duration-50 data-open:bg-surface-hover data-open:text-text focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-accent motion-reduce:active:scale-100`

/** Rodapé com a pasta, a branch e as alterações da aba ativa, como nos editores. */
export function StatusBar({ info, kind, shell, shellName, colors, onSearch, searchKeys }: Props) {
  const { cwd, git } = info
  return (
    <footer className="flex h-10 flex-none items-center gap-1.5 px-2.5 py-1.5 text-[12.5px] tracking-[0.005em] select-none">
      {cwd && (
        <Button
          className={`${item} max-w-[45%]`}
          title={`${cwd}\nClique para abrir no Explorador`}
          onClick={() => void ipc.openFolder(cwd)}
        >
          <Folder aria-hidden size={13} className="flex-none" />
          <span className="truncate">{cwd}</span>
        </Button>
      )}
      {git && cwd && <BranchPicker cwd={cwd} git={git} className={item} />}
      {git && <GitDiff git={git} colors={colors} className="px-1" />}
      <span className="flex-1" />
      <Button className={item} onClick={onSearch} title="Buscar abas, pastas e arquivos">
        <Search aria-hidden size={13} className="flex-none" /> Buscar
        {searchKeys && <kbd className="font-mono text-[10.5px] opacity-70">{searchKeys}</kbd>}
      </Button>
      <span className={chip}>
        <TabKindIcon kind={kind ?? 'shell'} shell={shell} size={14} />
        {kind === 'claude' || shell ? modeLabel(kind ?? 'shell', shell) : shellName}
      </span>
    </footer>
  )
}
