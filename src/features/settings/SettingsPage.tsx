import { Button } from '@ui-sdk/react/button'
import { Field, FieldDescription, FieldLabel } from '@ui-sdk/react/field'
import { Input } from '@ui-sdk/react/input'
import { Switch, SwitchThumb } from '@ui-sdk/react/switch'
import { Tooltip, TooltipContent, TooltipTrigger } from '@ui-sdk/react/tooltip'
import { ArrowLeft, Check, ChevronRight, Settings2 } from 'lucide-react'
import { type ReactNode, useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { actionButton, tooltip } from '../../lib/ui'
import type { Settings } from '../../shared/types'
import { BackgroundSettingsSection } from '../background/BackgroundSettingsSection'
import { HighlightSettingsSection } from '../highlights/HighlightSettingsSection'
import { ShellSettingsSection } from '../shell-profiles/ShellSettingsSection'
import { findTheme } from '../theme/themes'
import { FontSettingsSection } from './FontSettingsSection'
import { SystemSettingsSection } from './SystemSettingsSection'
import { normalize, type SettingsGroupId } from './search'

const INPUT =
  'rounded-[7px] border border-border bg-field px-[9px] py-[5px] text-text [transition:border-color_140ms_ease-out,box-shadow_200ms_ease-out] focus-visible:border-accent focus-visible:shadow-[0_0_0_3px_color-mix(in_srgb,var(--accent)_25%,transparent)] focus-visible:outline-none'

const SWITCH =
  'relative h-5 w-8.5 flex-none rounded-full border border-border bg-field [transition:background-color_160ms_ease-out,border-color_160ms_ease-out] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent data-checked:border-accent data-checked:bg-accent'

const THUMB =
  'absolute top-0.5 left-0.5 size-3.5 rounded-full bg-text [transition:translate_300ms_var(--spring)] data-checked:translate-x-3.5 data-checked:bg-on-accent motion-reduce:transition-none'

const ROW = 'flex items-center justify-between gap-4 text-[13px] tracking-[0.005em]'
const COLUMN = 'flex flex-col gap-1.5 text-[13px] tracking-[0.005em]'
const DESCRIPTION = 'm-0 text-[11.5px]/normal text-muted'
const HEADING = 'm-0 text-[12px] font-semibold tracking-[0.01em] text-muted uppercase'

// Cartão de cada grupo. As seções que já têm título próprio (Fonte, Fundo...) trazem uma borda de
// cima e um respiro feitos para o popover antigo: aqui o cartão separa, então eles saem.
const CARD =
  'flex scroll-mt-4 flex-col rounded-xl border border-hairline bg-surface p-4 [&>section]:border-t-0 [&>section]:pt-0 [&_[data-filtered-out]]:hidden data-filtered-out:hidden'

const GROUPS: { id: SettingsGroupId; label: string }[] = [
  { id: 'general', label: 'Geral' },
  { id: 'terminal', label: 'Terminal' },
  { id: 'font', label: 'Fonte' },
  { id: 'background', label: 'Imagem de fundo' },
  { id: 'highlights', label: 'Destaques' },
  { id: 'system', label: 'Avisos e sistema' },
]

type SaveStatus = { kind: 'idle' } | { kind: 'saved' } | { kind: 'error'; patch: Partial<Settings> }

interface Props {
  settings: Settings
  /** Grava na hora (não há botão Salvar); a promessa falha se o disco recusar. */
  onChange: (patch: Partial<Settings>) => Promise<unknown>
  onClose: () => void
  onOpenThemes: () => void
  onOpenShortcuts: () => void
  onOpenWorkflows: () => void
}

/** Botão da barra de título que abre e fecha a tela de configurações. */
export function SettingsButton({ open, onToggle }: { open: boolean; onToggle: () => void }) {
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <Button
            className={actionButton}
            aria-label="Configurações"
            aria-pressed={open}
            data-open={open ? '' : undefined}
            onClick={onToggle}
          />
        }
      >
        <Settings2 size={15} />
      </TooltipTrigger>
      <TooltipContent className={tooltip} sideOffset={6}>
        Configurações
      </TooltipContent>
    </Tooltip>
  )
}

/**
 * Configurações em tela própria, sobre o terminal (como Temas e Sessões): seções na lateral,
 * conteúdo em cartões, busca que filtra os controles pelo texto. Cada mudança é gravada na hora.
 */
