import type { ITheme } from '@xterm/xterm'
import type { CSSProperties } from 'react'
import type { GitInfo } from '../../shared/types'
import { FolderPicker } from '../folder-picker/FolderPicker'
import { BranchPicker } from '../git-branch/BranchPicker'
import { NodePicker } from '../node-version/NodePicker'
import { ScriptsMenu } from '../node-version/ScriptsMenu'
import type { NodeInfo } from '../node-version/types'

interface Props {
  cwd: string | null
  git: GitInfo | null
  node: NodeInfo | null
  theme: ITheme
  fontFamily: string
  fontSize: number
  /** Prompt ocioso: dá para mandar um comando ao shell (trocar o Node ou a pasta). */
  idle: boolean
  /** Família do shell da aba: no cmd e no WSL a pasta é só um texto (o seletor roda `Set-Location`) e no WSL o git e o node do Windows não valem. */
  family?: 'pwsh' | 'powershell' | 'cmd' | 'bash' | 'wsl'
  onRun: (command: string) => void
}

const chip =
  'inline-flex h-[1.7em] min-w-0 items-center gap-1 rounded-[6px] border border-border bg-surface/60 px-1.5 [transition:background-color_140ms_ease-out,scale_300ms_var(--spring)] hover:bg-surface-hover active:scale-[0.96] active:duration-50 data-open:bg-surface-hover focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-accent motion-reduce:active:scale-100'

const themeColor = (theme: ITheme, key: keyof ITheme) =>
  typeof theme[key] === 'string' ? (theme[key] as string) : 'var(--accent)'

/**
 * Linha de contexto acima da entrada, como a do Warp: versão do Node (em projetos Node, com troca de
 * versão), pasta atual e branch do git. As cores vêm da paleta do terminal do tema.
 */
export function ContextBar({ cwd, git, node, theme, fontFamily, fontSize, idle, family, onRun }: Props) {
  if (!cwd) return null
  const powershell = !family || family === 'pwsh' || family === 'powershell'
  const wsl = family === 'wsl'
  const green = themeColor(theme, 'green')
  return (
    <div
      className="flex min-w-0 flex-none items-center gap-1.5 pt-2 select-none"
      style={{ fontFamily, fontSize: Math.round(fontSize * 0.86), '--ctx-branch': green } as CSSProperties}
    >
      {node?.project && powershell && (
        <NodePicker info={node} color={green} className={`${chip} text-text`} canRun={idle} onRun={onRun} />
      )}
      {node?.project && !wsl && (
        <ScriptsMenu
          info={node}
          color={green}
          className={`${chip} text-text`}
          family={family}
          canRun={idle}
          onRun={onRun}
        />
      )}
      {powershell ? (
        <FolderPicker cwd={cwd} className={`${chip} max-w-[50%] text-text`} canRun={idle} onRun={onRun} />
      ) : (
        <span className={`${chip} max-w-[50%] truncate text-text`} title={cwd}>
          {cwd}
        </span>
      )}
      {git && !wsl && <BranchPicker cwd={cwd} git={git} className={`${chip} text-(--ctx-branch)`} />}
    </div>
  )
}
