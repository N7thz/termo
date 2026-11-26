// Digitar em vários painéis ao mesmo tempo: quem recebe e o que é repassado.
import { paneMates, type Tab, type TabsState } from '../tabs/tabs'

/**
 * Abas que recebem junto o que for digitado em `key`: as outras do grupo dela ou, fora de grupo, os
 * outros painéis da tela dividida. Só shells: nem a origem nem o destino pode ser o Claude (`isClaude`
 * cobre o `claude` aberto à mão dentro de um shell).
 */
export function broadcastTargets(
  state: Pick<TabsState, 'tabs' | 'splits' | 'groups'>,
  key: number | null,
  isClaude: (tab: Tab) => boolean = () => false,
): number[] {
  const source = state.tabs.find((t) => t.key === key)
  const shell = (t: Tab) => t.kind === 'shell' && !isClaude(t)
  if (!source || !shell(source)) return []
  const grouped = state.groups.some((g) => g.id === source.group && g.profile === source.profile)
  const mates = paneMates(state, source.key)
  return state.tabs
    .filter((t) => t.key !== source.key && shell(t))
    .filter((t) => (grouped ? t.group === source.group && t.profile === source.profile : mates.includes(t.key)))
    .map((t) => t.key)
}

// Respostas que o próprio xterm manda ao programa (posição do cursor, atributos do terminal, foco, mouse,
// tamanho, OSC/DCS): saem pelo mesmo `onData` do teclado, mas não são digitação.
const TERMINAL_REPLY =
  // biome-ignore lint/suspicious/noControlCharactersInRegex: as sequências de escape começam com ESC
  /^\x1b(\[(\d+;\d+R|[?>=][\d;]*c|[IO]|<\d+;\d+;\d+[Mm]|M[\s\S]{3}|\??[\d;]*\$y|\?\d+;\d+R|[\d;]*[nt]|\?[\d;]*[nu])|\]|P|_)/

/** O que veio do `onData` é teclado ou colagem (e não uma resposta automática do terminal)? */
export const isTyped = (data: string): boolean => data.length > 0 && !TERMINAL_REPLY.test(data)
