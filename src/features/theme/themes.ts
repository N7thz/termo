import type { ITheme } from '@xterm/xterm'
import { type TerminalScheme, themeFromScheme } from './derive'
import splashSchemes from './splash-themes.json'

/** Cores da interface: viram variáveis CSS (`--bg`, `--surface`...) no :root. */
export interface UiTokens {
  bg: string
  surface: string
  surfaceHover: string
  border: string
  text: string
  muted: string
  accent: string
  /** Cor do Claude (ícone e botão ✦). */
  claude: string
  /** Vidro da barra de abas e do painel (com transparência). */
  material: string
  materialThick: string
  /** Linhas finas e realce de borda superior. */
  hairline: string
  highlight: string
  /** Fundo de campos e da chave desligada. */
  field: string
  /** Texto/ícone sobre a cor de destaque (bolinha da chave ligada). */
  onAccent: string
  /** Força das sombras: 1 no escuro, menor no claro. */
  shadowStrength: number
}

export interface ThemeDefinition {
  id: string
  name: string
  scheme: 'dark' | 'light'
  ui: UiTokens
  terminal: ITheme
  /** Temas de terceiros (TerminalSplash): autor e repositório de origem. */
  credit?: { author: string; source: string }
}

type Ansi = Pick<
  ITheme,
  | 'black'
  | 'red'
  | 'green'
  | 'yellow'
  | 'blue'
  | 'magenta'
  | 'cyan'
  | 'white'
  | 'brightBlack'
  | 'brightRed'
  | 'brightGreen'
  | 'brightYellow'
  | 'brightBlue'
  | 'brightMagenta'
  | 'brightCyan'
  | 'brightWhite'
>

const term = (bg: string, fg: string, cursor: string, selection: string, ansi: Ansi): ITheme => ({
  background: bg,
  foreground: fg,
  cursor,
  cursorAccent: bg,
  selectionBackground: selection,
  ...ansi,
})

const termoDark: ThemeDefinition = {
  id: 'termo-dark',
  name: 'Termo Escuro',
  scheme: 'dark',
  ui: {
    bg: '#0f1117',
    surface: '#161a23',
    surfaceHover: '#1d2230',
    border: '#252b38',
    text: '#d7dce4',
    muted: '#7d8597',
    accent: '#7aa2ff',
    claude: '#e8916a',
    material: 'rgb(22 26 35 / 62%)',
    materialThick: 'rgb(26 31 42 / 74%)',
    hairline: 'rgb(255 255 255 / 9%)',
    highlight: 'rgb(255 255 255 / 7%)',
    field: 'rgb(15 17 23 / 70%)',
    onAccent: '#0f1117',
    shadowStrength: 1,
  },
  terminal: term('#0f1117', '#d7dce4', '#7aa2ff', '#2f4a7a', {
    black: '#1b1f2a',
    red: '#f7768e',
    green: '#9ece6a',
    yellow: '#e0af68',
    blue: '#7aa2f7',
    magenta: '#bb9af7',
    cyan: '#7dcfff',
    white: '#c0caf5',
    brightBlack: '#565f89',
    brightRed: '#ff8fa3',
    brightGreen: '#b9f27c',
    brightYellow: '#ffc777',
    brightBlue: '#9ab8ff',
    brightMagenta: '#c7a9ff',
    brightCyan: '#a4e4ff',
    brightWhite: '#ffffff',
  }),
}

const termoLight: ThemeDefinition = {
  id: 'termo-light',
  name: 'Termo Claro',
  scheme: 'light',
  ui: {
    bg: '#f7f8fa',
    surface: '#ffffff',
    surfaceHover: '#eceef2',
    border: '#dcdfe6',
    text: '#1f2430',
    muted: '#6b7280',
    accent: '#2f5fd0',
    claude: '#c2410c',
    material: 'rgb(247 248 250 / 70%)',
    materialThick: 'rgb(255 255 255 / 82%)',
    hairline: 'rgb(15 23 42 / 10%)',
    highlight: 'rgb(255 255 255 / 70%)',
    field: 'rgb(255 255 255 / 85%)',
    onAccent: '#ffffff',
    shadowStrength: 0.4,
  },
  terminal: term('#f7f8fa', '#1f2430', '#2f5fd0', '#c9d7f5', {
    black: '#1f2430',
    red: '#c7253e',
    green: '#2f7d32',
    yellow: '#946000',
    blue: '#2f5fd0',
    magenta: '#8a3fc7',
    cyan: '#0e7490',
    white: '#9ca3af',
    brightBlack: '#6b7280',
    brightRed: '#dc2f4a',
    brightGreen: '#38913d',
    brightYellow: '#a86e00',
    brightBlue: '#4272e0',
    brightMagenta: '#9d55d8',
    brightCyan: '#1587a6',
    brightWhite: '#4b5563',
  }),
}

