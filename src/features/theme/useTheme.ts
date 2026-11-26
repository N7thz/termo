import { useEffect, useMemo, useState } from 'react'
import { rememberBootTheme } from '../boot/boot'
import { resolveTheme, type ThemeDefinition, type UiTokens } from './themes'

const VAR_NAMES: Record<Exclude<keyof UiTokens, 'shadowStrength'>, string> = {
  bg: '--bg',
  surface: '--surface',
  surfaceHover: '--surface-hover',
  border: '--border',
  text: '--text',
  muted: '--muted',
  accent: '--accent',
  claude: '--claude',
  material: '--material',
  materialThick: '--material-thick',
  hairline: '--hairline',
  highlight: '--highlight',
  field: '--field',
  onAccent: '--on-accent',
}

/** Escreve os tokens do tema como variáveis CSS no :root (o CSS e as classes do Tailwind só leem variáveis). */
export function applyTheme(theme: ThemeDefinition, root: HTMLElement = document.documentElement) {
  for (const [key, name] of Object.entries(VAR_NAMES)) {
    root.style.setProperty(name, theme.ui[key as keyof typeof VAR_NAMES])
  }
  root.style.setProperty('--shadow-strength', String(theme.ui.shadowStrength))
  root.style.colorScheme = theme.scheme
  root.dataset.theme = theme.id
}

const darkQuery = () => window.matchMedia('(prefers-color-scheme: dark)')

/** Tema ativo a partir do id salvo; com `system`, acompanha a troca de claro/escuro do Windows ao vivo. */
export function useTheme(themeId: string): ThemeDefinition {
  const [prefersDark, setPrefersDark] = useState(() => darkQuery().matches)

  useEffect(() => {
    const mq = darkQuery()
    const onChange = (e: MediaQueryListEvent) => setPrefersDark(e.matches)
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [])

  const theme = useMemo(() => resolveTheme(themeId, prefersDark), [themeId, prefersDark])

  useEffect(() => {
    applyTheme(theme)
    rememberBootTheme(theme)
  }, [theme])

  return theme
}
