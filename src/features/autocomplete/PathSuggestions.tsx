import { Listbox, ListboxItem, ListboxItemIcon } from '@ui-sdk/react/listbox'
import { ChevronRight, CornerLeftUp, History } from 'lucide-react'
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
  child: 'nesta pasta',
  parent: 'pasta vizinha',
  path: 'caminho digitado',
  recent: 'pasta recente',
}

/** Poucas opções por vez: a lista é um atalho, não um navegador de pastas (o resto vem digitando). */
const MAX_VISIBLE = 5

/**
 * Lista de `cd` com o Listbox do UI SDK: clique, Enter/Espaço numa opção focada ou Alt+número
 * (tratado no TerminalView) executa o comando; Alt+↑/↓ no terminal leva o foco para a lista.
 * Nada fica "selecionado": escolher é executar.
 */
export function PathSuggestions({ items: all, position, onPick, onDismiss }: Props) {
  const items = all.slice(0, MAX_VISIBLE)
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
          className="group/item flex cursor-pointer items-center gap-2 rounded-md border-0 bg-transparent px-2 py-[5px] text-left text-text hover:bg-surface-hover focus-visible:outline focus-visible:-outline-offset-1 focus-visible:outline-accent data-highlighted:bg-surface-hover"
          title={`${item.command} (${SCOPE_LABEL[item.scope]})${i < 9 ? ` · Alt+${i + 1}` : ''}`}
        >
          <ListboxItemIcon
            className={`flex w-3 ${item.scope === 'parent' ? 'text-claude' : item.scope === 'recent' ? 'text-muted' : 'text-accent'}`}
          >
            {item.scope === 'parent' ? (
              <CornerLeftUp size={12} />
            ) : item.scope === 'recent' ? (
              <History size={12} />
            ) : (
              <ChevronRight size={12} />
            )}
          </ListboxItemIcon>
          <span className="flex-1 truncate">
            <span className="text-muted">cd </span>
            {item.label}
          </span>
          {/* O atalho só aparece na linha sob o mouse ou com foco: a lista fica limpa. O tipo da pasta
              já vem no ícone (e no title). */}
          {i < 9 && (
            <kbd className="font-mono text-[10px] text-muted opacity-0 [transition:opacity_120ms_ease-out] group-hover/item:opacity-100 group-data-highlighted/item:opacity-100">
              Alt+{i + 1}
            </kbd>
          )}
        </ListboxItem>
      ))}
    </Listbox>
  )
}
