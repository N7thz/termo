/** Branch como o backend manda (`git::Branch`). */
export interface GitBranchInfo {
  /** Nome para o `git switch` (a remota vem sem o `origin/`). */
  name: string
  current: boolean
  /** Só existe no remoto: trocar cria a branch local que acompanha a remota. */
  remote: boolean
  /** Data do último commit, relativa ("2 days ago"). */
  updated: string
}
