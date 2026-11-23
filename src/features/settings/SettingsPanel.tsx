import { Button } from '@ui-sdk/react/button'
import { Field, FieldDescription, FieldLabel } from '@ui-sdk/react/field'
import { Input } from '@ui-sdk/react/input'
import { Popover, PopoverContent, PopoverDescription, PopoverTitle, PopoverTrigger } from '@ui-sdk/react/popover'
import { Switch, SwitchThumb } from '@ui-sdk/react/switch'
import { Tooltip, TooltipContent, TooltipTrigger } from '@ui-sdk/react/tooltip'
import { ChevronRight, Settings2 } from 'lucide-react'
import { actionButton, tooltip } from '../../lib/ui'
import type { Settings } from '../../shared/types'
import { BackgroundSettingsSection } from '../background/BackgroundSettingsSection'
import { HighlightSettingsSection } from '../highlights/HighlightSettingsSection'
import { ShellSettingsSection } from '../shell-profiles/ShellSettingsSection'
import { findTheme } from '../theme/themes'
import { FontSettingsSection } from './FontSettingsSection'
import { useInterfaceZoom } from './interfaceSize'
import { SystemSettingsSection } from './SystemSettingsSection'

// Popover na top layer: o UI SDK posiciona; aqui só aparência e entrada/saída.
const PANEL =
  'm-0 flex max-h-[calc(100vh-64px)] w-80 origin-(--transform-origin) flex-col gap-3 overflow-y-auto rounded-[14px] border border-hairline bg-material-thick p-4 text-text shadow-panel backdrop-blur-[28px] backdrop-saturate-180 [transition:scale_450ms_var(--spring),translate_450ms_var(--spring),opacity_160ms_ease-out,filter_220ms_ease-out] data-ending-style:-translate-y-1.5 data-ending-style:scale-[0.92] data-ending-style:opacity-0 data-ending-style:blur-[6px] data-starting-style:-translate-y-1.5 data-starting-style:scale-[0.92] data-starting-style:opacity-0 data-starting-style:blur-[6px] contrast-more:border-muted reduced-transparency:bg-surface reduced-transparency:backdrop-blur-none motion-reduce:translate-none motion-reduce:scale-100 motion-reduce:blur-none motion-reduce:[transition:opacity_150ms_ease]'

const INPUT =
  'rounded-[7px] border border-border bg-field px-[9px] py-[5px] text-text [transition:border-color_140ms_ease-out,box-shadow_200ms_ease-out] focus-visible:border-accent focus-visible:shadow-[0_0_0_3px_color-mix(in_srgb,var(--accent)_25%,transparent)] focus-visible:outline-none'

const SWITCH =
  'relative h-5 w-8.5 flex-none rounded-full border border-border bg-field [transition:background-color_160ms_ease-out,border-color_160ms_ease-out] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent data-checked:border-accent data-checked:bg-accent'

const THUMB =
  'absolute top-0.5 left-0.5 size-3.5 rounded-full bg-text [transition:translate_300ms_var(--spring)] data-checked:translate-x-3.5 data-checked:bg-on-accent motion-reduce:transition-none'

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  settings: Settings
  onChange: (patch: Partial<Settings>) => void
  /** Abre a página de temas. */
  onOpenThemes: () => void
  /** Abre a folha de atalhos. */
  onOpenShortcuts: () => void
  /** Abre a tela dos workflows (criar, editar, apagar, reordenar). */
  onOpenWorkflows: () => void
}

