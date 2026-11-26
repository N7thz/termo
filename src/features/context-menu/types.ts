/** O que o menu do terminal precisa do xterm; o TerminalView entrega pelo `onActions`. */
export interface TerminalActions {
  hasSelection: () => boolean
  /** Copia a seleção para a área de transferência do sistema. */
  copy: () => void
  /** Cola como o Ctrl+V do terminal (texto, ou repassa a imagem para o Claude Code). */
  paste: () => void
  selectAll: () => void
  /** Limpa a tela e o histórico de rolagem. */
  clear: () => void
  /** Abre a busca na saída (o mesmo do Ctrl+Shift+F). */
  find: () => void
  /** Rótulos sobre URLs, caminhos, hashes e números da tela para copiar pelo teclado (Ctrl+Shift+Espaço). */
  quickSelect?: () => void
  /** Modo de cópia pelo teclado: cursor próprio pela saída e pelo histórico (Ctrl+Shift+X). */
  copyMode?: () => void
  /** Cola o texto como uma colagem (bracketed paste) e manda Enter: assim o Claude Code recebe uma mensagem só. */
  sendText?: (text: string) => void
  /** Cola o texto sem mandar Enter (contexto para o Claude Code: a pessoa completa com a pergunta). */
  pasteText?: (text: string) => void
  /** Põe o comando na linha do shell, apagando o que estava digitado (ou na caixa do editor); `run` também executa. */
  command?: (text: string, run: boolean) => void
  /** Manda os bytes ao pty como se tivessem sido digitados (digitar em vários painéis). */
  write?: (data: string) => void
  /** Número do terminal (o `TERMO_PTY` do processo): liga o `termo title` à aba de onde veio. */
  ptyId?: () => number | null
}

export type TabMenuAction =
  /** Dá um nome à aba (editado na própria lateral). */
  | 'rename'
  /** Abre a nota da aba para ler e editar. */
  | 'note'
  | 'new-shell'
  | 'new-claude'
  | 'duplicate'
  | 'move-left'
  | 'move-right'
  | 'pin-folder'
  | 'close'
  | 'close-others'
  | 'close-right'
  /** Cria um grupo novo com esta aba. */
  | 'new-group'
  /** Põe a aba no grupo `id`. */
  | `move-to-group:${string}`
  | 'ungroup'
  /** Tela dividida: abre uma aba nova ao lado desta. */
  | 'split-new'
  /** Tela dividida: esta aba ao lado da aba ativa. */
  | 'split-with-active'
  /** Tela dividida: esta aba ao lado da aba `key`, já aberta. */
  | `split-with:${number}`
  | 'unsplit'

export type TerminalMenuAction =
  | 'copy'
  | 'paste'
  | 'select-all'
  | 'clear'
  | 'find'
  | 'quick-select'
  | 'copy-mode'
  | 'new-shell'
  | 'new-claude'
  | 'themes'
  | 'settings'
  | 'close'
