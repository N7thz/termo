import { type PointerEvent as ReactPointerEvent, useLayoutEffect, useRef, useState } from 'react'

/**
 * Onde a aba arrastada está passando:
 * - `before`/`after`: em cima ou embaixo de outra aba da lateral (`data-drop-tab`);
 * - `group`: no cabeçalho do grupo (`data-drop-group`), para ir ao fim dele;
 * - `loose`: no fim das abas soltas (`data-drop-loose`);
 * - `split`: no terminal (`data-drop-split`), para abrir ao lado da aba ativa.
 */
export type DropTarget =
  | { kind: 'before' | 'after'; key: number }
  | { kind: 'group'; group: string }
  | { kind: 'loose' }
  | { kind: 'split' }

/** Distância (px) antes de virar arrasto: menos que isso é clique. */
const THRESHOLD = 5
/** A mesma mola das transições da interface (`--spring` em tailwind.css). */
export const SPRING = 'linear(0, 0.18 4%, 0.52 9%, 0.78 15%, 0.93 22%, 1.01 30%, 1.02 38%, 1.01 48%, 1 60%, 1)'

export const reducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches

/** Deslocamento vertical que uma transformação (ou animação) aplica agora no elemento. */
export function translateY(el: Element): number {
  const t = getComputedStyle(el).transform
  return t && t !== 'none' ? new DOMMatrixReadOnly(t).m42 : 0
}

const cardOf = (key: number) => document.querySelector<HTMLElement>(`[data-drop-tab="${key}"]`)

function targetAt(x: number, y: number, dragged: number): DropTarget | null {
  const el = document.elementFromPoint(x, y)
  if (!el) return null
  const tab = el.closest<HTMLElement>('[data-drop-tab]')
  if (tab) {
    const key = Number(tab.dataset.dropTab)
    if (key === dragged) return null
    // A metade de cima/baixo pela posição de layout (sem a animação de quem está abrindo espaço).
    const r = tab.getBoundingClientRect()
    const top = r.top - translateY(tab)
    return { kind: y < top + r.height / 2 ? 'before' : 'after', key }
  }
  const group = el.closest<HTMLElement>('[data-drop-group]')
  if (group?.dataset.dropGroup) return { kind: 'group', group: group.dataset.dropGroup }
  if (el.closest('[data-drop-loose]')) return { kind: 'loose' }
  if (el.closest('[data-drop-split]')) return { kind: 'split' }
  return null
}

interface Callbacks {
  /** Passando sobre a lateral: a ordem muda ao vivo, como as abas do Chrome. */
  onMove: (key: number, target: DropTarget) => void
  /** Soltou sobre o terminal. */
  onSplit: (key: number) => void
}

/**
 * Arrastar as abas da lateral no estilo do Chrome: a aba segue o ponteiro, as outras abrem espaço
 * (a lateral anima a troca, ver `useFlip`) e, ao soltar, ela assenta no lugar com uma mola.
 *
 * Usa eventos do ponteiro na janela e não o arrastar nativo do HTML, que no Windows o Tauri toma
 * para soltar arquivos. A janela (e não a aba) escuta porque a aba pode ser recriada ao mudar de grupo.
 */
