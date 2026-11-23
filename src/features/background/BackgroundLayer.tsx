import { useEffect, useRef, useState } from 'react'
import { ipc } from '../../lib/ipc'
import type { BackgroundSettings } from '../../shared/types'
import { clampOpacity, imageStyle, isBackgroundActive, nextIndex } from './background'

/** Pedido de troca de imagem (paleta: "Próxima imagem de fundo"). */
export const NEXT_BACKGROUND_EVENT = 'termo:background-next'
export const requestNextBackground = () => window.dispatchEvent(new Event(NEXT_BACKGROUND_EVENT))

/** Quantas imagens já lidas ficam guardadas (o `data:` de uma foto passa de alguns MB). */
const CACHE_SIZE = 4
/** Duração do fade entre duas imagens (sem fade com "reduzir movimento"). */
const FADE_MS = 700

interface Slide {
  key: number
  url: string
}

/**
 * A imagem de fundo e o slideshow. Em `terminal` fica dentro do cartão do terminal, atrás das abas;
 * em `window` cobre a janela inteira por cima de tudo, sem pegar cliques.
 */
export function BackgroundLayer({ settings, target }: { settings: BackgroundSettings; target: 'terminal' | 'window' }) {
  const active = isBackgroundActive(settings) && settings.target === target
  const images = active ? settings.images : []
  const listKey = images.join('\n')
  const [index, setIndex] = useState(0)
  const [slides, setSlides] = useState<Slide[]>([])
  const cache = useRef(new Map<string, string>())
  const seq = useRef(0)

  // Lista nova (imagem adicionada, removida ou fundo religado): volta à primeira.
  // biome-ignore lint/correctness/useExhaustiveDependencies: listKey resume a lista de imagens
  useEffect(() => {
    setIndex((i) => (i < images.length ? i : 0))
    if (images.length === 0) setSlides([])
  }, [listKey])

  // Lê a imagem atual (pelo IPC, como `data:`) e põe por cima da anterior; a anterior sai depois do fade.
  // Imagem que não abre (apagada, grande demais) é pulada.
  // biome-ignore lint/correctness/useExhaustiveDependencies: listKey resume a lista de imagens
  useEffect(() => {
    const path = images[index]
    if (!path) return
    let cancelled = false
    const show = (url: string) => {
      if (cancelled) return
      const key = ++seq.current
      setSlides((cur) => [...cur.slice(-1), { key, url }])
      window.setTimeout(() => setSlides((cur) => cur.filter((s) => s.key >= key)), FADE_MS + 100)
    }
    const hit = cache.current.get(path)
    if (hit) show(hit)
    else
      ipc
        .imagePreview(path)
        .then(({ dataUrl }) => {
          cache.current.set(path, dataUrl)
          while (cache.current.size > CACHE_SIZE) {
            const oldest = cache.current.keys().next().value
            if (oldest === undefined) break
            cache.current.delete(oldest)
          }
          show(dataUrl)
        })
        .catch(() => {
          if (!cancelled && images.length > 1) setIndex((i) => nextIndex(i, images.length, false))
        })
    return () => {
      cancelled = true
    }
  }, [index, listKey])

  // Slideshow: troca a cada `changeSecs`; o pedido da paleta troca na hora.
  // biome-ignore lint/correctness/useExhaustiveDependencies: listKey resume a lista de imagens
  useEffect(() => {
    if (!active) return
    const advance = () => setIndex((i) => nextIndex(i, images.length, settings.shuffle))
    window.addEventListener(NEXT_BACKGROUND_EVENT, advance)
    const timer =
      settings.changeSecs > 0 && images.length > 1 ? window.setInterval(advance, settings.changeSecs * 1000) : 0
    return () => {
      window.removeEventListener(NEXT_BACKGROUND_EVENT, advance)
      if (timer) window.clearInterval(timer)
    }
  }, [active, listKey, settings.changeSecs, settings.shuffle])

  if (!active || slides.length === 0) return null
  return (
    <div
      aria-hidden
      className={`pointer-events-none overflow-hidden [transition:opacity_200ms_ease-out] ${target === 'window' ? 'fixed inset-0 z-50' : 'absolute inset-0'}`}
      style={{ opacity: clampOpacity(settings.opacity) / 100 }}
    >
      {slides.map((s) => (
        <div
          key={s.key}
          className="absolute [transition:opacity_700ms_ease-out] starting:opacity-0 motion-reduce:transition-none"
          style={imageStyle(settings, s.url)}
        />
      ))}
    </div>
  )
}