const dracula: ThemeDefinition = {
  id: 'dracula',
  name: 'Dracula',
  scheme: 'dark',
  ui: {
    bg: '#282a36',
    surface: '#303241',
    surfaceHover: '#3a3c4e',
    border: '#44475a',
    text: '#f8f8f2',
    muted: '#8b8fae',
    accent: '#bd93f9',
    claude: '#ffb86c',
    material: 'rgb(40 42 54 / 62%)',
    materialThick: 'rgb(48 50 65 / 76%)',
    hairline: 'rgb(255 255 255 / 9%)',
    highlight: 'rgb(255 255 255 / 7%)',
    field: 'rgb(33 34 44 / 75%)',
    onAccent: '#282a36',
    shadowStrength: 1,
  },
  terminal: term('#282a36', '#f8f8f2', '#f8f8f2', '#44475a', {
    black: '#21222c',
    red: '#ff5555',
    green: '#50fa7b',
    yellow: '#f1fa8c',
    blue: '#bd93f9',
    magenta: '#ff79c6',
    cyan: '#8be9fd',
    white: '#f8f8f2',
    brightBlack: '#6272a4',
    brightRed: '#ff6e6e',
    brightGreen: '#69ff94',
    brightYellow: '#ffffa5',
    brightBlue: '#d6acff',
    brightMagenta: '#ff92df',
    brightCyan: '#a4ffff',
    brightWhite: '#ffffff',
  }),
}

const nord: ThemeDefinition = {
  id: 'nord',
  name: 'Nord',
  scheme: 'dark',
  ui: {
    bg: '#2e3440',
    surface: '#353c4a',
    surfaceHover: '#3b4252',
    border: '#434c5e',
    text: '#eceff4',
    muted: '#8a93a6',
    accent: '#88c0d0',
    claude: '#d08770',
    material: 'rgb(46 52 64 / 64%)',
    materialThick: 'rgb(53 60 74 / 78%)',
    hairline: 'rgb(255 255 255 / 8%)',
    highlight: 'rgb(255 255 255 / 6%)',
    field: 'rgb(41 46 57 / 75%)',
    onAccent: '#2e3440',
    shadowStrength: 0.9,
  },
  terminal: term('#2e3440', '#d8dee9', '#d8dee9', '#434c5e', {
    black: '#3b4252',
    red: '#bf616a',
    green: '#a3be8c',
    yellow: '#ebcb8b',
    blue: '#81a1c1',
    magenta: '#b48ead',
    cyan: '#88c0d0',
    white: '#e5e9f0',
    brightBlack: '#4c566a',
    brightRed: '#bf616a',
    brightGreen: '#a3be8c',
    brightYellow: '#ebcb8b',
    brightBlue: '#81a1c1',
    brightMagenta: '#b48ead',
    brightCyan: '#8fbcbb',
    brightWhite: '#eceff4',
  }),
}

