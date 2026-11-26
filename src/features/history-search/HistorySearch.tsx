import { Folder, History, X } from 'lucide-react'
import { type KeyboardEvent, useEffect, useMemo, useRef, useState } from 'react'
import { ipc } from '../../lib/ipc'
import { Scroller } from '../../lib/Scroller'
import { type HistoryEntry, type LoggedCommand, mergeHistory, oneLine, searchHistory } from './history'

interface Props {
  fontFamily: string
  fontSize: number
  /** Texto já digitado no prompt: vira a busca inicial. */
  initialQuery: string
  /** Pasta atual da aba (para o filtro "só nesta pasta"). */
  cwd: string | null
  /** Comandos que rodaram nesta aba, do mais antigo ao mais novo. */
  session: () => readonly LoggedCommand[]
  /** Enter põe o comando na linha sem rodar; Shift+Enter roda. */
  onPick: (command: string, run: boolean) => void
  onClose: () => void
}

const HISTORY_LIMIT = 5000

/** Letras que combinaram em destaque (cor de destaque do tema), o resto normal. */
function Highlighted({ text, positions }: { text: string; positions: readonly number[] }) {
  if (positions.length === 0) return <>{text}</>
  const hit = new Set(positions)
  const parts: { text: string; on: boolean }[] = []
  for (let i = 0; i < text.length; i++) {
    const on = hit.has(i)
    const last = parts[parts.length - 1]
    if (last && last.on === on) last.text += text[i]
    else parts.push({ text: text[i], on })
  }
  return (
    <>
      {parts.map((p, i) =>
        p.on ? (
          // biome-ignore lint/suspicious/noArrayIndexKey: as partes só mudam junto com a busca
          <span key={i} className="font-semibold text-accent">
            {p.text}
          </span>
        ) : (
          // biome-ignore lint/suspicious/noArrayIndexKey: as partes só mudam junto com a busca
          <span key={i}>{p.text}</span>
        ),
      )}
    </>
  )
}

/**
 * Busca no histórico (Ctrl+R), no estilo do Warp: lista sobreposta com busca aproximada sobre os comandos
 * desta aba e o histórico do PSReadLine. Tab alterna "só nesta pasta"; Enter põe o comando na linha,
 * Shift+Enter roda, Esc fecha.
 */
