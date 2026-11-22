import type { IDisposable, IMarker, Terminal } from '@xterm/xterm'

/**
 * Lê as marcas que o prompt do PowerShell emite (src-tauri/src/shell.rs, PWSH_INTEGRATION):
 * - `OSC 633;P;Cwd=<pasta>`: pasta atual;
 * - `OSC 133;B`: fim do prompt, ou seja, onde começa a linha que a pessoa digita.
 *
 * Sem essas marcas (outro shell, ou com o Claude Code rodando) `atPrompt` fica falso e nada
 * é sugerido: o terminal segue funcionando normalmente.
 */
export class ShellIntegration implements IDisposable {
  cwd: string | null = null
  private inputStart: { marker: IMarker; x: number } | null = null
  private running = true
  private disposables: IDisposable[] = []

  /**
   * `onCwd`: chamado quando a pasta da aba muda (alimenta o histórico de pastas recentes).
   * `onPrompt`: chamado a cada prompt novo, ou seja, quando um comando termina (atualiza o git).
   */
  constructor(
    private term: Terminal,
    onCwd?: (cwd: string) => void,
    onPrompt?: () => void,
  ) {
    this.disposables.push(
      term.parser.registerOscHandler(633, (data) => {
        if (data.startsWith('P;Cwd=')) {
          const cwd = data.slice('P;Cwd='.length)
          if (cwd !== this.cwd) {
            this.cwd = cwd
            onCwd?.(cwd)
          }
        }
        return true
      }),
      term.parser.registerOscHandler(133, (data) => {
        if (data.startsWith('B')) {
          this.inputStart?.marker.dispose()
          this.inputStart = { marker: term.registerMarker(0), x: term.buffer.active.cursorX }
          this.running = false
          onPrompt?.()
        } else if (data.startsWith('A')) {
          this.running = true
        }
        return true
      }),
    )
  }

  /** Está no prompt esperando digitação (e não rodando um comando). */
  get atPrompt() {
    return !this.running && this.inputStart != null && !this.inputStart.marker.isDisposed
  }

  /** Chamado quando a pessoa aperta Enter: até o próximo prompt, um comando está rodando. */
  commandSubmitted() {
    this.running = true
  }

  /** O que já foi digitado depois do prompt (juntando linhas quebradas). */
  readInput(): string | null {
    if (!this.atPrompt || !this.inputStart) return null
    const buf = this.term.buffer.active
    const first = this.inputStart.marker.line
    const cursorRow = buf.baseY + buf.cursorY
    if (first < 0 || cursorRow < first) return null
    let text = ''
    for (let row = first; row <= cursorRow; row++) {
      const line = buf.getLine(row)
      if (!line) break
      text += line.translateToString(true, row === first ? this.inputStart.x : 0)
    }
    return text
  }

  /** Coluna onde a linha digitada começa (para alinhar a lista de sugestões). */
  get inputColumn() {
    return this.inputStart?.x ?? 0
  }

  dispose() {
    this.inputStart?.marker.dispose()
    for (const d of this.disposables) d.dispose()
  }
}
