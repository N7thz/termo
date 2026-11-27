import { open as openDialog } from '@tauri-apps/plugin-dialog'
import { Button } from '@ui-sdk/react/button'
import { SegmentedControl, SegmentedControlIndicator, SegmentedControlItem } from '@ui-sdk/react/segmented-control'
import { Switch, SwitchThumb } from '@ui-sdk/react/switch'
import { ImagePlus, SkipForward, X } from 'lucide-react'
import { type ReactNode, useState } from 'react'
import { actionButton } from '../../lib/ui'
import type { BackgroundSettings, Settings } from '../../shared/types'
import { requestNextBackground } from './BackgroundLayer'
import { BackgroundPreview, BackgroundThumb } from './BackgroundPreview'
import {
  addImages,
  BG_BLUR_MAX,
  BG_OPACITY_MIN,
  CHANGE_PRESETS,
  clampBlur,
  clampGlow,
  clampOpacity,
  FITS,
  fileName,
  GLOW_MIN,
  IMAGE_EXTENSIONS,
  MAX_BACKGROUNDS,
} from './background'

const SEGMENTED = 'relative flex rounded-lg border border-border bg-field p-0.5'
const INDICATOR =
  'absolute top-(--segmented-control-indicator-top) left-(--segmented-control-indicator-left) h-(--segmented-control-indicator-height) w-(--segmented-control-indicator-width) rounded-md bg-surface-hover shadow-tab transition-[left,width] duration-200 ease-spring-soft motion-reduce:transition-none'
const SEGMENT =
  'relative z-1 flex-1 rounded-md px-2 py-1 text-center text-[12px] text-muted transition-colors focus-visible:outline-2 focus-visible:outline-accent data-checked:text-text'
const RANGE = 'h-1 w-full cursor-pointer accent-(--accent)'

function Row({ label, value, children }: { label: string; value?: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <span className="flex items-center justify-between text-[13px] tracking-[0.005em]">
        {label}
        {value && <span className="text-[12px] tabular-nums text-muted">{value}</span>}
      </span>
      {children}
    </div>
  )
}

interface Props {
  settings: Settings
  onChange: (patch: Partial<Settings>) => void
  switchClass: string
  thumbClass: string
}

