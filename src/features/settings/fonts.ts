/** Fontes monoespaçadas comuns no Windows. A JetBrains Mono vem embutida no app; as outras só aparecem se instaladas. */
export const TERMINAL_FONTS = [
  'JetBrains Mono',
  'Cascadia Code',
  'Cascadia Mono',
  'Fira Code',
  'Consolas',
  'Source Code Pro',
  'Hack',
  'Iosevka',
  'IBM Plex Mono',
  'Ubuntu Mono',
  'Courier New',
] as const

export const BUNDLED_FONT = 'JetBrains Mono'

/** Tamanhos prontos do terminal (o campo numérico continua aceitando qualquer valor entre os limites). */
export const FONT_SIZE_PRESETS = [12, 13, 14, 16, 18] as const

/** Pilha de fallback salva nas configurações: a escolhida primeiro, a embutida depois. */
export function fontStack(name: string): string {
  const rest = name === BUNDLED_FONT ? '' : `, '${BUNDLED_FONT}'`
  return `'${name}'${rest}, Consolas, monospace`
}

/** Primeira fonte de uma pilha CSS: `'Fira Code', Consolas` → `Fira Code`. */
export function primaryFont(stack: string): string {
  return (stack.split(',')[0] ?? '').trim().replace(/^['"]|['"]$/g, '')
}

/**
 * Uma fonte está instalada se o texto medido com ela difere do mesmo texto nas fontes genéricas
 * (se ela não existir, o navegador cai na genérica e as larguras batem).
 */
export function isFontAvailable(name: string, measure: (font: string) => number): boolean {
  if (name === BUNDLED_FONT) return true
  return ['monospace', 'serif', 'sans-serif'].some((generic) => measure(`'${name}', ${generic}`) !== measure(generic))
}

let canvasMeasure: ((font: string) => number) | null = null

/** Medição real com canvas (só no navegador). */
export function measureWith(): (font: string) => number {
  if (!canvasMeasure) {
    const ctx = document.createElement('canvas').getContext('2d')
    canvasMeasure = (font) => {
      if (!ctx) return 0
      ctx.font = `32px ${font}`
      return ctx.measureText('mmmmmmmmmmlli10OQ→').width
    }
  }
  return canvasMeasure
}
