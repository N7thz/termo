import { ImageOff } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { ipc } from '../../lib/ipc'
import type { BackgroundSettings } from '../../shared/types'
import { clampOpacity, fileName, imageStyle } from './background'

// ---- Leitura das imagens ----
// A imagem inteira (data: de até 12 MB) só fica guardada para o preview, e no máximo 3. As miniaturas
// da lista são reduzidas num canvas e a imagem grande é descartada: 50 imagens grandes na memória pesariam.

const FULL_CACHE = 3
const full = new Map<string, Promise<string>>()
const thumbs = new Map<string, Promise<string>>()
/** Uma leitura por vez para as miniaturas, para não abrir 50 arquivos grandes de uma vez. */
let queue: Promise<unknown> = Promise.resolve()

function readFull(path: string): Promise<string> {
  const hit = full.get(path)
  if (hit) return hit
  const p = ipc.imagePreview(path).then((r) => r.dataUrl)
  p.catch(() => full.delete(path))
  full.set(path, p)
  while (full.size > FULL_CACHE) {
    const oldest = full.keys().next().value
    if (oldest === undefined) break
    full.delete(oldest)
  }
  return p
}

const THUMB_W = 64
const THUMB_H = 40

function shrink(url: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => {
      const canvas = document.createElement('canvas')
      canvas.width = THUMB_W * 2
      canvas.height = THUMB_H * 2
      const ctx = canvas.getContext('2d')
      if (!ctx) return reject(new Error('sem canvas'))
      // Preenche a miniatura (como o ajuste "Preencher"), cortando o que sobra no centro.
      const scale = Math.max(canvas.width / img.naturalWidth, canvas.height / img.naturalHeight)
      const w = img.naturalWidth * scale
      const h = img.naturalHeight * scale
      ctx.drawImage(img, (canvas.width - w) / 2, (canvas.height - h) / 2, w, h)
      resolve(canvas.toDataURL('image/webp', 0.8))
    }
    img.onerror = () => reject(new Error('imagem inválida'))
    img.src = url
  })
}

function readThumb(path: string): Promise<string> {
  const hit = thumbs.get(path)
  if (hit) return hit
  const p = queue.then(() => ipc.imagePreview(path)).then((r) => shrink(r.dataUrl))
  queue = p.catch(() => undefined)
  p.catch(() => thumbs.delete(path))
  thumbs.set(path, p)
  return p
}

type Loaded = { state: 'loading' } | { state: 'ok'; url: string } | { state: 'error' }

function useLoaded(path: string | undefined, read: (p: string) => Promise<string>): Loaded {
  const [loaded, setLoaded] = useState<Loaded>({ state: 'loading' })
  // biome-ignore lint/correctness/useExhaustiveDependencies: `read` é uma das duas funções do módulo
  useEffect(() => {
    if (!path) return
    let alive = true
    setLoaded({ state: 'loading' })
    read(path).then(
      (url) => alive && setLoaded({ state: 'ok', url }),
      () => alive && setLoaded({ state: 'error' }),
    )
    return () => {
      alive = false
    }
  }, [path])
  return loaded
}

// ---- Miniatura da lista ----

/** Miniatura de uma imagem da lista (32 × 20), com o mesmo tamanho carregando, pronta ou quebrada. */
export function BackgroundThumb({ path }: { path: string }) {
  const loaded = useLoaded(path, readThumb)
  return (
    <span
      aria-hidden
      className="grid h-5 w-8 flex-none place-items-center overflow-hidden rounded-[4px] border border-hairline bg-field text-muted"
    >
      {loaded.state === 'ok' && <img src={loaded.url} alt="" className="size-full object-cover" draggable={false} />}
      {loaded.state === 'loading' && (
        <span className="size-full animate-pulse bg-surface-hover motion-reduce:animate-none" />
      )}
      {loaded.state === 'error' && <ImageOff size={11} />}
    </span>
  )
}

// ---- Preview da janela ----

const SIDEBAR_W = 240
const PROMPT_LINES = [
  { prompt: 'PS D:\\projetos\\termo>', text: 'git status' },
  { prompt: '', text: 'On branch master · 3 arquivos alterados' },
  { prompt: 'PS D:\\projetos\\termo>', text: 'bun run check' },
  { prompt: '', text: '✓ typecheck  ✓ lint  ✓ 292 testes' },
  { prompt: 'PS D:\\projetos\\termo>', text: '' },
]

