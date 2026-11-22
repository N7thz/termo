import type { ISearchOptions, SearchAddon } from '@xterm/addon-search'
import type { ITheme } from '@xterm/xterm'
import { ArrowDown, ArrowUp, Regex, X } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'

interface Props {
  search: SearchAddon
  theme: ITheme
  onClose: () => void
}

const toggle =
  'grid size-6 place-items-center rounded-md font-mono text-[11px] text-muted hover:bg-surface-hover hover:text-text aria-pressed:bg-accent aria-pressed:text-on-accent'
const navButton =
  'grid size-6 place-items-center rounded-md text-muted hover:bg-surface-hover hover:text-text disabled:opacity-40'

/**
 * Busca na saída (Ctrl+Shift+F): destaca todas as ocorrências, Enter/Shift+Enter navega,
 * Esc fecha e volta o foco ao terminal.
 */
export function SearchBar({ search, theme, onClose }: Props) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [query, setQuery] = useState('')
  const [caseSensitive, setCaseSensitive] = useState(false)
  const [regex, setRegex] = useState(false)
  const [results, setResults] = useState<{ index: number; count: number }>({ index: -1, count: 0 })

  const options: ISearchOptions = {
    caseSensitive,
    regex,
    decorations: {
      matchBackground: (theme.selectionBackground as string) ?? '#444444',
      matchBorder: (theme.yellow as string) ?? '#e0af68',
      matchOverviewRuler: (theme.yellow as string) ?? '#e0af68',
      activeMatchBackground: (theme.yellow as string) ?? '#e0af68',
      activeMatchBorder: (theme.yellow as string) ?? '#e0af68',
      activeMatchColorOverviewRuler: (theme.brightYellow as string) ?? '#ffc777',
    },
  }

  useEffect(() => {
    inputRef.current?.focus()
    inputRef.current?.select()
    const sub = search.onDidChangeResults((r) => setResults({ index: r.resultIndex, count: r.resultCount }))
    return () => {
      sub.dispose()
      search.clearDecorations()
    }
  }, [search])

  // biome-ignore lint/correctness/useExhaustiveDependencies: refaz a busca quando o texto ou as opções mudam
  useEffect(() => {
    if (!query) {
      search.clearDecorations()
      setResults({ index: -1, count: 0 })
      return
    }
    search.findNext(query, { ...options, incremental: true })
  }, [query, caseSensitive, regex])

  const next = () => query && search.findNext(query, options)
  const prev = () => query && search.findPrevious(query, options)

  return (
    <search className="absolute top-2 right-4 z-10 flex animate-pop-in items-center gap-1 rounded-[10px] border border-hairline bg-material-thick p-1 pl-2 shadow-pop backdrop-blur-[28px] motion-reduce:animate-none">
      <input
        ref={inputRef}
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault()
            if (e.shiftKey) prev()
            else next()
          } else if (e.key === 'Escape') {
            e.preventDefault()
            onClose()
          }
        }}
        placeholder="Buscar na saída…"
        aria-label="Buscar na saída do terminal"
        className="w-52 bg-transparent py-1 text-[13px] text-text outline-none placeholder:text-muted"
      />
      <span className="min-w-12 text-right font-mono text-[11px] text-muted tabular-nums" aria-live="polite">
        {query ? (results.count > 0 ? `${results.index + 1}/${results.count}` : '0') : ''}
      </span>
      <button
        type="button"
        className={toggle}
        aria-pressed={caseSensitive}
        title="Diferenciar maiúsculas"
        onClick={() => setCaseSensitive((v) => !v)}
      >
        Aa
      </button>
      <button
        type="button"
        className={toggle}
        aria-pressed={regex}
        title="Expressão regular"
        onClick={() => setRegex((v) => !v)}
      >
        <Regex size={14} />
      </button>
      <button
        type="button"
        className={navButton}
        disabled={!results.count}
        title="Anterior (Shift+Enter)"
        onClick={prev}
      >
        <ArrowUp size={14} />
      </button>
      <button type="button" className={navButton} disabled={!results.count} title="Próxima (Enter)" onClick={next}>
        <ArrowDown size={14} />
      </button>
      <button type="button" className={navButton} title="Fechar (Esc)" aria-label="Fechar busca" onClick={onClose}>
        <X size={14} />
      </button>
    </search>
  )
}
