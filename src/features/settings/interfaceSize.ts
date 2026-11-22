/**
 * Tamanho da interface: zoom do webview inteiro (barras, lateral, menus, diálogos, tudo junto e nítido,
 * como o zoom do navegador). O terminal compensa o zoom na fonte, então o texto dele não muda.
 */
import { getCurrentWebview } from '@tauri-apps/api/webview'
import { useEffect } from 'react'
import type { Settings } from '../../shared/types'

export type InterfaceSize = Settings['interfaceSize']

export const INTERFACE_SIZES: { value: InterfaceSize; label: string; zoom: number }[] = [
  { value: 'small', label: 'Pequeno', zoom: 0.9 },
  { value: 'medium', label: 'Médio', zoom: 1 },
  { value: 'large', label: 'Grande', zoom: 1.15 },
]

export function zoomFor(size: InterfaceSize | undefined): number {
  return INTERFACE_SIZES.find((s) => s.value === size)?.zoom ?? 1
}

/** Tamanho em pixels CSS para a fonte do terminal sair com `fontSize` pixels reais, apesar do zoom. */
export function terminalFontSize(fontSize: number, size: InterfaceSize | undefined): number {
  return Math.round((fontSize / zoomFor(size)) * 100) / 100
}

let current = 1

/** Zoom aplicado agora: o painel do navegador converte as coordenadas CSS em pixels lógicos com ele. */
export function currentZoom(): number {
  return current
}

/** Aplica o zoom quando a configuração muda. */
export function useInterfaceZoom(size: InterfaceSize | undefined) {
  useEffect(() => {
    const zoom = zoomFor(size)
    current = zoom
    getCurrentWebview()
      .setZoom(zoom)
      .catch((err) => console.error('[termo] falha ao aplicar o tamanho da interface', err))
  }, [size])
}
