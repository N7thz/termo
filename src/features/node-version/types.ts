/** Como o backend manda (src-tauri/src/node.rs). */
export interface NodeInfo {
  /** Sem o `v` (ex.: `24.14.0`); `null` sem node no PATH do shell. */
  version: string | null
  /** A pasta (ou uma acima dela) tem `package.json`. */
  project: boolean
  /** Versão pedida em `.nvmrc`/`.node-version`, sem o `v`. */
  wanted: string | null
}

export type NodeManager = 'fnm' | 'nvm' | 'volta'

export interface NodeVersions {
  manager: NodeManager | null
  /** Instaladas, da mais nova para a mais antiga. */
  versions: string[]
}
