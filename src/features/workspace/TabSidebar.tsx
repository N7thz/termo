import { Button } from '@ui-sdk/react/button'
import { useMemo, useState } from 'react'
import type { Tab } from '../tabs/tabs'
import { shortPath } from './format'
import { type DiffColors, GitBranch, GitDiff } from './GitDiff'
import type { TabInfo } from './useWorkspace'

interface Props {
  tabs: readonly Tab[]
  active: number | null
  info: (key: number) => TabInfo
  colors: DiffColors
  onActivate: (key: number) => void
  onClose: (key: number) => void
  onNew: () => void
  /** Alertas de erro/aviso por aba (o mesmo contador da barra de abas). */
  renderAlert?: (key: number) => React.ReactNode
}

/** Abas em lista na lateral: título, pasta, branch e +/- de cada uma, com busca. */
export function TabSidebar({ tabs, active, info, colors, onActivate, onClose, onNew, renderAlert }: Props) {
  const [query, setQuery] = useState('')

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return tabs
    return tabs.filter((t) => {
      const { cwd, git } = info(t.key)
      return [t.title, cwd, git?.branch].some((s) => s?.toLowerCase().includes(q))
    })
  }, [tabs, query, info])

  return (
    <aside
      className="flex w-60 flex-none flex-col border-r border-hairline bg-material reduced-transparency:bg-surface"
      aria-label="Abas"
    >
      <div className="flex items-center gap-1 p-2">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => e.key === 'Escape' && setQuery('')}
          placeholder="Buscar abas…"
          aria-label="Buscar abas"
          className="h-7 min-w-0 flex-1 rounded-[7px] border border-border bg-field px-2 text-[12px] text-text outline-none placeholder:text-muted focus-visible:border-accent"
        />
        <Button
          className="grid size-7 place-items-center rounded-[7px] text-muted hover:bg-surface-hover hover:text-text"
          aria-label="Nova aba"
          onClick={onNew}
        >
          +
        </Button>
      </div>
      <nav className="flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto px-2 pb-2">
        {visible.map((tab) => {
          const { cwd, git } = info(tab.key)
          const isActive = tab.key === active
          return (
            <div
              key={tab.key}
              className="group/item relative flex flex-col gap-0.5 rounded-lg px-2.5 py-2 text-[12px] text-muted hover:bg-surface-hover data-active:bg-surface data-active:text-text data-active:shadow-tab"
              data-active={isActive || undefined}
              onAuxClick={(e) => e.button === 1 && onClose(tab.key)}
            >
              <button
                type="button"
                className="absolute inset-0 rounded-lg outline-none focus-visible:outline-2 focus-visible:outline-accent"
                aria-current={isActive ? 'page' : undefined}
                aria-label={`${tab.title}${cwd ? `, ${cwd}` : ''}`}
                onClick={() => onActivate(tab.key)}
              />
              <span className="pointer-events-none flex items-center gap-1.5">
                <span
                  className={`font-mono text-[11px] font-semibold ${tab.kind === 'claude' ? 'text-claude' : 'text-accent'}`}
                >
                  {tab.kind === 'claude' ? '✦' : '›_'}
                </span>
                <span className="min-w-0 flex-1 truncate text-[12.5px] font-medium">{tab.title}</span>
                {renderAlert?.(tab.key)}
              </span>
              {cwd && (
                <span className="pointer-events-none truncate" title={cwd}>
                  {shortPath(cwd, 2)}
                </span>
              )}
              {git && (
                <span className="pointer-events-none flex items-center justify-between gap-2 text-[11px]">
                  <GitBranch git={git} />
                  <GitDiff git={git} colors={colors} />
                </span>
              )}
              <Button
                className="absolute top-1.5 right-1.5 grid size-5 place-items-center rounded-[5px] text-[14px] leading-none opacity-0 group-hover/item:opacity-70 group-data-active/item:opacity-70 hover:bg-border hover:opacity-100"
                tabIndex={-1}
                aria-label={`Fechar ${tab.title}`}
                onClick={() => onClose(tab.key)}
              >
                ×
              </Button>
            </div>
          )
        })}
        {visible.length === 0 && <p className="m-0 px-2 py-3 text-center text-[12px] text-muted">Nenhuma aba.</p>}
      </nav>
    </aside>
  )
}
