import { Copy, Regex, X } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { Scroller } from '../../lib/Scroller'
import { filterOutput, matchedText } from './blockNav'

interface Props {
  command: string
  output: string
  onCopy: (text: string) => void
  onClose: () => void
}

const toggle =
  'grid size-6 place-items-center rounded-md font-mono text-[11px] text-muted hover:bg-surface-hover hover:text-text aria-pressed:bg-accent aria-pressed:text-on-accent'

/**
 * Filtro da saída de um bloco: painel sobre o terminal com só as linhas que batem (texto ou regex).
 * A saída original continua intacta no xterm; aqui só se lê uma cópia. Esc fecha.
 */
export function BlockFilter({ command, output, onCopy, onClose }: Props) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [query, setQuery] = useState('')
  const [regex, setRegex] = useState(false)
  useEffect(() => inputRef.current?.focus(), [])
  const result = useMemo(() => filterOutput(output, query, regex), [output, query, regex])
  const shown = result.lines.slice(0, 2000)

  return (
    <section
      aria-label="Filtrar a saída do bloco"
      className="absolute inset-x-4 top-2 z-10 flex max-h-[70%] animate-pop-in flex-col rounded-[10px] border border-hairline bg-material-thick shadow-pop backdrop-blur-[28px] motion-reduce:animate-none"
    >
      <div className="flex items-center gap-1 p-1 pl-2">
        <input
          ref={inputRef}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Escape') {
              e.preventDefault()
              onClose()
            }
          }}
          placeholder={`Filtrar a saída de ${command.length > 40 ? `${command.slice(0, 40)}…` : command}`}
          aria-label="Filtro"
          className="min-w-0 flex-1 bg-transparent text-[13px] text-text outline-none placeholder:text-muted"
        />
        <span className="px-1 text-[11px] text-muted tabular-nums" aria-live="polite">
          {result.error ? 'regex inválida' : `${result.lines.length} de ${result.total} linhas`}
        </span>
        <button
          type="button"
          className={toggle}
          aria-pressed={regex}
          title="Usar expressão regular"
          aria-label="Usar expressão regular"
          onClick={() => setRegex((v) => !v)}
        >
          <Regex className="size-3.5" />
        </button>
        <button
          type="button"
          className={toggle}
          title="Copiar só as linhas que batem"
          aria-label="Copiar só as linhas que batem"
          disabled={result.lines.length === 0}
          onClick={() => onCopy(matchedText(result))}
        >
          <Copy className="size-3.5" />
        </button>
        <button type="button" className={toggle} title="Fechar (Esc)" aria-label="Fechar" onClick={onClose}>
          <X className="size-3.5" />
        </button>
      </div>
      {result.error ? (
        <p className="border-hairline border-t px-3 py-2 text-[11px] text-claude">{result.error}</p>
      ) : (
        <Scroller className="min-h-0 flex-1 border-hairline border-t">
          <pre className="m-0 px-3 py-2 font-mono text-[12px] leading-snug whitespace-pre-wrap text-text">
            {shown.map((l) => (
              <div key={l.n}>
                <span className="mr-2 inline-block w-8 text-right text-muted tabular-nums select-none">{l.n}</span>
                {l.text}
              </div>
            ))}
            {result.lines.length > shown.length && (
              <div className="text-muted">… mais {result.lines.length - shown.length} linhas (use Copiar)</div>
            )}
          </pre>
        </Scroller>
      )}
    </section>
  )
}
