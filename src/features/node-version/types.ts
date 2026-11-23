/** Como o backend manda (src-tauri/src/node.rs). */
export interface NodeInfo {
  /** Sem o `v` (ex.: `24.14.0`); `null` sem node no PATH do shell. */
  version: string | null
  /** A pasta (ou uma acima dela) tem `package.json`. */
  project: boolean
  /** Versão pedida em `.nvmrc`/`.node-version`, sem o `v`. */
  wanted: string | null
  /** Scripts do package.json, na ordem do arquivo (vazio fora de projeto Node). */
  scripts: NpmScript[]
  /** Quem roda os scripts (campo `packageManager`, senão o lockfile); `null` fora de projeto. */
  packageManager: PackageManager | null
}

export type PackageManager = 'npm' | 'pnpm' | 'yarn' | 'bun'

export interface NpmScript {
  name: string
  /** O comando do script (cortado em 300 caracteres), para mostrar ao lado do nome. */
  command: string
}

export type NodeManager = 'fnm' | 'nvm' | 'volta'

export interface NodeVersions {
  manager: NodeManager | null
  /** Instaladas, da mais nova para a mais antiga. */
  versions: string[]
}
