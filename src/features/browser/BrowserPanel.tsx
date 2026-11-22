import { listen } from '@tauri-apps/api/event'
import { ArrowLeft, ArrowRight, ExternalLink, Globe, LoaderCircle, RotateCw, X } from 'lucide-react'
import { type PointerEvent, useEffect, useRef, useState } from 'react'
import { ipc } from '../../lib/ipc'
import { currentZoom } from '../settings/interfaceSize'
import { connectPanel, type LinkRequest, setLinkTarget } from './links'
import type { BrowserBounds, BrowserEvent, LinkTarget } from './types'
import { splitUrl } from './url'

const MIN_WIDTH = 320
const WIDTH_KEY = 'termo.browserWidth'
// Popups da interface (portais no body, diálogos, menus, listas, tooltips) ficam por baixo do webview nativo.
// Enquanto um deles estiver visível sobre a área do painel, o webview some.
const OVERLAYS =
  'body > :not(#root):not(script):not(style):not(link), [role="dialog"], [role="alertdialog"], [role="menu"], [role="listbox"], [role="tooltip"]'

function covered(area: DOMRect) {
  for (const el of document.querySelectorAll<HTMLElement>(OVERLAYS)) {
    if (el.closest('aside[aria-label="Navegador"]')) continue
    for (const r of [el.getBoundingClientRect(), ...Array.from(el.children, (c) => c.getBoundingClientRect())]) {
      if (
        r.width > 0 &&
        r.height > 0 &&
        r.left < area.right &&
        r.right > area.left &&
        r.top < area.bottom &&
        r.bottom > area.top
      )
        return true
    }
  }
  return false
}

// Mesmo toque dos botões da barra: realce no hover, encolhe no pointer-down (feedback imediato).
const toolButton =
  'grid size-7 flex-none place-items-center rounded-[7px] text-muted [transition:background-color_140ms_ease-out,color_140ms_ease-out,scale_400ms_var(--spring)] hover:bg-surface-hover hover:text-text active:scale-[0.92] active:bg-border active:duration-50 disabled:opacity-40 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-accent motion-reduce:active:scale-100'

function savedWidth() {
  try {
    const n = Number(localStorage.getItem(WIDTH_KEY))
    return Number.isFinite(n) && n >= MIN_WIDTH ? n : null
  } catch {
    return null
  }
}

function boundsOf(el: HTMLElement): BrowserBounds {
  // Com o zoom da interface, 1px CSS vale `zoom` pixels lógicos da janela.
  const r = el.getBoundingClientRect()
  const z = currentZoom()
  return { x: r.left * z, y: r.top * z, width: r.width * z, height: r.height * z }
}

/**
 * Painel de navegador ao lado do terminal. A página roda num webview nativo (no Rust) sobreposto à
 * área `viewport`; este componente só desenha a barra de ferramentas e mantém o webview no lugar.
 * Sem página aberta, não ocupa espaço.
 */
