import { createContext, useContext } from 'react'

/** Abre a janela de worktrees; chega ao menu "nova aba" sem passar por cada componente no caminho. */
export const WorktreeContext = createContext<(() => void) | null>(null)

export const useOpenWorktrees = () => useContext(WorktreeContext)