interface PreviewProps {
  path: string
  settings: BackgroundSettings
  /** Valores dos sliders enquanto arrastam (ainda não salvos). */
  opacity: number
  blur: number
}

/**
 * Miniatura da janela do Termo com a imagem aplicada como no app: ajuste, opacidade, desfoque e onde
 * aparece. Desenha a janela no tamanho real e reduz, para o desfoque e os ajustes "Original" e
 * "Repetir" (em pixels) ficarem na proporção certa.
 */
export function BackgroundPreview({ path, settings, opacity, blur }: PreviewProps) {
  const loaded = useLoaded(path, readFull)
  const frameRef = useRef<HTMLDivElement>(null)
  const [frameW, setFrameW] = useState(0)
  const [win, setWin] = useState(() => ({ w: window.innerWidth, h: window.innerHeight }))

  useEffect(() => {
    const el = frameRef.current
    if (!el) return
    const ro = new ResizeObserver(() => setFrameW(el.clientWidth))
    ro.observe(el)
    const onResize = () => setWin({ w: window.innerWidth, h: window.innerHeight })
    window.addEventListener('resize', onResize)
    return () => {
      ro.disconnect()
      window.removeEventListener('resize', onResize)
    }
  }, [])

  const scale = frameW > 0 ? frameW / win.w : 0
  const terminalOnly = settings.target === 'terminal'
  const image =
    loaded.state === 'ok' ? (
      <div
        className="pointer-events-none absolute inset-0 overflow-hidden"
        style={{ opacity: clampOpacity(opacity) / 100 }}
      >
        <div className="absolute" style={imageStyle({ fit: settings.fit, blur }, loaded.url)} />
      </div>
    ) : null

  return (
    <figure className="m-0 flex flex-col gap-1.5">
      <div
        ref={frameRef}
        className="relative w-full overflow-hidden rounded-[10px] border border-border bg-bg shadow-tab"
        style={{ aspectRatio: `${win.w} / ${win.h}` }}
      >
        {scale > 0 && (
          <div
            aria-hidden
            className="absolute top-0 left-0 flex origin-top-left"
            style={{ width: win.w, height: win.h, transform: `scale(${scale})` }}
          >
            {!terminalOnly && image}
            <div
              className="relative z-1 flex h-full flex-none flex-col gap-2 bg-surface/60 p-4"
              style={{ width: SIDEBAR_W }}
            >
              {['PowerShell 7', 'Claude Code', 'Windows PowerShell'].map((t, i) => (
                <div
                  key={t}
                  className={`h-12 rounded-[10px] px-3 py-2 text-[13px] text-text ${i === 0 ? 'bg-surface-hover' : ''}`}
                >
                  {t}
                  <div className="text-[11px] text-muted">termo · master</div>
                </div>
              ))}
            </div>
            <div className="relative flex-1 overflow-hidden">
              {terminalOnly && image}
              <div className="relative z-1 flex flex-col gap-1 p-5 font-mono text-[14px] leading-6">
                {PROMPT_LINES.map((l, i) => (
                  // biome-ignore lint/suspicious/noArrayIndexKey: linhas fixas de exemplo
                  <div key={i} className="whitespace-pre">
                    {l.prompt && <span className="text-accent">{l.prompt} </span>}
                    <span className={l.prompt ? 'text-text' : 'text-muted'}>{l.text}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
        {loaded.state === 'loading' && (
          <div className="absolute inset-0 animate-pulse bg-surface-hover/50 motion-reduce:animate-none" />
        )}
        {loaded.state === 'error' && (
          <div className="absolute inset-0 grid place-items-center bg-bg/80 text-center text-[12.5px] text-muted">
            <span className="flex flex-col items-center gap-1.5 px-6">
              <ImageOff size={18} aria-hidden />
              Não foi possível abrir esta imagem (apagada, movida ou maior que 12 MB). Remova-a da lista.
            </span>
          </div>
        )}
      </div>
      <figcaption className="truncate text-[12px] text-muted" title={path}>
        Prévia: {fileName(path)}
      </figcaption>
    </figure>
  )
}
