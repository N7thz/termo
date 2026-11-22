import { Button } from '@ui-sdk/react/button'
import { ipc } from '../../lib/ipc'
import type { SessionKind } from '../../shared/types'
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
  'inline-flex h-full min-w-0 items-center gap-1.5 rounded-[5px] px-1.5 text-muted hover:bg-surface-hover hover:text-text focus-visible:outline-2 focus-visible:outline-accent'

/** Rodapé com a pasta, a branch e as alterações da aba ativa, como nos editores. */
export function StatusBar({ info, kind, shellName, colors, onSearch, searchKeys }: Props) {
  const { cwd, git } = info
  return (
    <footer className="flex h-6 flex-none items-center gap-1 border-t border-hairline bg-material px-1.5 text-[11.5px] select-none reduced-transparency:bg-surface">
      {cwd && (
        <Button
          className={`${item} max-w-[45%]`}
          title={`${cwd}\nClique para abrir no Explorador`}
          onClick={() => void ipc.openFolder(cwd)}
        >
          <span aria-hidden>📁</span>
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
        <span aria-hidden>⌕</span> Buscar
        {searchKeys && <kbd className="font-mono text-[10px] opacity-70">{searchKeys}</kbd>}
      </Button>
      <span className="px-1.5 text-muted">{kind === 'claude' ? '✦ Claude Code' : shellName}</span>
    </footer>
  )
}
