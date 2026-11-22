import { Button } from '@ui-sdk/react/button'
import { Copy, Play, Sparkles, X } from 'lucide-react'
import { useEffect, useRef } from 'react'
import { fixCommand, parseAnswer } from './answer'

export interface AiPanelState {
  /** O comando que falhou. */
  command: string
  status: 'loading' | 'done' | 'error'
  text: string
}

interface Props {
  state: AiPanelState
  fontFamily: string
  onClose: () => void
  onCopy: (text: string) => void
  /** Executa o comando de correção no shell da aba. */
  onRun: (command: string) => void
}

const iconButton =
  'inline-flex h-7 items-center gap-1.5 rounded-md px-2 text-[12px] text-muted hover:bg-surface-hover hover:text-text focus-visible:outline-2 focus-visible:outline-accent'

/** Cartão no canto do terminal com a explicação do erro e o comando de correção, pronto para rodar. */
export function AiPanel({ state, fontFamily, onClose, onCopy, onRun }: Props) {
  const boxRef = useRef<HTMLDivElement>(null)
  const fix = state.status === 'done' ? fixCommand(state.text) : null

  useEffect(() => {
    boxRef.current?.focus()
  }, [])

  return (
    <div
      ref={boxRef}
      tabIndex={-1}
      role="dialog"
      aria-label="Explicação do erro"
      className="absolute right-4 bottom-4 z-20 flex max-h-[60%] w-[min(520px,calc(100%-2rem))] animate-pop-in flex-col overflow-hidden rounded-[12px] border border-border bg-surface text-text shadow-card outline-none motion-reduce:animate-none"
      onKeyDown={(e) => {
        if (e.key === 'Escape') {
          e.preventDefault()
          e.stopPropagation()
          onClose()
        }
      }}
    >
      <header className="flex items-center gap-2 border-b border-border px-3 py-2">
        <Sparkles aria-hidden size={14} className="flex-none text-claude" />
        <span className="min-w-0 flex-1 truncate text-[12.5px]">
          Por que <code style={{ fontFamily }}>{state.command || 'o comando'}</code> falhou
        </span>
        <Button className={`${iconButton} px-1.5`} aria-label="Fechar" onClick={onClose}>
          <X aria-hidden size={14} />
        </Button>
      </header>
      <div className="min-h-0 flex-1 overflow-y-auto px-3 py-2.5 text-[12.5px]/[1.55]" aria-live="polite">
        {state.status === 'loading' && (
          <span className="inline-flex items-center gap-2 text-muted">
            <span className="size-2 animate-ping rounded-full bg-claude motion-reduce:animate-none" aria-hidden />
            Perguntando ao Claude…
          </span>
        )}
        {state.status === 'error' && <p className="m-0 text-muted">{state.text}</p>}
        {state.status === 'done' &&
          parseAnswer(state.text).map((part, i) =>
            part.type === 'text' ? (
              // biome-ignore lint/suspicious/noArrayIndexKey: a resposta não muda depois de pronta
              <p key={i} className="m-0 mb-2 whitespace-pre-wrap">
                {part.text}
              </p>
            ) : (
              <pre
                // biome-ignore lint/suspicious/noArrayIndexKey: a resposta não muda depois de pronta
                key={i}
                className="m-0 mb-2 overflow-x-auto rounded-md bg-bg px-2.5 py-2 text-[12px]"
                style={{ fontFamily }}
              >
                {part.code}
              </pre>
            ),
          )}
      </div>
      {fix && (
        <footer className="flex items-center justify-end gap-1 border-t border-border px-2 py-1.5">
          <Button className={iconButton} onClick={() => onCopy(fix)}>
            <Copy aria-hidden size={13} /> Copiar a correção
          </Button>
          <Button className={`${iconButton} text-text`} onClick={() => onRun(fix)}>
            <Play aria-hidden size={13} /> Rodar a correção
          </Button>
        </footer>
      )}
    </div>
  )
}