/** Imagem de fundo: imagens, onde aparece, opacidade, desfoque, ajuste e troca automática. */
export function BackgroundSettingsSection({ settings, onChange, switchClass, thumbClass }: Props) {
  const bg = settings.background
  const set = (patch: Partial<BackgroundSettings>) => onChange({ background: { ...bg, ...patch } })
  // Sliders: o valor anda junto com o dedo; salva ao soltar (cada gravação passa pelo Rust e pelo disco).
  const [opacity, setOpacity] = useState(bg.opacity)
  const [blur, setBlur] = useState(bg.blur)
  const [glow, setGlow] = useState(bg.glowStrength)
  // Imagem mostrada na prévia: a clicada na lista, ou a primeira.
  const [picked, setPicked] = useState<string | null>(null)
  const previewPath = picked && bg.images.includes(picked) ? picked : bg.images[0]

  const pick = async () => {
    const picked = await openDialog({
      multiple: true,
      title: 'Imagens de fundo',
      filters: [{ name: 'Imagens', extensions: IMAGE_EXTENSIONS }],
    }).catch(() => null)
    const paths = Array.isArray(picked) ? picked : picked ? [picked] : []
    if (paths.length === 0) return
    set({ images: addImages(bg.images, paths), enabled: true })
  }

  return (
    <>
      <section className="flex flex-col gap-3 border-t border-hairline pt-3" aria-labelledby="glow-title">
        <span className="flex items-center justify-between gap-2.5">
          <h3 id="glow-title" className="m-0 text-[12px] font-semibold tracking-[0.01em] text-muted uppercase">
            Brilho do tema
          </h3>
          <Switch
            className={switchClass}
            aria-label="Mostrar brilho do tema nas bordas da janela"
            checked={bg.glow}
            onCheckedChange={(on) => set({ glow: on })}
          >
            <SwitchThumb className={thumbClass} />
          </Switch>
        </span>
        <p className="m-0 text-[12px] text-muted">
          Dois halos suaves nas cores do tema, nas bordas da janela, em volta do terminal.
        </p>
        {bg.glow && (
          <Row label="Intensidade do brilho" value={`${glow}%`}>
            <input
              type="range"
              aria-label="Intensidade do brilho"
              className={RANGE}
              min={GLOW_MIN}
              max={100}
              step={5}
              value={glow}
              onChange={(e) => setGlow(clampGlow(Number(e.currentTarget.value)))}
              onPointerUp={() => glow !== bg.glowStrength && set({ glowStrength: glow })}
              onKeyUp={() => glow !== bg.glowStrength && set({ glowStrength: glow })}
            />
          </Row>
        )}
      </section>
      <section className="flex flex-col gap-3 border-t border-hairline pt-3" aria-labelledby="background-title">
        <span className="flex items-center justify-between gap-2.5">
          <h3 id="background-title" className="m-0 text-[12px] font-semibold tracking-[0.01em] text-muted uppercase">
            Imagem de fundo
          </h3>
          <Switch
            className={switchClass}
            aria-label="Mostrar imagem de fundo"
            checked={bg.enabled}
            onCheckedChange={(enabled) => set({ enabled })}
          >
            <SwitchThumb className={thumbClass} />
          </Switch>
        </span>

        {previewPath && <BackgroundPreview path={previewPath} settings={bg} opacity={opacity} blur={blur} />}

        {bg.images.length > 0 && (
          <ul className="m-0 flex list-none flex-col gap-0.5 p-0" aria-label="Imagens de fundo">
            {bg.images.map((path) => (
              <li
                key={path}
                className={`group flex h-8 items-center gap-1 rounded-[7px] pr-1 text-[12.5px] hover:bg-surface-hover ${path === previewPath ? 'bg-surface-hover' : ''}`}
                title={path}
              >
                <button
                  type="button"
                  aria-pressed={path === previewPath}
                  aria-label={`Ver ${fileName(path)} na prévia`}
                  className="flex h-full min-w-0 flex-1 items-center gap-2 rounded-[7px] pl-1.5 text-left focus-visible:outline-2 focus-visible:outline-accent"
                  onClick={() => setPicked(path)}
                >
                  <BackgroundThumb path={path} />
                  <span className="min-w-0 flex-1 truncate">{fileName(path)}</span>
                </button>
                <button
                  type="button"
                  aria-label={`Remover ${fileName(path)}`}
                  className="grid size-5 place-items-center rounded-[5px] text-muted opacity-0 [transition:opacity_120ms_ease-out] group-hover:opacity-100 hover:text-text focus-visible:opacity-100 focus-visible:outline-2 focus-visible:outline-accent"
                  onClick={() => set({ images: bg.images.filter((p) => p !== path) })}
                >
                  <X size={13} />
                </button>
              </li>
            ))}
          </ul>
        )}

        <div className="flex items-center gap-1.5">
          <Button
            className={`${actionButton} text-[12.5px] text-text`}
            onClick={() => void pick()}
            disabled={bg.images.length >= MAX_BACKGROUNDS}
          >
            <ImagePlus size={14} className="flex-none" />
            {bg.images.length === 0 ? 'Escolher imagens…' : 'Adicionar…'}
          </Button>
          {bg.enabled && bg.images.length > 1 && (
            <Button className={`${actionButton} text-[12.5px] text-text`} onClick={requestNextBackground}>
              <SkipForward size={14} className="flex-none" />
              Próxima
            </Button>
          )}
        </div>

        {bg.images.length > 0 && (
          <>
            <Row label="Onde aparece">
              <SegmentedControl
                aria-label="Onde a imagem aparece"
                value={bg.target}
                onValueChange={(v) => v && set({ target: v as BackgroundSettings['target'] })}
                className={SEGMENTED}
              >
                <SegmentedControlIndicator className={INDICATOR} />
                <SegmentedControlItem value="terminal" className={SEGMENT}>
                  Atrás do terminal
                </SegmentedControlItem>
                <SegmentedControlItem value="window" className={SEGMENT}>
                  Janela inteira
                </SegmentedControlItem>
              </SegmentedControl>
            </Row>

            <Row label="Ajuste">
              <SegmentedControl
                aria-label="Ajuste da imagem"
                value={bg.fit}
                onValueChange={(v) => v && set({ fit: v as BackgroundSettings['fit'] })}
                className={SEGMENTED}
              >
                <SegmentedControlIndicator className={INDICATOR} />
                {FITS.map((f) => (
                  <SegmentedControlItem key={f.value} value={f.value} className={SEGMENT}>
                    {f.label}
                  </SegmentedControlItem>
                ))}
              </SegmentedControl>
            </Row>

            <Row label="Opacidade" value={`${opacity}%`}>
              <input
                type="range"
                aria-label="Opacidade"
                className={RANGE}
                min={BG_OPACITY_MIN}
                max={100}
                step={5}
                value={opacity}
                onChange={(e) => setOpacity(clampOpacity(Number(e.currentTarget.value)))}
                onPointerUp={() => opacity !== bg.opacity && set({ opacity })}
                onKeyUp={() => opacity !== bg.opacity && set({ opacity })}
              />
            </Row>

            <Row label="Desfoque" value={blur === 0 ? 'Nenhum' : `${blur}px`}>
              <input
                type="range"
                aria-label="Desfoque"
                className={RANGE}
                min={0}
                max={BG_BLUR_MAX}
                step={1}
                value={blur}
                onChange={(e) => setBlur(clampBlur(Number(e.currentTarget.value)))}
                onPointerUp={() => blur !== bg.blur && set({ blur })}
                onKeyUp={() => blur !== bg.blur && set({ blur })}
              />
            </Row>

            {bg.images.length > 1 && (
              <>
                <Row label="Trocar de imagem">
                  <SegmentedControl
                    aria-label="Intervalo de troca"
                    value={String(bg.changeSecs)}
                    onValueChange={(v) => v && set({ changeSecs: Number(v) })}
                    className={SEGMENTED}
                  >
                    <SegmentedControlIndicator
                      className={`${INDICATOR} ${CHANGE_PRESETS.some((p) => p.secs === bg.changeSecs) ? '' : 'opacity-0'}`}
                    />
                    {CHANGE_PRESETS.map((p) => (
                      <SegmentedControlItem key={p.secs} value={String(p.secs)} className={SEGMENT}>
                        {p.label}
                      </SegmentedControlItem>
                    ))}
                  </SegmentedControl>
                </Row>
                <span className="flex items-center justify-between gap-2.5 text-[13px] tracking-[0.005em]">
                  Ordem aleatória
                  <Switch
                    className={switchClass}
                    aria-label="Ordem aleatória"
                    checked={bg.shuffle}
                    onCheckedChange={(shuffle) => set({ shuffle })}
                  >
                    <SwitchThumb className={thumbClass} />
                  </Switch>
                </span>
              </>
            )}
          </>
        )}
      </section>
    </>
  )
}
