import { Button } from '@ui-sdk/react/button'
import { Input } from '@ui-sdk/react/input'
import { Listbox, ListboxItem, ListboxItemIndicator } from '@ui-sdk/react/listbox'
import { SegmentedControl, SegmentedControlIndicator, SegmentedControlItem } from '@ui-sdk/react/segmented-control'
import type { ITheme } from '@xterm/xterm'
import { ArrowLeft } from 'lucide-react'
import { type KeyboardEvent, useEffect, useMemo, useState } from 'react'
import { ipc } from '../../lib/ipc'
import { Scroller } from '../../lib/Scroller'
import { actionButton } from '../../lib/ui'
import { filterGallery, rowStep, type SchemeFilter } from './gallery'
import { DEFAULT_DARK, DEFAULT_LIGHT, findTheme, THEME_OPTIONS, type ThemeOption } from './themes'

interface Props {
  value: string
  onChange: (id: string) => void
  /** Prévia ao vivo do tema em foco ou sob o ponteiro; `null` volta ao salvo. */
  onPreview: (id: string | null) => void
  onClose: () => void
}

const SCHEMES: { value: SchemeFilter; label: string }[] = [
  { value: 'all', label: 'Todos' },
  { value: 'dark', label: 'Escuros' },
  { value: 'light', label: 'Claros' },
]

export function ThemesPage({ value, onChange, onPreview, onClose }: Props) {
  const [query, setQuery] = useState('')
  const [scheme, setScheme] = useState<SchemeFilter>('all')
  const [focused, setFocused] = useState<string | null>(null)
  const groups = useMemo(() => filterGallery(query, scheme), [query, scheme])
  const shown = groups.reduce((n, g) => n + g.options.length, 0)
  const credit = findTheme(focused ?? value)?.credit

  // Ao sair da página, a interface volta ao tema salvo.
  useEffect(() => () => onPreview(null), [onPreview])

  const preview = (id: string | null) => {
    setFocused(id)
    onPreview(id)
  }

  return (
    <section
      aria-labelledby="themes-title"
      className="absolute inset-0 z-10 flex animate-pop-in flex-col bg-bg text-text motion-reduce:animate-none"
      onKeyDown={(e) => {
        if (e.key === 'Escape' && !e.defaultPrevented) {
          e.preventDefault()
          onClose()
        }
      }}
    >
      <header className="flex flex-wrap items-center gap-3 border-b border-hairline px-5 py-3">
        <Button className={actionButton} aria-label="Voltar ao terminal" onClick={onClose}>
          <ArrowLeft size={15} />
        </Button>
        <h1 id="themes-title" className="text-[15px] font-semibold tracking-[0.01em]">
          Temas
        </h1>
        <span className="text-[12px] text-muted" aria-live="polite">
          {shown === THEME_OPTIONS.length ? `${shown} temas` : `${shown} de ${THEME_OPTIONS.length}`}
        </span>
        <div className="flex-1" />
        <SegmentedControl
          aria-label="Claros ou escuros"
          value={scheme}
          onValueChange={(v) => v && setScheme(v)}
          className="relative flex rounded-lg border border-border bg-field p-0.5"
        >
          <SegmentedControlIndicator className="absolute top-(--segmented-control-indicator-top) left-(--segmented-control-indicator-left) h-(--segmented-control-indicator-height) w-(--segmented-control-indicator-width) rounded-md bg-surface-hover shadow-tab transition-[left,width] duration-200 ease-spring-soft motion-reduce:transition-none" />
          {SCHEMES.map((s) => (
            <SegmentedControlItem
              key={s.value}
              value={s.value}
              className="relative z-1 rounded-md px-3 py-1 text-[12px] text-muted transition-colors focus-visible:outline-2 focus-visible:outline-accent data-checked:text-text"
            >
              {s.label}
            </SegmentedControlItem>
          ))}
        </SegmentedControl>
        <Input
          type="search"
          aria-label="Buscar tema"
          placeholder="Buscar por nome ou autor…"
          autoFocus
          value={query}
          onValueChange={setQuery}
          className="w-64 rounded-[7px] border border-border bg-field px-[9px] py-[5px] text-[13px] text-text placeholder:text-muted focus-visible:border-accent focus-visible:shadow-[0_0_0_3px_color-mix(in_srgb,var(--accent)_25%,transparent)] focus-visible:outline-none"
        />
      </header>

      <Scroller className="min-h-0 flex-1">
        <div className="px-5 py-4" onPointerLeave={() => preview(null)}>
          {groups.length === 0 && <p className="py-16 text-center text-[13px] text-muted">Nenhum tema encontrado.</p>}
          {groups.map((group) => (
            <section key={group.label} aria-label={group.label} className="mb-6">
              <h2 className="mb-2.5 text-[11px] font-semibold tracking-[0.06em] text-muted uppercase">{group.label}</h2>
              <Listbox
                aria-label={group.label}
                orientation="horizontal"
                activation="manual"
                value={group.options.some((o) => o.id === value) ? value : null}
                onValueChange={(id) => {
                  if (typeof id === 'string' && id) onChange(id)
                }}
                onHighlight={(id) => preview(typeof id === 'string' ? id : null)}
                onKeyDown={moveByRow}
                className="grid grid-cols-[repeat(auto-fill,minmax(220px,1fr))] gap-3"
              >
                {group.options.map((option) => (
                  <ThemeCard key={option.id} option={option} onPointerEnter={() => preview(option.id)} />
                ))}
              </Listbox>
            </section>
          ))}
        </div>
      </Scroller>

      <footer className="flex items-center gap-3 border-t border-hairline px-5 py-2 text-[11px] text-muted">
        <span>Setas navegam · Enter aplica · digite para pular pelo nome · Esc volta</span>
        <div className="flex-1" />
        {credit && (
          <span>
            Tema de {credit.author || 'autor desconhecido'} via TerminalSplash ·{' '}
            <button
              type="button"
              className="cursor-pointer text-accent underline-offset-2 hover:underline"
              onClick={() => void ipc.openUrl(credit.source)}
            >
              fonte
            </button>
          </span>
        )}
      </footer>
    </section>
  )
}

