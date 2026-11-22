import { NumberInput, NumberInputControl, NumberInputGroup } from '@ui-sdk/react/number-input'
import { SegmentedControl, SegmentedControlIndicator, SegmentedControlItem } from '@ui-sdk/react/segmented-control'
import { Check } from 'lucide-react'
import { type ReactNode, useMemo, useState } from 'react'
import { clampFontSize, FONT_MAX, FONT_MIN } from '../../shared/settings'
import type { Settings } from '../../shared/types'
import { FONT_SIZE_PRESETS, fontStack, isFontAvailable, measureWith, primaryFont, TERMINAL_FONTS } from './fonts'
import { INTERFACE_SIZES, type InterfaceSize } from './interfaceSize'

const SEGMENTED = 'relative flex rounded-lg border border-border bg-field p-0.5'
const INDICATOR =
  'absolute top-(--segmented-control-indicator-top) left-(--segmented-control-indicator-left) h-(--segmented-control-indicator-height) w-(--segmented-control-indicator-width) rounded-md bg-surface-hover shadow-tab transition-[left,width] duration-200 ease-spring-soft motion-reduce:transition-none'
const SEGMENT =
  'relative z-1 flex-1 rounded-md px-2 py-1 text-center text-[12px] tabular-nums text-muted transition-colors focus-visible:outline-2 focus-visible:outline-accent data-checked:text-text'

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-[13px] tracking-[0.005em]">{label}</span>
      {children}
    </div>
  )
}

interface Props {
  settings: Settings
  onChange: (patch: Partial<Settings>) => void
  inputClass: string
}

/** Fonte do terminal (família e tamanho, com tamanhos prontos). */
export function FontSettingsSection({ settings, onChange, inputClass }: Props) {
  const [size, setSize] = useState<number | null>(settings.fontSize)
  const current = primaryFont(settings.fontFamily)
  // Só as instaladas (a embutida sempre); mede uma vez por abertura do painel.
  const fonts = useMemo(() => {
    const measure = measureWith()
    const found = TERMINAL_FONTS.filter((name) => isFontAvailable(name, measure))
    return found.includes(current as (typeof TERMINAL_FONTS)[number]) || !current ? found : [current, ...found]
  }, [current])

  const commit = (value: number | null) => {
    const next = clampFontSize(value ?? settings.fontSize)
    setSize(next)
    if (next !== settings.fontSize) onChange({ fontSize: next })
  }
  const preset = FONT_SIZE_PRESETS.includes(settings.fontSize as (typeof FONT_SIZE_PRESETS)[number])
    ? String(settings.fontSize)
    : null

  return (
    <section className="flex flex-col gap-3 border-t border-hairline pt-3" aria-labelledby="font-title">
      <h3 id="font-title" className="m-0 text-[12px] font-semibold tracking-[0.01em] text-muted uppercase">
        Fonte
      </h3>
      <Row label="Tamanho da interface">
        <SegmentedControl
          aria-label="Tamanho da interface"
          value={settings.interfaceSize}
          onValueChange={(v) => v && onChange({ interfaceSize: v as InterfaceSize })}
          className={SEGMENTED}
        >
          <SegmentedControlIndicator className={INDICATOR} />
          {INTERFACE_SIZES.map((s) => (
            <SegmentedControlItem key={s.value} value={s.value} className={SEGMENT}>
              {s.label}
            </SegmentedControlItem>
          ))}
        </SegmentedControl>
      </Row>

      <Row label="Fonte do terminal">
        <div role="radiogroup" aria-label="Fonte do terminal" className="flex flex-col gap-0.5">
          {fonts.map((name) => {
            const checked = name === current
            return (
              // biome-ignore lint/a11y/useSemanticElements: linha inteira clicável com prévia da fonte; um <input type=radio> não desenha isso.
              <button
                key={name}
                type="button"
                role="radio"
                aria-checked={checked}
                className="flex h-8 items-center gap-2.5 rounded-[7px] px-2.5 text-left text-[13px] [transition:background-color_140ms_ease-out,scale_300ms_var(--spring)] hover:bg-surface-hover focus-visible:outline-2 focus-visible:outline-accent active:scale-[0.98] aria-checked:bg-surface-hover motion-reduce:active:scale-100"
                onClick={() => !checked && onChange({ fontFamily: fontStack(name) })}
              >
                {/* Cada nome desenhado na própria fonte: a escolha é visual. */}
                <span className="min-w-0 flex-1 truncate" style={{ fontFamily: `'${name}', monospace` }}>
                  {name}
                </span>
                <span className="text-[11px] text-muted" style={{ fontFamily: `'${name}', monospace` }} aria-hidden>
                  {'0O il -> =='}
                </span>
                <Check size={14} className={`flex-none text-accent ${checked ? '' : 'invisible'}`} aria-hidden />
              </button>
            )
          })}
        </div>
      </Row>

      <Row label="Tamanho do terminal">
        <div className="flex items-center gap-2">
          <SegmentedControl
            aria-label="Tamanhos prontos"
            value={preset}
            onValueChange={(v) => v && commit(Number(v))}
            className={`${SEGMENTED} flex-1`}
          >
            <SegmentedControlIndicator className={`${INDICATOR} ${preset ? '' : 'opacity-0'}`} />
            {FONT_SIZE_PRESETS.map((n) => (
              <SegmentedControlItem key={n} value={String(n)} className={SEGMENT}>
                {n}
              </SegmentedControlItem>
            ))}
          </SegmentedControl>
          <NumberInput
            aria-label="Tamanho exato"
            value={size}
            min={FONT_MIN}
            max={FONT_MAX}
            step={1}
            onValueChange={setSize}
            onValueCommit={commit}
          >
            <NumberInputGroup>
              <NumberInputControl className={`${inputClass} w-14 text-center tabular-nums`} />
            </NumberInputGroup>
          </NumberInput>
        </div>
      </Row>
    </section>
  )
}

export { INDICATOR as segmentIndicator, SEGMENT as segmentItem, SEGMENTED as segmented }