export function SettingsPanel({
  open,
  onOpenChange,
  settings,
  onChange,
  onOpenThemes,
  onOpenShortcuts,
  onOpenWorkflows,
}: Props) {
  // O painel está sempre montado (o botão fica na barra), então é ele quem aplica o zoom da interface.
  useInterfaceZoom(settings.interfaceSize)
  return (
    <Popover open={open} onOpenChange={onOpenChange} modal={false}>
      <Tooltip>
        <TooltipTrigger render={<PopoverTrigger className={actionButton} aria-label="Configurações" />}>
          <Settings2 size={15} />
        </TooltipTrigger>
        <TooltipContent className={tooltip} sideOffset={6}>
          Configurações
        </TooltipContent>
      </Tooltip>
      <PopoverContent className={PANEL} side="bottom" align="end" sideOffset={6} collisionPadding={8}>
        <PopoverTitle className="m-0 text-[13px] font-semibold tracking-[0.01em]">Configurações</PopoverTitle>
        <SettingsFields
          settings={settings}
          onChange={onChange}
          onOpenThemes={onOpenThemes}
          onOpenWorkflows={onOpenWorkflows}
        />
        <PopoverDescription className="m-0 border-t border-hairline pt-2.5 text-[11px]/normal tracking-[0.01em] text-muted">
          Ctrl+Shift+T nova aba · Ctrl+Shift+K Claude · Ctrl+Shift+, temas ·{' '}
          <button
            type="button"
            className="cursor-pointer text-accent underline-offset-2 hover:underline"
            onClick={onOpenShortcuts}
          >
            todos os atalhos (F1)
          </button>
        </PopoverDescription>
      </PopoverContent>
    </Popover>
  )
}