export function BrowserPanel({ linkTarget }: { linkTarget: LinkTarget }) {
  const [request, setRequest] = useState<LinkRequest | null>(null)
  const [url, setUrl] = useState('')
  const [title, setTitle] = useState('')
  const [loading, setLoading] = useState(false)
  const [width, setWidth] = useState<number | null>(savedWidth)
  const viewport = useRef<HTMLDivElement>(null)
  const panel = useRef<HTMLElement>(null)

  useEffect(() => setLinkTarget(linkTarget), [linkTarget])
  useEffect(() => connectPanel(setRequest), [])

  useEffect(() => {
    const off = listen<BrowserEvent>('browser', ({ payload }) => {
      if (payload.type === 'nav') {
        setUrl(payload.url)
        setLoading(payload.loading)
      } else {
        setTitle(payload.title)
      }
    })
    return () => void off.then((fn) => fn())
  }, [])

  // Abre (ou navega) quando chega um pedido, depois que o painel já tem tamanho na tela.
  useEffect(() => {
    const el = viewport.current
    if (!request || !el) return
    setUrl(request.url)
    setTitle('')
    setLoading(true)
    const frame = requestAnimationFrame(() => {
      ipc.browserOpen(request.url, boundsOf(el)).catch((err) => {
        console.error('[termo] falha ao abrir o painel', err)
        setLoading(false)
      })
    })
    return () => cancelAnimationFrame(frame)
  }, [request])

  // Acompanha a área do painel (janela, lateral, divisor) e esconde o webview sob diálogos e menus.
  useEffect(() => {
    const el = viewport.current
    if (!request || !el) return
    const sync = () => void ipc.browserBounds(boundsOf(el)).catch(() => {})
    const ro = new ResizeObserver(sync)
    ro.observe(el)
    window.addEventListener('resize', sync)
    let hidden = false
    const timer = window.setInterval(() => {
      const now = covered(el.getBoundingClientRect())
      if (now !== hidden) {
        hidden = now
        void ipc.browserVisible(!now).catch(() => {})
        if (!now) sync()
      }
    }, 150)
    return () => {
      ro.disconnect()
      window.removeEventListener('resize', sync)
      window.clearInterval(timer)
    }
  }, [request])

  const close = () => {
    void ipc.browserClose().catch(() => {})
    setRequest(null)
    setUrl('')
    setTitle('')
    setLoading(false)
  }

  const startResize = (e: PointerEvent<HTMLDivElement>) => {
    const host = panel.current
    if (!host) return
    e.preventDefault()
    e.currentTarget.setPointerCapture(e.pointerId)
    const right = host.getBoundingClientRect().right
    const max = () => Math.max(MIN_WIDTH, window.innerWidth - 360)
    const move = (ev: globalThis.PointerEvent) => setWidth(Math.min(max(), Math.max(MIN_WIDTH, right - ev.clientX)))
    const up = (ev: globalThis.PointerEvent) => {
      const final = Math.min(max(), Math.max(MIN_WIDTH, right - ev.clientX))
      try {
        localStorage.setItem(WIDTH_KEY, String(Math.round(final)))
      } catch {}
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
  }

  if (!request) return null

  const { host, rest } = splitUrl(url)
  const icon = { size: 15, strokeWidth: 1.75 } as const

  return (
    // Um segundo cartão, irmão do terminal: mesmo raio, mesma sombra, mesmo fundo do tema.
    <aside
      ref={panel}
      aria-label="Navegador"
      className="relative flex min-h-0 flex-none flex-col overflow-hidden rounded-[10px] bg-bg shadow-card"
      style={{ width: width ?? '45%' }}
    >
      <div className="flex h-10 flex-none items-center gap-2 px-2">
        {/* Navegação agrupada (perto = relacionado); ações da página no outro extremo. */}
        <div className="flex flex-none items-center gap-0.5">
          <button type="button" className={toolButton} title="Voltar" onClick={() => void ipc.browserGo('back')}>
            <ArrowLeft {...icon} />
          </button>
          <button type="button" className={toolButton} title="Avançar" onClick={() => void ipc.browserGo('forward')}>
            <ArrowRight {...icon} />
          </button>
          <button type="button" className={toolButton} title="Recarregar" onClick={() => void ipc.browserGo('reload')}>
            {loading ? (
              <LoaderCircle {...icon} size={14} className="animate-spin motion-reduce:animate-none" />
            ) : (
              <RotateCw {...icon} size={14} />
            )}
          </button>
        </div>
        <div
          className="flex h-7 min-w-0 flex-1 items-center gap-2 rounded-[7px] bg-field px-2.5 text-[12px] tracking-[0.005em]"
          title={
            title
              ? `${title}
${url}`
              : url
          }
        >
          <Globe size={13} strokeWidth={1.75} className="flex-none text-muted" />
          <span className="min-w-0 truncate">
            <span className="text-text">{host}</span>
            <span className="text-muted">{rest}</span>
          </span>
        </div>
        <div className="flex flex-none items-center gap-0.5">
          <button
            type="button"
            className={toolButton}
            title="Abrir no navegador padrão"
            onClick={() => url && void ipc.openUrl(url)}
          >
            <ExternalLink {...icon} size={14} />
          </button>
          <button type="button" className={toolButton} title="Fechar o painel" onClick={close}>
            <X {...icon} />
          </button>
        </div>
      </div>
      {/* A página é um webview nativo e retangular: recuado 4px das bordas, os cantos ficam dentro do arredondado. */}
      <div ref={viewport} className="mx-1 mb-1 min-h-0 flex-1 rounded-[6px] bg-surface" />
      {/* Divisor: arraste para mudar a largura. Fica no vão entre os cartões. */}
      {/* biome-ignore lint/a11y/useSemanticElements: divisor arrastável; um <hr> não recebe ponteiro assim. */}
      <div
        role="separator"
        aria-orientation="vertical"
        aria-label="Redimensionar o navegador"
        className="group/sep absolute inset-y-3 left-0 z-10 flex w-2 cursor-col-resize justify-start"
        onPointerDown={startResize}
      >
        <span className="h-full w-0.5 rounded-full bg-accent opacity-0 transition-opacity duration-150 group-hover/sep:opacity-60 group-active/sep:opacity-100" />
      </div>
    </aside>
  )
}
