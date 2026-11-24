import type { Completion } from './complete'

interface Props {
  items: Completion[]
  /** Opção que está escrita na linha (Tab e ↑/↓ trocam). */
  active: number
  /** Distância da base da caixa: a lista abre para cima. */
  bottom: number
  onPick: (index: number) => void
}

const MAX_VISIBLE = 6

const KIND_LABEL: Record<Completion['kind'], string> = { subcommand: 'subcomando', flag: 'flag', script: 'script' }

/**
 * Lista do autocomplete de comandos. O foco continua na caixa de entrada: aqui só se vê qual opção
 * está escrita (o mouse também escolhe). Mostra uma janela de opções em volta da ativa.
 */
export function CompletionList({ items, active, bottom, onPick }: Props) {
  if (items.length === 0) return null
  const first = Math.max(0, Math.min(active - 2, items.length - MAX_VISIBLE))
  return (
    <div
      role="listbox"
      aria-label="Sugestões do comando"
      className="absolute left-0 z-5 flex min-w-65 max-w-[min(520px,100%)] animate-pop-in flex-col gap-px rounded-[10px] border border-border bg-surface/92 p-1 font-mono text-xs/[1.3] shadow-pop backdrop-blur-md motion-reduce:animate-none"
      style={{ bottom }}
    >
      {items.slice(first, first + MAX_VISIBLE).map((item, i) => {
        const index = first + i
        return (
          <button
            key={`${item.kind}:${item.value}`}
            type="button"
            role="option"
            tabIndex={-1}
            aria-selected={index === active}
            title={`${KIND_LABEL[item.kind]}: ${item.description}`}
            // Sem roubar o foco da caixa de entrada.
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => onPick(index)}
            className="flex cursor-pointer items-baseline gap-3 rounded-md border-0 bg-transparent px-2 py-[5px] text-left text-text hover:bg-surface-hover aria-selected:bg-surface-hover"
          >
            <span className={`flex-none ${index === active ? 'text-accent' : ''}`}>{item.value}</span>
            <span className="min-w-0 flex-1 truncate text-right font-sans text-[11.5px] text-muted">
              {item.description}
            </span>
          </button>
        )
      })}
      {items.length > MAX_VISIBLE && (
        <span role="presentation" className="px-2 py-0.5 text-right font-sans text-[10.5px] text-muted">
          {active + 1} de {items.length}
        </span>
      )}
    </div>
  )
}