const catppuccinMocha: ThemeDefinition = {
  id: 'catppuccin-mocha',
  name: 'Catppuccin Mocha',
  scheme: 'dark',
  ui: {
    bg: '#1e1e2e',
    surface: '#262637',
    surfaceHover: '#313244',
    border: '#3b3c52',
    text: '#cdd6f4',
    muted: '#9399b2',
    accent: '#89b4fa',
    claude: '#fab387',
    material: 'rgb(30 30 46 / 62%)',
    materialThick: 'rgb(38 38 55 / 76%)',
    hairline: 'rgb(255 255 255 / 8%)',
    highlight: 'rgb(255 255 255 / 6%)',
    field: 'rgb(24 24 37 / 75%)',
    onAccent: '#1e1e2e',
    shadowStrength: 1,
  },
  terminal: term('#1e1e2e', '#cdd6f4', '#f5e0dc', '#45475a', {
    black: '#45475a',
    red: '#f38ba8',
    green: '#a6e3a1',
    yellow: '#f9e2af',
    blue: '#89b4fa',
    magenta: '#f5c2e7',
    cyan: '#94e2d5',
    white: '#bac2de',
    brightBlack: '#585b70',
    brightRed: '#f38ba8',
    brightGreen: '#a6e3a1',
    brightYellow: '#f9e2af',
    brightBlue: '#89b4fa',
    brightMagenta: '#f5c2e7',
    brightCyan: '#94e2d5',
    brightWhite: '#a6adc8',
  }),
}

const catppuccinLatte: ThemeDefinition = {
  id: 'catppuccin-latte',
  name: 'Catppuccin Latte',
  scheme: 'light',
  ui: {
    bg: '#eff1f5',
    surface: '#f7f8fb',
    surfaceHover: '#e6e9ef',
    border: '#ccd0da',
    text: '#4c4f69',
    muted: '#7c7f93',
    accent: '#1e66f5',
    claude: '#fe640b',
    material: 'rgb(239 241 245 / 72%)',
    materialThick: 'rgb(247 248 251 / 84%)',
    hairline: 'rgb(76 79 105 / 12%)',
    highlight: 'rgb(255 255 255 / 70%)',
    field: 'rgb(255 255 255 / 80%)',
    onAccent: '#ffffff',
    shadowStrength: 0.4,
  },
  terminal: term('#eff1f5', '#4c4f69', '#dc8a78', '#ccd0da', {
    black: '#5c5f77',
    red: '#d20f39',
    green: '#40a02b',
    yellow: '#df8e1d',
    blue: '#1e66f5',
    magenta: '#ea76cb',
    cyan: '#179299',
    white: '#acb0be',
    brightBlack: '#6c6f85',
    brightRed: '#d20f39',
    brightGreen: '#40a02b',
    brightYellow: '#df8e1d',
    brightBlue: '#1e66f5',
    brightMagenta: '#ea76cb',
    brightCyan: '#179299',
    brightWhite: '#bcc0cc',
  }),
}

const gruvboxDark: ThemeDefinition = {
  id: 'gruvbox-dark',
  name: 'Gruvbox Escuro',
  scheme: 'dark',
  ui: {
    bg: '#282828',
    surface: '#32302f',
    surfaceHover: '#3c3836',
    border: '#504945',
    text: '#ebdbb2',
    muted: '#a89984',
    accent: '#83a598',
    claude: '#fe8019',
    material: 'rgb(40 40 40 / 64%)',
    materialThick: 'rgb(50 48 47 / 78%)',
    hairline: 'rgb(255 255 255 / 8%)',
    highlight: 'rgb(255 255 255 / 6%)',
    field: 'rgb(29 32 33 / 75%)',
    onAccent: '#282828',
    shadowStrength: 1,
  },
  terminal: term('#282828', '#ebdbb2', '#ebdbb2', '#504945', {
    black: '#282828',
    red: '#cc241d',
    green: '#98971a',
    yellow: '#d79921',
    blue: '#458588',
    magenta: '#b16286',
    cyan: '#689d6a',
    white: '#a89984',
    brightBlack: '#928374',
    brightRed: '#fb4934',
    brightGreen: '#b8bb26',
    brightYellow: '#fabd2f',
    brightBlue: '#83a598',
    brightMagenta: '#d3869b',
    brightCyan: '#8ec07c',
    brightWhite: '#ebdbb2',
  }),
}

