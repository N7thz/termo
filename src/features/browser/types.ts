/** Área do painel em pixels lógicos (CSS com zoom 100%). Mesmo formato de `browser::Bounds` no Rust. */
export interface BrowserBounds {
  x: number
  y: number
  width: number
  height: number
}

/** Eventos do webview do painel (`browser::BrowserEvent` no Rust), no evento `browser`. */
export type BrowserEvent = { type: 'nav'; url: string; loading: boolean } | { type: 'title'; title: string }

export type LinkTarget = 'panel' | 'browser'