// O Listbox anda só na horizontal; para cima e para baixo pulam uma linha da grade.
function moveByRow(e: KeyboardEvent<HTMLElement>) {
  if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return
  const list = e.currentTarget
  const items = [...list.querySelectorAll<HTMLElement>('[data-slot="listbox-item"]')]
  const index = items.indexOf(document.activeElement as HTMLElement)
  if (index < 0) return
  e.preventDefault()
  const cols = getComputedStyle(list).gridTemplateColumns.split(' ').length
  items[rowStep(index, items.length, cols, e.key === 'ArrowDown' ? 1 : -1)]?.focus()
}

function ThemeCard({ option, onPointerEnter }: { option: ThemeOption; onPointerEnter: () => void }) {
  const { theme } = option
  const detail = theme
    ? `${theme.credit ? theme.credit.author || 'TerminalSplash' : 'Termo'} · ${theme.scheme === 'dark' ? 'escuro' : 'claro'}`
    : 'Segue o claro/escuro do Windows'
  return (
    <ListboxItem
      value={option.id}
      label={option.name}
      onPointerEnter={onPointerEnter}
      className="flex cursor-pointer flex-col overflow-hidden rounded-xl border border-border bg-surface text-left outline-none transition-[border-color,box-shadow,translate] duration-150 hover:-translate-y-0.5 hover:border-muted data-highlighted:border-accent data-highlighted:shadow-[0_0_0_3px_color-mix(in_srgb,var(--accent)_30%,transparent)] data-selected:border-accent motion-reduce:hover:translate-y-0"
    >
      {theme ? (
        <TerminalSample colors={theme.terminal} />
      ) : (
        <div className="relative" aria-hidden>
          <TerminalSample colors={DEFAULT_DARK.terminal} />
          <div className="absolute inset-0 [clip-path:polygon(0_0,100%_0,0_100%)]">
            <TerminalSample colors={DEFAULT_LIGHT.terminal} />
          </div>
        </div>
      )}
      <div className="flex items-center gap-2 px-3 py-2">
        <div className="min-w-0 flex-1">
          <div className="truncate text-[13px] font-medium">{option.name}</div>
          <div className="truncate text-[11px] text-muted">{detail}</div>
        </div>
        <ListboxItemIndicator className="flex-none rounded-full bg-accent px-2 py-0.5 text-[10px] font-semibold text-on-accent">
          Em uso
        </ListboxItemIndicator>
      </div>
    </ListboxItem>
  )
}

/** Um prompt de mentira nas cores do tema, mais a paleta ANSI. */
function TerminalSample({ colors: c }: { colors: ITheme }) {
  const palette = [c.red, c.green, c.yellow, c.blue, c.magenta, c.cyan, c.brightBlack, c.white]
  return (
    <div
      className="flex h-28 flex-col gap-0.5 px-3 pt-2.5 pb-2 font-mono text-[11px]/[1.45]"
      style={{ background: c.background, color: c.foreground }}
      aria-hidden
    >
      <div className="truncate">
        <span style={{ color: c.green }}>➜</span> <span style={{ color: c.cyan }}>~/termo</span>{' '}
        <span style={{ color: c.blue }}>git:(</span>
        <span style={{ color: c.red }}>main</span>
        <span style={{ color: c.blue }}>)</span> <span style={{ color: c.yellow }}>✗</span>
      </div>
      <div className="truncate">$ ls</div>
      <div className="truncate">
        <span style={{ color: c.blue }}>src</span> <span style={{ color: c.magenta }}>assets</span>{' '}
        <span style={{ color: c.green }}>run.sh</span> README.md
      </div>
      <div className="truncate">
        $ <span className="inline-block h-3 w-1.5 align-middle" style={{ background: c.cursor }} />
      </div>
      <div className="mt-auto flex gap-1">
        {palette.map((color, i) => (
          // biome-ignore lint/suspicious/noArrayIndexKey: a paleta tem ordem fixa e pode repetir cores
          <span key={i} className="h-1.5 flex-1 rounded-full" style={{ background: color }} />
        ))}
      </div>
    </div>
  )
}