export function SettingsPage({ settings, onChange, onClose, onOpenThemes, onOpenShortcuts, onOpenWorkflows }: Props) {
  const [query, setQuery] = useState('')
  const [current, setCurrent] = useState<SettingsGroupId>('general')
  const [visible, setVisible] = useState<ReadonlySet<SettingsGroupId>>(new Set(GROUPS.map((g) => g.id)))
  const [status, setStatus] = useState<SaveStatus>({ kind: 'idle' })
  const scrollRef = useRef<HTMLDivElement>(null)
  const searchRef = useRef<HTMLInputElement>(null)
  const savedTimer = useRef<ReturnType<typeof setTimeout>>(undefined)

  const save = useCallback(
    (patch: Partial<Settings>) => {
      clearTimeout(savedTimer.current)
      onChange(patch).then(
        () => {
          setStatus({ kind: 'saved' })
          savedTimer.current = setTimeout(() => setStatus({ kind: 'idle' }), 1800)
        },
        () => setStatus({ kind: 'error', patch }),
      )
    },
    [onChange],
  )
  useEffect(() => () => clearTimeout(savedTimer.current), [])

  // Busca: esconde os controles cujo texto (rótulo, descrição, opções) não tem o termo. Um grupo cujo
  // título bate fica inteiro. Feito no DOM para valer também dentro das seções de outras features.
  // biome-ignore lint/correctness/useExhaustiveDependencies: refaz a cada mudança, que pode trocar o texto dos controles
  useLayoutEffect(() => {
    const root = scrollRef.current
    if (!root) return
    const q = normalize(query)
    const shown = new Set<SettingsGroupId>()
    for (const card of root.querySelectorAll<HTMLElement>('[data-settings-group]')) {
      const id = card.dataset.settingsGroup as SettingsGroupId
      const section = card.querySelector<HTMLElement>(':scope > section')
      const items = section ? Array.from(section.children).slice(1) : []
      const whole =
        !q ||
        normalize(card.dataset.title ?? '').includes(q) ||
        normalize(section?.firstElementChild?.textContent ?? '').includes(q)
      let any = whole
      for (const item of items) {
        const hit = whole || normalize(`${item.textContent ?? ''} ${labelsOf(item)}`).includes(q)
        item.toggleAttribute('data-filtered-out', !hit)
        any ||= hit
      }
      card.toggleAttribute('data-filtered-out', !any)
      if (any) shown.add(id)
    }
    setVisible((prev) => (sameSet(prev, shown) ? prev : shown))
  }, [query, settings])

  // Seção atual na lateral: a última cujo topo já passou do topo da área de rolagem.
  const onScroll = useCallback(() => {
    const root = scrollRef.current
    if (!root) return
    let at: SettingsGroupId = 'general'
    const top = root.getBoundingClientRect().top + 24
    for (const card of root.querySelectorAll<HTMLElement>('[data-settings-group]:not([data-filtered-out])')) {
      if (card.getBoundingClientRect().top <= top) at = card.dataset.settingsGroup as SettingsGroupId
    }
    // No fim da rolagem, a última seção visível conta mesmo que o topo dela não tenha chegado lá.
    if (root.scrollTop + root.clientHeight >= root.scrollHeight - 2) {
      const last = root.querySelectorAll<HTMLElement>('[data-settings-group]:not([data-filtered-out])')
      const el = last[last.length - 1]
      if (el) at = el.dataset.settingsGroup as SettingsGroupId
    }
    setCurrent(at)
  }, [])
  // biome-ignore lint/correctness/useExhaustiveDependencies: a busca muda o que está visível
  useEffect(() => onScroll(), [visible, onScroll])

  const goTo = (id: SettingsGroupId) => {
    const el = scrollRef.current?.querySelector<HTMLElement>(`[data-settings-group="${id}"]`)
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    el?.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'start' })
    setCurrent(id)
  }

  const noResults = query.trim() !== '' && visible.size === 0

  return (
    <section
      aria-labelledby="settings-title"
      className="absolute inset-0 z-10 flex animate-pop-in flex-col bg-bg text-text motion-reduce:animate-none"
      onKeyDown={(e) => {
        if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'f') {
          e.preventDefault()
          searchRef.current?.focus()
          searchRef.current?.select()
          return
        }
        if (e.key !== 'Escape' || e.defaultPrevented) return
        e.preventDefault()
        if (query) setQuery('')
        else onClose()
      }}
    >
      <header className="flex flex-wrap items-center gap-3 border-b border-hairline px-5 py-3">
        <Button className={actionButton} aria-label="Voltar ao terminal" onClick={onClose}>
          <ArrowLeft size={15} />
        </Button>
        <h1 id="settings-title" className="text-[15px] font-semibold tracking-[0.01em]">
          Configurações
        </h1>
        <SaveIndicator status={status} onRetry={(patch) => save(patch)} />
        <div className="flex-1" />
        <Input
          ref={searchRef}
          type="search"
          aria-label="Buscar nas configurações"
          placeholder="Buscar (Ctrl+F)…"
          autoFocus
          value={query}
          onChange={(e) => setQuery(e.currentTarget.value)}
          className={`w-64 text-[13px] placeholder:text-muted ${INPUT}`}
        />
      </header>

      <div className="flex min-h-0 flex-1">
        <nav
          aria-label="Seções"
          className="flex w-48 flex-none max-md:hidden flex-col gap-0.5 border-r border-hairline p-3"
        >
          {GROUPS.map((g) => {
            const hidden = !visible.has(g.id)
            return (
              <button
                key={g.id}
                type="button"
                disabled={hidden}
                aria-current={current === g.id && !hidden ? 'true' : undefined}
                onClick={() => goTo(g.id)}
                className="flex h-8 items-center rounded-lg px-2.5 text-left text-[13px] text-muted [transition:background-color_140ms_ease-out,color_140ms_ease-out] hover:bg-surface-hover hover:text-text focus-visible:outline-2 focus-visible:outline-accent disabled:opacity-35 disabled:hover:bg-transparent aria-[current]:bg-surface-hover aria-[current]:font-[560] aria-[current]:text-text"
              >
                <span className="truncate">{g.label}</span>
              </button>
            )
          })}
          <div className="flex-1" />
          <button
            type="button"
            onClick={onOpenShortcuts}
            className="flex h-8 items-center justify-between rounded-lg px-2.5 text-[12px] text-muted hover:bg-surface-hover hover:text-text focus-visible:outline-2 focus-visible:outline-accent"
          >
            Atalhos de teclado <kbd className="font-mono text-[11px]">F1</kbd>
          </button>
        </nav>

        <div ref={scrollRef} onScroll={onScroll} className="min-w-0 flex-1 overflow-y-auto px-6 py-5">
          <div className="mx-auto flex max-w-170 flex-col gap-4 pb-8">
            {noResults && (
              <div className="flex flex-col items-center gap-3 py-16 text-center text-[13px] text-muted" role="status">
                <span>
                  Nada encontrado para “<span className="text-text">{query.trim()}</span>”.
                </span>
                <Button
                  className="rounded-md px-2 py-1 text-[12.5px] text-accent hover:bg-surface-hover focus-visible:outline-2 focus-visible:outline-accent"
                  onClick={() => setQuery('')}
                >
                  Limpar busca
                </Button>
              </div>
            )}

            <Group id="general" title="Geral">
              <Field className={ROW}>
                <FieldLabel>Tema</FieldLabel>
                <Button className={`${actionButton} max-w-56 truncate text-[12.5px] text-text`} onClick={onOpenThemes}>
                  <span className="truncate">{findTheme(settings.theme)?.name ?? 'Sistema'}</span>
                  <ChevronRight size={13} className="flex-none" />
                </Button>
              </Field>
              <Toggle
                label="Abrir o terminal já no Claude Code"
                checked={settings.startWithClaude}
                onChange={(startWithClaude) => save({ startWithClaude })}
              />
              <Toggle
                label="Reabrir as abas, grupos e divisões ao abrir"
                checked={settings.restoreSession}
                onChange={(restoreSession) => save({ restoreSession })}
              />
              <Toggle
                label="…com o texto que estava em cada aba"
                checked={settings.restoreOutput}
                disabled={!settings.restoreSession}
                onChange={(restoreOutput) => save({ restoreOutput })}
              />
              <Field className={COLUMN}>
                <FieldLabel>Pasta inicial</FieldLabel>
                <Input
                  // Muda por fora (outra janela): a chave refaz o campo com o valor novo.
                  key={settings.defaultCwd}
                  className={`${INPUT} min-w-0`}
                  placeholder="D:\estudos"
                  defaultValue={settings.defaultCwd}
                  onBlur={(e) => {
                    const cwd = e.currentTarget.value.trim()
                    if (cwd !== settings.defaultCwd) save({ defaultCwd: cwd })
                  }}
                  onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
                />
                <FieldDescription className={DESCRIPTION}>Vazio usa a pasta do usuário.</FieldDescription>
              </Field>
              <Field className={ROW}>
                <FieldLabel>Workflows (comandos com parâmetros)</FieldLabel>
                <Button className={`${actionButton} text-[12.5px] text-text`} onClick={onOpenWorkflows}>
                  {settings.workflows.length > 0 ? `${settings.workflows.length} · Gerenciar` : 'Criar'}
                  <ChevronRight size={13} className="flex-none" />
                </Button>
              </Field>
            </Group>

            <Group id="terminal" title="Terminal">
              <ShellSettingsSection settings={settings} onChange={save} inputClass={INPUT} />
              <Toggle
                label="Sugestões do histórico ao digitar (abas novas)"
                checked={settings.shellPredictions}
                onChange={(shellPredictions) => save({ shellPredictions })}
              />
              <Toggle
                label="Editor de entrada (estilo Warp)"
                description="Caixa de comando com cores por token, histórico e Tab para caminhos (abas de PowerShell)."
                checked={settings.inputEditor}
                onChange={(inputEditor) => save({ inputEditor })}
              />
              <Toggle
                label="Ctrl+R busca no histórico do Termo"
                description="Lista com busca aproximada sobre os comandos da aba e o histórico do PowerShell. Desligado, o Ctrl+R vai para o shell (a busca reversa do PSReadLine)."
                checked={settings.historySearch}
                onChange={(historySearch) => save({ historySearch })}
              />
              <Toggle
                label="Abrir links num painel ao lado"
                description="Ctrl+clique faz o contrário: abre no navegador padrão (ou no painel, se desligado)."
                checked={settings.linkTarget === 'panel'}
                onChange={(on) => save({ linkTarget: on ? 'panel' : 'browser' })}
              />
            </Group>

            <Group id="font">
              <FontSettingsSection settings={settings} onChange={save} inputClass={INPUT} />
            </Group>
            <Group id="background">
              <BackgroundSettingsSection settings={settings} onChange={save} switchClass={SWITCH} thumbClass={THUMB} />
            </Group>
            <Group id="highlights">
              <HighlightSettingsSection
                value={settings.highlights}
                onChange={(highlights) => save({ highlights })}
                switchClass={SWITCH}
                thumbClass={THUMB}
                inputClass={INPUT}
              />
            </Group>
            <Group id="system">
              <SystemSettingsSection
                settings={settings}
                onChange={save}
                switchClass={SWITCH}
                thumbClass={THUMB}
                inputClass={INPUT}
              />
            </Group>
          </div>
        </div>
      </div>
    </section>
  )
}

