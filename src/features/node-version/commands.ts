import type { NodeManager } from './types'

/** Comando que troca a versão do Node na aba (com o fnm, só nesta aba; nvm-windows e Volta, para todas). */
export function switchCommand(manager: NodeManager, version: string): string {
  if (manager === 'fnm') return `fnm use ${version}`
  if (manager === 'nvm') return `nvm use ${version}`
  return `volta install node@${version}`
}

/** Instala e já passa a usar a versão (`lts` para a LTS mais recente). */
export function installCommand(manager: NodeManager, version: string): string {
  if (manager === 'fnm')
    return version === 'lts' ? 'fnm install --lts; fnm use lts-latest' : `fnm use --install-if-missing ${version}`
  if (manager === 'nvm') return `nvm install ${version}; nvm use ${version}`
  return `volta install node@${version}`
}

/** Sem gerenciador: instala o fnm pelo winget (a aba nova já o ativa, ver FNM_ENV em shell.rs). */
export const INSTALL_FNM = 'winget install --id Schniz.fnm -e'

/** A versão pedida pelo projeto (`20`, `20.11`, `v20.11.0`, `lts/*`) é atendida pela instalada? */
export function satisfies(installed: string, wanted: string): boolean {
  const w = wanted.replace(/^v/, '')
  if (!/^\d+(\.\d+){0,2}$/.test(w)) return false
  const a = installed.split('.')
  return w.split('.').every((part, i) => a[i] === part)
}

export const MANAGER_NAME: Record<NodeManager, string> = { fnm: 'fnm', nvm: 'nvm-windows', volta: 'Volta' }