export function HistorySearch({ fontFamily, fontSize, initialQuery, cwd, session, onPick, onClose }: Props) {
  const [query, setQuery] = useState(initialQuery)
  const [here, setHere] = useState(false)
  const [selected, setSelected] = useState(0)
  const [file, setFile] = useState<string[] | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLUListElement>(null)

  useEffect(() => {
    inputRef.current?.focus()
    inputRef.current?.select()
    let alive = true
    ipc
      .historyRead(HISTORY_LIMIT)
      .then((lines) => alive && setFile(lines))
      .catch(() => alive && setFile([]))
    return () => {
      alive = false
    }
  }, [])

  // Os comandos da sessão são lidos uma vez ao abrir: a aba está ociosa enquanto a lista aparece.
  // biome-ignore lint/correctness/useExhaustiveDependencies: `session` é uma função estável da aba; relê só quando o arquivo chega
  const entries = useMemo<HistoryEntry[]>(() => mergeHistory(session(), file ?? []), [file])
  const results = useMemo(() => searchHistory(entries, query, cwd, here), [entries, query, cwd, here])

  // biome-ignore lint/correctness/useExhaustiveDependencies: volta ao topo quando a busca ou o filtro mudam
  useEffect(() => setSelected(0), [query, here])
  useEffect(() => {
    listRef.current?.children[selected]?.scrollIntoView({ block: 'nearest' })
  }, [selected])

  const move = (to: number) => setSelected(Math.max(0, Math.min(results.length - 1, to)))
  const pick = (run: boolean) => {
    const r = results[selected]
    if (r) onPick(r.item.command, run)
  }

  const onKeyDown = (e: KeyboardEvent<HTMLElement>) => {
    if (e.nativeEvent.isComposing) return
    const key = e.key
    if (key === 'Escape') {
      e.preventDefault()
      e.stopPropagation()
      onClose()
    } else if (key === 'Enter') {
      e.preventDefault()
      pick(e.shiftKey)
    } else if (key === 'ArrowDown' || (e.ctrlKey && key.toLowerCase() === 'r')) {
      e.preventDefault()
      move(selected + 1)
    } else if (key === 'ArrowUp') {
      e.preventDefault()
      move(selected - 1)
    } else if (key === 'PageDown') {
      e.preventDefault()
      move(selected + 8)
    } else if (key === 'PageUp') {
      e.preventDefault()
      move(selected - 8)
    } else if (key === 'Tab') {
      e.preventDefault()
      setHere((v) => !v)
    }
  }

  return (
    <div
      role="dialog"
      aria-label="Buscar no histórico"
      className="absolute inset-x-4 bottom-4 z-30 flex max-h-[min(70%,420px)] animate-pop-in flex-col overflow-hidden rounded-[12px] border border-border bg-surface text-text shadow-card motion-reduce:animate-none"
      onKeyDown={onKeyDown}
    >
      <div className="flex items-center gap-2 border-b border-border px-3">
        <History aria-hidden size={14} className="flex-none text-muted" />
        <input
          ref={inputRef}
          aria-label="Buscar no histórico"
          aria-controls="history-results"
          placeholder="Buscar no histórico…"
          value={query}
          onChange={(e) => setQuery(e.currentTarget.value)}
          spellCheck={false}
          autoComplete="off"
          className="h-10 min-w-0 flex-1 bg-transparent text-[13px] text-text outline-none placeholder:text-muted"
          style={{ fontFamily }}
        />
        <button
          type="button"
          aria-pressed={here}
          title="Só os comandos rodados nesta pasta (Tab)"
          onClick={() => {
            setHere((v) => !v)
            inputRef.current?.focus()
          }}
          className={`inline-flex h-6 flex-none cursor-pointer items-center gap-1.5 rounded-md px-2 text-[11.5px] focus-visible:outline-2 focus-visible:outline-accent ${
            here ? 'bg-accent/15 text-accent' : 'text-muted hover:bg-surface-hover hover:text-text'
          }`}
        >
          <Folder aria-hidden size={12} /> Só nesta pasta
        </button>
        <button
          type="button"
          aria-label="Fechar"
          onClick={onClose}
          className="inline-flex size-6 flex-none cursor-pointer items-center justify-center rounded-md text-muted hover:bg-surface-hover hover:text-text focus-visible:outline-2 focus-visible:outline-accent"
        >
          <X aria-hidden size={14} />
        </button>
      </div>
      <Scroller className="min-h-0 flex-1">
        <ul ref={listRef} id="history-results" aria-label="Comandos" className="m-0 list-none p-1">
          {results.map((r, i) => (
            <li key={r.item.command} aria-current={i === selected || undefined}>
              {/* O teclado fica na caixa de busca (setas, Enter); o botão serve ao mouse. */}
              <button
                type="button"
                tabIndex={-1}
                onMouseMove={() => i !== selected && setSelected(i)}
                onClick={() => onPick(r.item.command, false)}
                className={`flex w-full cursor-pointer items-center gap-2 truncate rounded-md px-2.5 py-1 text-left ${
                  i === selected ? 'bg-surface-hover' : ''
                }`}
                style={{ fontFamily, fontSize }}
              >
                <span className="min-w-0 flex-1 truncate">
                  <Highlighted text={oneLine(r.item.command)} positions={r.match.positions} />
                </span>
                {r.item.command.includes('\n') && (
                  <span className="flex-none text-[10.5px] text-muted">várias linhas</span>
                )}
              </button>
            </li>
          ))}
          {results.length === 0 && (
            <li className="px-3 py-4 text-center text-[12.5px] text-muted">
              {file === null
                ? 'Lendo o histórico…'
                : here
                  ? 'Nenhum comando rodado nesta pasta combina. Tab mostra todos.'
                  : 'Nenhum comando combina.'}
            </li>
          )}
        </ul>
      </Scroller>
      <footer className="flex items-center gap-3 border-t border-border px-3 py-1.5 text-[11px] text-muted">
        <span>↑↓ escolher</span>
        <span>Enter põe na linha</span>
        <span>Shift+Enter roda</span>
        <span>Tab pasta</span>
        <span className="ml-auto">Esc fecha</span>
      </footer>
    </div>
  )
}
