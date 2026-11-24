export interface Flag {
  /** Como se digita: `['--message', '-m']` (o primeiro é o que o Tab escreve numa lista sem prefixo). */
  names: string[]
  description: string
  /** Recebe um valor na palavra seguinte (`-m "texto"`). */
  takesValue?: boolean
}

export interface Command {
  name: string
  description: string
  aliases?: string[]
  subcommands?: Command[]
  flags?: Flag[]
  /** O argumento é o nome de um script do `package.json`. */
  scripts?: boolean
}

/** `cmd('add', 'prepara arquivos', { flags: [...] })`. */
export const cmd = (name: string, description: string, rest: Omit<Command, 'name' | 'description'> = {}): Command => ({
  name,
  description,
  ...rest,
})

/** `flag('--message -m', 'mensagem', true)`: nomes separados por espaço. */
export const flag = (names: string, description: string, takesValue = false): Flag => ({
  names: names.split(' '),
  description,
  ...(takesValue && { takesValue }),
})