// Monta a cada abertura, então os rascunhos partem sempre do que está salvo.
function SettingsFields({
  settings,
  onChange,
  onOpenThemes,
  onOpenWorkflows,
}: Omit<Props, 'open' | 'onOpenChange' | 'onOpenShortcuts'>) {
  return (
    <>
      <Field className="flex items-center justify-between gap-2.5 text-[13px] tracking-[0.005em]">
        <FieldLabel>Tema</FieldLabel>
        <Button className={`${actionButton} max-w-44 truncate text-[12.5px] text-text`} onClick={onOpenThemes}>
          <span className="truncate">{findTheme(settings.theme)?.name ?? 'Sistema'}</span>
          <ChevronRight size={13} className="flex-none" />
        </Button>
      </Field>
      <Field className="flex items-center justify-between gap-2.5 text-[13px] tracking-[0.005em]">
        <FieldLabel>Abrir o terminal já no Claude Code</FieldLabel>
        <Switch
          className={SWITCH}
          checked={settings.startWithClaude}
          onCheckedChange={(checked) => onChange({ startWithClaude: checked })}
        >
          <SwitchThumb className={THUMB} />
        </Switch>
      </Field>
      <Field className="flex items-center justify-between gap-2.5 text-[13px] tracking-[0.005em]">
        <FieldLabel>Reabrir as abas, grupos e divisões ao abrir</FieldLabel>
        <Switch
          className={SWITCH}
          checked={settings.restoreSession}
          onCheckedChange={(checked) => onChange({ restoreSession: checked })}
        >
          <SwitchThumb className={THUMB} />
        </Switch>
      </Field>
      <Field className="flex items-center justify-between gap-2.5 text-[13px] tracking-[0.005em]">
        <FieldLabel className={settings.restoreSession ? undefined : 'opacity-50'}>
          …com o texto que estava em cada aba
        </FieldLabel>
        <Switch
          className={SWITCH}
          checked={settings.restoreOutput}
          disabled={!settings.restoreSession}
          onCheckedChange={(checked) => onChange({ restoreOutput: checked })}
        >
          <SwitchThumb className={THUMB} />
        </Switch>
      </Field>
      <Field className="flex items-center justify-between gap-2.5 text-[13px] tracking-[0.005em]">
        <FieldLabel>Sugestões do histórico ao digitar (abas novas)</FieldLabel>
        <Switch
          className={SWITCH}
          checked={settings.shellPredictions}
          onCheckedChange={(checked) => onChange({ shellPredictions: checked })}
        >
          <SwitchThumb className={THUMB} />
        </Switch>
      </Field>
      <Field className="flex flex-col gap-1.5 text-[13px] tracking-[0.005em]">
        <span className="flex items-center justify-between gap-2.5">
          <FieldLabel>Editor de entrada (estilo Warp)</FieldLabel>
          <Switch
            className={SWITCH}
            checked={settings.inputEditor}
            onCheckedChange={(checked) => onChange({ inputEditor: checked })}
          >
            <SwitchThumb className={THUMB} />
          </Switch>
        </span>
        <FieldDescription className="m-0 text-[11px] text-muted">
          Caixa de comando com cores por token, histórico e Tab para caminhos (abas de PowerShell).
        </FieldDescription>
      </Field>
      <Field className="flex flex-col gap-1.5 text-[13px] tracking-[0.005em]">
        <span className="flex items-center justify-between gap-2.5">
          <FieldLabel>Ctrl+R busca no histórico do Termo</FieldLabel>
          <Switch
            className={SWITCH}
            checked={settings.historySearch}
            onCheckedChange={(checked) => onChange({ historySearch: checked })}
          >
            <SwitchThumb className={THUMB} />
          </Switch>
        </span>
        <FieldDescription className="m-0 text-[11px] text-muted">
          Lista com busca aproximada sobre os comandos da aba e o histórico do PowerShell. Desligado, o Ctrl+R vai para
          o shell (a busca reversa do PSReadLine).
        </FieldDescription>
      </Field>
      <Field className="flex items-center justify-between gap-2.5 text-[13px] tracking-[0.005em]">
        <FieldLabel>Workflows (comandos com parâmetros)</FieldLabel>
        <Button className={`${actionButton} text-[12.5px] text-text`} onClick={onOpenWorkflows}>
          {settings.workflows.length > 0 ? `${settings.workflows.length} · Gerenciar` : 'Criar'}
          <ChevronRight size={13} className="flex-none" />
        </Button>
      </Field>
      <Field className="flex flex-col gap-1.5 text-[13px] tracking-[0.005em]">
        <span className="flex items-center justify-between gap-2.5">
          <FieldLabel>Abrir links num painel ao lado</FieldLabel>
          <Switch
            className={SWITCH}
            checked={settings.linkTarget === 'panel'}
            onCheckedChange={(checked) => onChange({ linkTarget: checked ? 'panel' : 'browser' })}
          >
            <SwitchThumb className={THUMB} />
          </Switch>
        </span>
        <FieldDescription className="m-0 text-[11px] text-muted">
          Ctrl+clique faz o contrário: abre no navegador padrão (ou no painel, se desligado).
        </FieldDescription>
      </Field>
      <Field className="flex flex-col gap-1.5 text-[13px] tracking-[0.005em]">
        <FieldLabel>Pasta inicial</FieldLabel>
        <Input
          className={INPUT}
          placeholder="D:\estudos"
          defaultValue={settings.defaultCwd}
          onBlur={(e) => {
            const cwd = e.currentTarget.value.trim()
            if (cwd !== settings.defaultCwd) onChange({ defaultCwd: cwd })
          }}
          onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
        />
        <FieldDescription className="m-0 text-[11px] text-muted">Vazio usa a pasta do usuário.</FieldDescription>
      </Field>
      <ShellSettingsSection settings={settings} onChange={onChange} inputClass={INPUT} />
      <FontSettingsSection settings={settings} onChange={onChange} inputClass={INPUT} />
      <BackgroundSettingsSection settings={settings} onChange={onChange} switchClass={SWITCH} thumbClass={THUMB} />
      <HighlightSettingsSection
        value={settings.highlights}
        onChange={(highlights) => onChange({ highlights })}
        switchClass={SWITCH}
        thumbClass={THUMB}
        inputClass={INPUT}
      />
      <SystemSettingsSection
        settings={settings}
        onChange={onChange}
        switchClass={SWITCH}
        thumbClass={THUMB}
        inputClass={INPUT}
      />
    </>
  )
}
