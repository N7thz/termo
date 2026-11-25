import { createContext, useContext } from 'react'

/** Agente de `.claude/agents` (do `agents.rs`): um papel para abrir o Claude (revisor, testador...). */
export interface AgentDef {
  name: string
  description: string
  /** `sonnet`, `opus`... ou vazio (herda o padrão). */
  model: string
  /** Do projeto da aba ativa (senão, do usuário). */
  project: boolean
}

export interface RolesApi {
  agents: readonly AgentDef[]
  /** Abre uma aba do Claude com `--agent <nome>`. */
  onOpen: (name: string) => void
}

/** Os papéis chegam ao menu "nova aba" sem passar por cada componente no caminho. */
export const RolesContext = createContext<RolesApi | null>(null)

export const useRoles = () => useContext(RolesContext)
