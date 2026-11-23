import type { Workflow } from '../../shared/types'

/** Mesmos limites do Rust (`sanitize_workflows` e MAX_WORKFLOWS em src-tauri/src/settings.rs). */
export const MAX_WORKFLOWS = 50
export const NAME_MAX = 60
export const COMMAND_MAX = 2000
export const DESCRIPTION_MAX = 200

/** Mensagem de erro para o formulário, ou `null` se o Rust vai aceitar o workflow. */
export function validateWorkflow(w: Workflow): string | null {
  const name = w.name.trim()
  const command = w.command.trim()
  if (!name) return 'Dê um nome ao workflow.'
  if ([...name].length > NAME_MAX) return `O nome tem no máximo ${NAME_MAX} caracteres.`
  if (!command) return 'Escreva o comando.'
  if ([...command].length > COMMAND_MAX) return `O comando tem no máximo ${COMMAND_MAX} caracteres.`
  if ([...w.description.trim()].length > DESCRIPTION_MAX)
    return `A descrição tem no máximo ${DESCRIPTION_MAX} caracteres.`
  return null
}

/** Move o item de `from` para `to`, sem mexer na lista original. */
export function moveItem<T>(list: readonly T[], from: number, to: number): T[] {
  if (from === to || from < 0 || from >= list.length || to < 0 || to >= list.length) return [...list]
  const next = [...list]
  const [item] = next.splice(from, 1)
  next.splice(to, 0, item)
  return next
}

/** Sugestões da tela vazia: só aparecem, nada é gravado sem a pessoa pedir ("Adicionar"). */
export const EXAMPLE_WORKFLOWS: readonly Workflow[] = [
  {
    name: 'Log do git por autor',
    command: 'git log --oneline --author={{autor}} -n {{quantidade}}',
    description: 'Últimos commits de uma pessoa.',
  },
  {
    name: 'Encerrar o que usa uma porta',
    command: 'Get-NetTCPConnection -LocalPort {{porta}} | ForEach-Object { Stop-Process -Id $_.OwningProcess -Force }',
    description: 'Mata o processo que está ouvindo na porta.',
  },
  {
    name: 'Procurar texto nos arquivos',
    command: 'Get-ChildItem -Recurse -File | Select-String -Pattern {{texto}}',
    description: 'Busca o texto em todos os arquivos da pasta atual.',
  },
]
