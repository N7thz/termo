import { createContext, useContext } from 'react'
import type { SavedLayout } from '../../shared/types'

export interface LayoutsApi {
  layouts: readonly SavedLayout[]
  /** Abre o layout (posição na lista) no perfil atual. */
  onOpen: (index: number) => void
  /** Abre a janela de layouts (salvar o atual, renomear, excluir). */
  onManage: () => void
}

/** Os layouts chegam ao menu "nova aba" sem passar por cada componente no caminho. */
export const LayoutsContext = createContext<LayoutsApi | null>(null)

export const useLayouts = () => useContext(LayoutsContext)