const solarizedLight: ThemeDefinition = {
  id: 'solarized-light',
  name: 'Solarized Claro',
  scheme: 'light',
  ui: {
    bg: '#fdf6e3',
    surface: '#fffbef',
    surfaceHover: '#eee8d5',
    border: '#e0d9c3',
    text: '#586e75',
    muted: '#93a1a1',
    accent: '#268bd2',
    claude: '#cb4b16',
    material: 'rgb(253 246 227 / 72%)',
    materialThick: 'rgb(255 251 239 / 84%)',
    hairline: 'rgb(88 110 117 / 14%)',
    highlight: 'rgb(255 255 255 / 60%)',
    field: 'rgb(255 251 239 / 85%)',
    onAccent: '#fdf6e3',
    shadowStrength: 0.35,
  },
  terminal: term('#fdf6e3', '#586e75', '#586e75', '#eee8d5', {
    black: '#073642',
    red: '#dc322f',
    green: '#859900',
    yellow: '#b58900',
    blue: '#268bd2',
    magenta: '#d33682',
    cyan: '#2aa198',
    white: '#93a1a1',
    brightBlack: '#002b36',
    brightRed: '#cb4b16',
    brightGreen: '#586e75',
    brightYellow: '#657b83',
    brightBlue: '#839496',
    brightMagenta: '#6c71c4',
    brightCyan: '#93a1a1',
    brightWhite: '#657b83',
  }),
}

const oneDark: ThemeDefinition = {
  id: 'one-dark',
  name: 'One Dark',
  scheme: 'dark',
  ui: {
    bg: '#282c34',
    surface: '#2f333d',
    surfaceHover: '#363b46',
    border: '#3e4451',
    text: '#d7dae0',
    muted: '#7f8796',
    accent: '#61afef',
    claude: '#d19a66',
    material: 'rgb(40 44 52 / 64%)',
    materialThick: 'rgb(47 51 61 / 78%)',
    hairline: 'rgb(255 255 255 / 8%)',
    highlight: 'rgb(255 255 255 / 6%)',
    field: 'rgb(33 37 43 / 75%)',
    onAccent: '#282c34',
    shadowStrength: 1,
  },
  terminal: term('#282c34', '#abb2bf', '#528bff', '#3e4451', {
    black: '#282c34',
    red: '#e06c75',
    green: '#98c379',
    yellow: '#e5c07b',
    blue: '#61afef',
    magenta: '#c678dd',
    cyan: '#56b6c2',
    white: '#abb2bf',
    brightBlack: '#5c6370',
    brightRed: '#e06c75',
    brightGreen: '#98c379',
    brightYellow: '#e5c07b',
    brightBlue: '#61afef',
    brightMagenta: '#c678dd',
    brightCyan: '#56b6c2',
    brightWhite: '#ffffff',
  }),
}

/**
 * Vesper++ ("Vesper ++", de Obstinate, MIT): o Vesper de Rauno Freiberg com mais cor. Cores tiradas do
 * próprio tema do VS Code (obstinate.vesper-pp 2.0.0): fundo #101010, laranja #FFC799, menta #99FFE4,
 * salmão #FF8080 e rosa #FBADFF. Ajustes para o terminal:
 * - o tema não define `terminal.foreground` nem cursor: valem o `editor.foreground` (#FFF) e o laranja;
 * - a seleção #FFFFFF25 vira a cor sólida equivalente sobre o fundo (#333333);
 * - `ansiBrightBlack` no original é #101010, igual ao fundo, e deixaria invisíveis as previsões do
 *   PSReadLine, os comentários e as datas; usa o cinza do título do tema (#7E7E7E).
 */
const vesperPlusPlus: ThemeDefinition = {
  id: 'vesper-plus-plus',
  name: 'Vesper++',
  scheme: 'dark',
  credit: { author: 'Obstinate', source: 'https://marketplace.visualstudio.com/items?itemName=Obstinate.vesper-pp' },
  ui: {
    bg: '#101010',
    surface: '#161616',
    surfaceHover: '#232323',
    border: '#282828',
    text: '#ffffff',
    muted: '#a0a0a0',
    accent: '#ffc799',
    claude: '#ff8080',
    material: 'rgb(16 16 16 / 64%)',
    materialThick: 'rgb(22 22 22 / 82%)',
    hairline: 'rgb(255 255 255 / 8%)',
    highlight: 'rgb(255 255 255 / 5%)',
    field: '#1c1c1c',
    onAccent: '#000000',
    shadowStrength: 1,
  },
  terminal: term('#101010', '#ffffff', '#ffc799', '#333333', {
    black: '#101010',
    red: '#ff8080',
    green: '#99ffe4',
    yellow: '#ffc799',
    blue: '#ffc799',
    magenta: '#fbadff',
    cyan: '#99ffe4',
    white: '#e3e3dd',
    brightBlack: '#7e7e7e',
    brightRed: '#ff8080',
    brightGreen: '#99ffe4',
    brightYellow: '#ffc799',
    brightBlue: '#ffc799',
    brightMagenta: '#fbadff',
    brightCyan: '#99ffe4',
    brightWhite: '#f8f8f2',
  }),
}

