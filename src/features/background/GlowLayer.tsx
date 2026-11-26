import { useMemo } from 'react'
import type { BackgroundSettings } from '../../shared/types'
import type { ThemeDefinition } from '../theme/themes'
import { glowStyle, glowTone, wantsGlow } from './background'

/**
 * Brilho suave atrás das abas, nas cores do tema ativo (acompanha a troca e a prévia de tema).
 * Um por cartão, parado. Com contraste alto e com transparência reduzida, os halos somem e fica só
 * a cor de fundo do terminal.
 */
export function GlowLayer({ settings, theme }: { settings: BackgroundSettings; theme: ThemeDefinition }) {
  const active = wantsGlow(settings)
  const style = useMemo(() => {
    const accent = theme.ui.accent
    return glowStyle({
      base: theme.terminal.background ?? theme.ui.bg,
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
      className="pointer-events-none absolute inset-0 contrast-more:bg-none! reduced-transparency:bg-none!"
      style={style}
    />
  )
}