/** "Salvo" por um instante depois de cada mudança; se o disco recusar, o erro fica até tentar de novo. */
function SaveIndicator({ status, onRetry }: { status: SaveStatus; onRetry: (patch: Partial<Settings>) => void }) {
  return (
    <span className="flex min-h-7 items-center gap-1.5 text-[12px]" role="status" aria-live="polite">
      {status.kind === 'saved' && (
        <span className="flex animate-pop-in items-center gap-1 text-muted motion-reduce:animate-none">
          <Check size={13} aria-hidden className="text-(--tone-green,var(--accent))" /> Salvo
        </span>
      )}
      {status.kind === 'error' && (
        <>
          <span className="text-(--tone-red,var(--claude))">Não deu para salvar a mudança.</span>
          <button
            type="button"
            className="rounded-md px-1.5 py-0.5 text-accent hover:bg-surface-hover focus-visible:outline-2 focus-visible:outline-accent"
            onClick={() => onRetry(status.patch)}
          >
            Tentar de novo
          </button>
        </>
      )}
    </span>
  )
}

/** Cartão de um grupo. Sem `title`, o filho já é uma `<section>` com o título dela. */
function Group({ id, title, children }: { id: SettingsGroupId; title?: string; children: ReactNode }) {
  const label = GROUPS.find((g) => g.id === id)?.label ?? ''
  return (
    <div data-settings-group={id} data-title={label} className={CARD}>
      {title ? (
        <section className="flex flex-col gap-3" aria-labelledby={`settings-${id}`}>
          <h2 id={`settings-${id}`} className={HEADING}>
            {title}
          </h2>
          {children}
        </section>
      ) : (
        children
      )}
    </div>
  )
}