export const THEMES: readonly ThemeDefinition[] = [
  termoDark,
  termoLight,
  dracula,
  nord,
  catppuccinMocha,
  catppuccinLatte,
  gruvboxDark,
  solarizedLight,
  oneDark,
  vesperPlusPlus,
]

/** `system` segue o claro/escuro do Windows. */
export const SYSTEM_THEME = 'system'
export const DEFAULT_DARK = termoDark
export const DEFAULT_LIGHT = termoLight

/**
 * Esquemas do TerminalSplash (terminalsplash.com), convertidos por scripts/import-terminalsplash.mjs.
 * A interface de cada um é gerada a partir das cores do terminal (derive.ts).
 */
export const SPLASH_THEMES: readonly ThemeDefinition[] = (splashSchemes as TerminalScheme[]).map(themeFromScheme)

const BY_ID = new Map<string, ThemeDefinition>([...THEMES, ...SPLASH_THEMES].map((t) => [t.id, t]))

export interface ThemeOption {
  id: string
  name: string
  theme?: ThemeDefinition
}

/** Grupos do seletor: Termo (com "Sistema" primeiro) e TerminalSplash. */
export const THEME_GROUPS: readonly { label: string; options: readonly ThemeOption[] }[] = [
  {
    label: 'Termo',
    options: [
      { id: SYSTEM_THEME, name: 'Sistema (claro/escuro do Windows)' },
      ...THEMES.map((theme) => ({ id: theme.id, name: theme.name, theme })),
    ],
  },
  {
    label: `TerminalSplash · ${SPLASH_THEMES.length} temas`,
    options: SPLASH_THEMES.map((theme) => ({ id: theme.id, name: theme.name, theme })),
  },
]

export const THEME_OPTIONS: readonly ThemeOption[] = THEME_GROUPS.flatMap((g) => g.options)

// ---- Temas importados de outros terminais (settings.customThemes) ----

let customList: readonly ThemeDefinition[] = []
let customById = new Map<string, ThemeDefinition>()
let customKey = '[]'

/**
 * Registra os temas importados (vindos das configurações). O App chama a cada render, antes do
 * `useTheme`; a lista só é refeita quando muda.
 */
export function setCustomThemes(list: readonly TerminalScheme[] | undefined) {
  const key = JSON.stringify(list ?? [])
  if (key === customKey) return
  customKey = key
  customList = (list ?? []).map(themeFromScheme)
  customById = new Map(customList.map((t) => [t.id, t]))
}

/** Tema importado (id `custom-...`). */
export const isCustomTheme = (id: string) => customById.has(id)

/** Grupos do seletor com os importados no topo, quando houver. */
export function themeGroups(): readonly { label: string; options: readonly ThemeOption[] }[] {
  if (customList.length === 0) return THEME_GROUPS
  const imported = {
    label: `Importados · ${customList.length}`,
    options: customList.map((theme) => ({ id: theme.id, name: theme.name, theme })),
  }
  return [THEME_GROUPS[0], imported, ...THEME_GROUPS.slice(1)]
}

export const findTheme = (id: string) => BY_ID.get(id) ?? customById.get(id)

/** Resolve o id salvo para um tema; id desconhecido cai no padrão do sistema. */
export function resolveTheme(id: string, systemPrefersDark: boolean): ThemeDefinition {
  return findTheme(id) ?? (systemPrefersDark ? DEFAULT_DARK : DEFAULT_LIGHT)
}