export function useTabDrag(callbacks: Callbacks) {
  const cb = useRef(callbacks)
  cb.current = callbacks
  const [dragKey, setDragKey] = useState<number | null>(null)
  const st = useRef<{ key: number; x0: number; y0: number; grab: number; y: number; active: boolean } | null>(null)
  const splitEl = useRef<Element | null>(null)

  /** Põe a aba arrastada sob o ponteiro, a partir de onde o layout a deixou agora. */
  const follow = () => {
    const s = st.current
    const el = s?.active ? cardOf(s.key) : null
    if (!s || !el) return
    el.style.transform = 'none'
    const top = el.getBoundingClientRect().top
    el.style.transform = `translateY(${s.y - s.grab - top}px)`
  }

  // Depois de cada render (a ordem mudou e a aba foi para outro lugar), ela continua sob o ponteiro.
  useLayoutEffect(follow)

  const markSplit = (el: Element | null) => {
    if (splitEl.current === el) return
    splitEl.current?.removeAttribute('data-drop-active')
    el?.setAttribute('data-drop-active', '')
    splitEl.current = el
  }

  const start = (key: number, e: ReactPointerEvent<HTMLElement>) => {
    if (e.button !== 0 || (e.target as HTMLElement).closest('[data-no-drag]')) return
    const grab = e.clientY - e.currentTarget.getBoundingClientRect().top
    st.current = { key, x0: e.clientX, y0: e.clientY, grab, y: e.clientY, active: false }

    const move = (ev: PointerEvent) => {
      const s = st.current
      if (!s) return
      if (!s.active) {
        if (Math.hypot(ev.clientX - s.x0, ev.clientY - s.y0) < THRESHOLD) return
        s.active = true
        for (const a of cardOf(key)?.getAnimations() ?? []) a.cancel()
        document.documentElement.style.cursor = 'grabbing'
        setDragKey(key)
      }
      s.y = ev.clientY
      follow()
      const target = targetAt(ev.clientX, ev.clientY, key)
      markSplit(target?.kind === 'split' ? document.querySelector('[data-drop-split]') : null)
      if (target && target.kind !== 'split') cb.current.onMove(key, target)
    }

    const end = (ev: PointerEvent, cancelled: boolean) => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
      window.removeEventListener('pointercancel', cancel)
      const s = st.current
      st.current = null
      markSplit(null)
      document.documentElement.style.removeProperty('cursor')
      if (!s?.active) return
      // O soltar não vale como clique na aba (ativaria a aba arrastada).
      const swallow = (c: MouseEvent) => {
        c.preventDefault()
        c.stopPropagation()
      }
      window.addEventListener('click', swallow, { capture: true, once: true })
      setTimeout(() => window.removeEventListener('click', swallow, { capture: true }), 0)

      if (!cancelled && targetAt(ev.clientX, ev.clientY, key)?.kind === 'split') cb.current.onSplit(key)
      // Assenta: sai de onde está (sob o ponteiro) e volta ao lugar no layout com a mola.
      const el = cardOf(key)
      if (el) {
        const from = translateY(el)
        el.style.transform = ''
        if (from && !reducedMotion()) {
          el.animate([{ transform: `translateY(${from}px)` }, { transform: 'none' }], { duration: 320, easing: SPRING })
        }
      }
      setDragKey(null)
    }
    const up = (ev: PointerEvent) => end(ev, false)
    const cancel = (ev: PointerEvent) => end(ev, true)
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
    window.addEventListener('pointercancel', cancel)
  }

  const handlers = (key: number) => ({
    'data-drop-tab': key,
    onPointerDown: (e: ReactPointerEvent<HTMLElement>) => start(key, e),
  })

  return { dragKey, handlers }
}

/**
 * FLIP das abas da lateral: quando a ordem muda (arrasto, Ctrl+Shift+PgUp/PgDn, mover de grupo), cada
 * aba sai de onde estava na tela e desliza até o lugar novo. A aba sendo arrastada fica de fora.
 */
export function useFlip(container: React.RefObject<HTMLElement | null>, order: string, dragKey: number | null) {
  const positions = useRef(new Map<number, number>())
  const lastOrder = useRef(order)

  useLayoutEffect(() => {
    const box = container.current
    if (!box) return
    const base = box.getBoundingClientRect().top - box.scrollTop
    const changed = lastOrder.current !== order
    lastOrder.current = order
    const animate = changed && !reducedMotion()
    const next = new Map<number, number>()
    for (const el of box.querySelectorAll<HTMLElement>('[data-drop-tab]')) {
      const key = Number(el.dataset.dropTab)
      const shift = translateY(el)
      const top = el.getBoundingClientRect().top - shift - base
      next.set(key, top)
      const prev = positions.current.get(key)
      if (!animate || prev == null || key === dragKey) continue
      // De onde ela aparecia na tela (posição antiga + o que a animação em curso ainda deslocava).
      const delta = prev + shift - top
      if (Math.abs(delta) < 0.5) continue
      for (const a of el.getAnimations()) a.cancel()
      el.animate([{ transform: `translateY(${delta}px)` }, { transform: 'none' }], { duration: 300, easing: SPRING })
    }
    positions.current = next
  })
}