function Toggle({
  label,
  description,
  checked,
  disabled,
  onChange,
}: {
  label: string
  description?: string
  checked: boolean
  disabled?: boolean
  onChange: (checked: boolean) => void
}) {
  const row = (
    <>
      <FieldLabel className={disabled ? 'opacity-50' : undefined}>{label}</FieldLabel>
      <Switch className={SWITCH} checked={checked} disabled={disabled} onCheckedChange={onChange}>
        <SwitchThumb className={THUMB} />
      </Switch>
    </>
  )
  if (!description) return <Field className={ROW}>{row}</Field>
  return (
    <Field className={COLUMN}>
      <span className={ROW}>{row}</span>
      <FieldDescription className={DESCRIPTION}>{description}</FieldDescription>
    </Field>
  )
}

/** `aria-label` e `placeholder` dos controles também contam na busca (ex.: o interruptor do fundo). */
function labelsOf(el: Element): string {
  return Array.from(el.querySelectorAll('[aria-label],[placeholder]'))
    .map((c) => `${c.getAttribute('aria-label') ?? ''} ${c.getAttribute('placeholder') ?? ''}`)
    .join(' ')
}

function sameSet<T>(a: ReadonlySet<T>, b: ReadonlySet<T>) {
  return a.size === b.size && [...a].every((x) => b.has(x))
}
