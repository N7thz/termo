import { Listbox, ListboxItem, ListboxItemIcon } from '@ui-sdk/react/listbox'
import type { PathSuggestion } from '../../shared/types'

/** Em px relativos ao terminal: `bottom` abre para cima do cursor, `top` abre para baixo. */
export type SuggestionsPosition =
  | { left: number; bottom: number; top?: never }
  | { left: number; top: number; bottom?: never }

interface Props {
  items: PathSuggestion[]
  position: SuggestionsPosition
  onPick: (item: PathSuggestion) => void
  /** Esc dentro da lista: fecha e devolve o foco ao terminal. */
  onDismiss: () => void
}

const SCOPE_LABEL: Record<PathSuggestion['scope'], string> = {
  child: 'aqui',
  parent: 'fora',
  path: 'caminho',
  recent: 'recente',
}

/**
 * Lista de `cd` com o Listbox do UI SDK: clique, Enter/Espaço numa opção focada ou Alt+número
 * (tratado no TerminalView) executa o comando; Alt+↑/↓ no terminal leva o foco para a lista.
 * Nada fica "selecionado": escolher é executar.
 */
export function PathSuggestions({ items, position, onPick, onDismiss }: Props) {
  if (items.length === 0) return null
  return (
    <Listbox
      className="absolute z-5 flex min-w-65 max-w-[min(520px,calc(100%-24px))] animate-pop-in flex-col gap-px rounded-[10px] border border-border bg-surface/92 p-1 font-mono text-xs/[1.3] shadow-pop backdrop-blur-md motion-reduce:animate-none"
      style={position}
      aria-label="Pastas sugeridas"
      activation="manual"
      loop
      value={null}
      onValueChange={(command, details) => {
        details.cancel()
        const item = items.find((i) => i.command === command)
        if (item) onPick(item)
      }}
      onKeyDown={(e) => {
        if (e.key === 'Escape') {
          e.preventDefault()
          onDismiss()
        }
      }}
    >
      {items.map((item, i) => (
        <ListboxItem
          key={item.command}
          value={item.command}
          label={item.label}
          className="flex cursor-pointer items-center gap-2 rounded-md border-0 bg-transparent px-2 py-[5px] text-left text-text hover:bg-surface-hover focus-visible:outline focus-visible:-outline-offset-1 focus-visible:outline-accent data-highlighted:bg-surface-hover"
          title={`Executar: ${item.command}`}
        >
          <ListboxItemIcon
            className={`w-3 ${item.scope === 'parent' ? 'text-claude' : item.scope === 'recent' ? 'text-muted' : 'text-accent'}`}
            mirror={item.scope === 'parent'}
          >
            {item.scope === 'parent' ? '↰' : item.scope === 'recent' ? '↻' : '▸'}
          </ListboxItemIcon>
          <span className="flex-1 truncate">
            <span className="text-muted">cd </span>
            {item.label}
          </span>
          <span className="text-[10px] tracking-[0.04em] text-muted uppercase">{SCOPE_LABEL[item.scope]}</span>
          {i < 9 && (
            <kbd className="rounded-sm border border-border px-1 py-px font-mono text-[10px] text-muted">
              Alt+{i + 1}
            </kbd>
          )}
        </ListboxItem>
      ))}
    </Listbox>
  )
}
