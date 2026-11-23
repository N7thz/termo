import type { PackageManager } from './types'

/** Família do shell da aba (a mesma da ContextBar): muda só como o nome do script é citado. */
export type ShellFamily = 'pwsh' | 'powershell' | 'cmd' | 'bash' | 'wsl'

/** Nomes comuns (`dev`, `test:web`, `build-prod`, `@scope/x`) vão sem aspas. */
const PLAIN = /^[\w:.@/+=-]+$/

/** O nome do script pronto para a linha de comando do shell; `null` se não dá para citar com segurança. */
export function quoteScript(name: string, family: ShellFamily = 'pwsh'): string | null {
  if (PLAIN.test(name)) return name
  if (/[\r\n\0]/.test(name)) return null
  if (family === 'pwsh' || family === 'powershell') return `'${name.replace(/'/g, "''")}'`
  if (family === 'bash' || family === 'wsl') return `'${name.replace(/'/g, `'\\''`)}'`
  // cmd: sem como escapar aspas nem % de forma confiável.
  return /["%^&|<>!]/.test(name) ? null : `"${name}"`
}

/** Comando que roda o script, como o "Run" do NPM Scripts do VS Code (`npm run dev`, `bun run dev`...). */
export function runScriptCommand(pm: PackageManager | null, name: string, family?: ShellFamily): string | null {
  const quoted = quoteScript(name, family)
  return quoted == null ? null : `${pm ?? 'npm'} run ${quoted}`
}

/** Scripts que costumam ser os mais usados vêm primeiro na lista; o resto segue a ordem do package.json. */
const FIRST = ['dev', 'start', 'build', 'test', 'lint', 'check']

export function sortScripts<T extends { name: string }>(scripts: readonly T[]): T[] {
  const rank = (s: T) => {
    const i = FIRST.indexOf(s.name)
    return i === -1 ? FIRST.length : i
  }
  return scripts
    .map((s, i) => ({ s, i }))
    .sort((a, b) => rank(a.s) - rank(b.s) || a.i - b.i)
    .map(({ s }) => s)
}
