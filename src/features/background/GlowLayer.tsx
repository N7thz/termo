import { useMemo } from 'react'
import type { BackgroundSettings } from '../../shared/types'
import type { ThemeDefinition } from '../theme/themes'
import { glowStyle, glowTone, wantsGlow } from './background'

/**
 * Brilho suave nas bordas da janela, nas cores do tema ativo (acompanha a troca e a prévia de tema).
 * Fica na moldura, atrás da lateral, da barra e das frestas em volta do cartão do terminal, que segue
 * liso. Parado; some com contraste alto e com transparência reduzida.
 */
export function GlowLayer({ settings, theme }: { settings: BackgroundSettings; theme: ThemeDefinition }) {
  const active = wantsGlow(settings)
  const style = useMemo(() => {
    const accent = theme.ui.accent
    return glowStyle({
      accent,
      tone: glowTone(accent, theme.terminal),
      scheme: theme.scheme,
      strength: settings.glowStrength,
    })
  }, [theme, settings.glowStrength])
  if (!active) return null
  return (
    <div
      aria-hidden
      className="pointer-events-none absolute inset-0 -z-1 contrast-more:hidden reduced-transparency:hidden"
      style={style}
    />
  )
}
