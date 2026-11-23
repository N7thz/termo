import { Button } from '@ui-sdk/react/button'
import { Field, FieldDescription, FieldLabel } from '@ui-sdk/react/field'
import { Switch, SwitchThumb } from '@ui-sdk/react/switch'
import { X } from 'lucide-react'
import { useState } from 'react'
import { ipc } from '../../lib/ipc'
import type { NotificationSettings, Settings, TraySettings } from '../../shared/types'
import { announceUpdate } from '../updater/UpdateButton'
import { comboFromEvent, formatCombo } from './hotkey'

interface Props {
  settings: Settings
  onChange: (patch: Partial<Settings>) => void
  switchClass: string
  thumbClass: string
  inputClass: string
}

const ROW = 'flex items-center justify-between gap-2.5 text-[13px] tracking-[0.005em]'
const SMALL_BUTTON = 'rounded-md px-2 py-0.5 text-[12px] text-accent hover:bg-surface-hover disabled:opacity-40'

/** Seção "Sistema": avisos do Windows, atalho global e atualização automática. */
export function SystemSettingsSection({ settings, onChange, switchClass, thumbClass, inputClass }: Props) {
  const n = settings.notifications
  const setN = (patch: Partial<NotificationSettings>) => onChange({ notifications: { ...n, ...patch } })

  const toggle = (label: string, checked: boolean, set: (v: boolean) => void, disabled = false) => (
    <Field className={ROW}>
      <FieldLabel className={disabled ? 'opacity-50' : undefined}>{label}</FieldLabel>
      <Switch className={switchClass} checked={checked} disabled={disabled} onCheckedChange={set}>
        <SwitchThumb className={thumbClass} />
      </Switch>
    </Field>
  )

  return (
    <section className="flex flex-col gap-2.5 border-t border-hairline pt-3" aria-labelledby="system-title">
      <h3 id="system-title" className="m-0 text-[12px] font-semibold tracking-[0.01em] text-muted uppercase">
        Avisos e sistema
      </h3>
      {toggle('Avisos do Windows', n.enabled, (enabled) => setN({ enabled }))}
      {toggle('Claude terminou ou pede permissão', n.claude, (claude) => setN({ claude }), !n.enabled)}
      <Field className="flex flex-col gap-1.5 text-[13px] tracking-[0.005em]">
        <span className={ROW}>
          <FieldLabel className={n.enabled ? undefined : 'opacity-50'}>Comando longo terminou</FieldLabel>
          <Switch
            className={switchClass}
            checked={n.commands}
            disabled={!n.enabled}
            onCheckedChange={(commands) => setN({ commands })}
          >
            <SwitchThumb className={thumbClass} />
          </Switch>
        </span>
        <span className="flex items-center gap-1.5 text-[12px] text-muted">
          a partir de
          <input
            type="number"
            min={5}
            max={3600}
            defaultValue={n.commandSecs}
            disabled={!n.enabled || !n.commands}
            aria-label="Segundos para avisar um comando longo"
            className={`${inputClass} w-18 text-[12px]`}
            onBlur={(e) => {
              const v = Math.round(Number(e.currentTarget.value))
              if (Number.isFinite(v) && v !== n.commandSecs) setN({ commandSecs: Math.min(3600, Math.max(5, v)) })
            }}
            onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
          />
          segundos
        </span>
        <FieldDescription className="m-0 text-[11px] text-muted">
          Só com a janela do Termo sem foco; o ícone na barra de tarefas também pisca.
        </FieldDescription>
      </Field>

      <HotkeyField settings={settings} onChange={onChange} inputClass={inputClass} />

      <TrayFields settings={settings} onChange={onChange} switchClass={switchClass} thumbClass={thumbClass} />

      {toggle('Procurar atualização ao abrir', settings.autoUpdate, (autoUpdate) => onChange({ autoUpdate }))}
      <UpdateCheck />
    </section>
  )
}

function HotkeyField({ settings, onChange, inputClass }: Pick<Props, 'settings' | 'onChange' | 'inputClass'>) {
  const [recording, setRecording] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const save = (globalHotkey: string) => {
    setError(null)
    // Direto pelo ipc para mostrar o erro aqui (atalho já usado por outro programa); depois sincroniza o App.
    ipc
      .setSettings({ globalHotkey })
      .then((s) => onChange({ globalHotkey: s.globalHotkey }))
      .catch((err) => setError(String(err)))
  }

  return (
    <Field className="flex flex-col gap-1.5 text-[13px] tracking-[0.005em]">
      <FieldLabel>Atalho global para mostrar o Termo</FieldLabel>
      <span className="flex items-center gap-1.5">
        <button
          type="button"
          className={`${inputClass} min-w-0 flex-1 cursor-pointer text-left font-mono text-[12px] ${
            recording ? 'border-accent' : ''
          }`}
          aria-label="Gravar o atalho global"
          onClick={() => setRecording(true)}
          onBlur={() => setRecording(false)}
          onKeyDown={(e) => {
            if (!recording) return
            if (e.key === 'Escape') {
              setRecording(false)
              return
            }
            e.preventDefault()
            e.stopPropagation()
            const combo = comboFromEvent(e)
            if (!combo) return
            setRecording(false)
            save(combo)
          }}
        >
          {recording
            ? 'Pressione a combinação…'
            : settings.globalHotkey
              ? formatCombo(settings.globalHotkey)
              : 'Desligado (clique para gravar)'}
        </button>
        {settings.globalHotkey && (
          <Button
            className="grid size-6 flex-none place-items-center rounded-md text-muted hover:bg-surface-hover hover:text-text"
            aria-label="Desligar o atalho global"
            onClick={() => save('')}
          >
            <X size={13} />
          </Button>
        )}
      </span>
      <FieldDescription className="m-0 text-[11px] text-muted" role={error ? 'alert' : undefined}>
        {error ?? 'De qualquer programa: traz o Termo para a frente; com ele na frente, minimiza. Ex.: Alt+F12.'}
      </FieldDescription>
    </Field>
  )
}

function UpdateCheck() {
  const [state, setState] = useState<{ busy: boolean; message: string | null }>({ busy: false, message: null })
  const check = () => {
    setState({ busy: true, message: null })
    ipc
      .updateCheck()
      .then((info) => {
        if (info) announceUpdate(info)
        setState({
          busy: false,
          message: info
            ? `Versão ${info.version} disponível: use o botão na barra de título.`
            : 'Você já tem a versão mais recente.',
        })
      })
      .catch((err) => setState({ busy: false, message: `Não deu para verificar: ${String(err)}` }))
  }
  return (
    <div className="flex flex-col gap-1">
      <div className={ROW}>
        <span className="text-muted text-[12px]">Releases do GitHub</span>
        <Button className={SMALL_BUTTON} disabled={state.busy} onClick={check}>
          {state.busy ? 'Verificando…' : 'Procurar agora'}
        </Button>
      </div>
      {state.message && (
        <p className="m-0 text-[11px] text-muted" role="status">
          {state.message}
        </p>
      )}
    </div>
  )
}

function TrayFields({ settings, onChange, switchClass, thumbClass }: Omit<Props, 'inputClass'>) {
  const t = settings.tray
  const [error, setError] = useState<string | null>(null)
  // Direto pelo ipc: ligar o início com o Windows pode falhar (registro), e o erro aparece aqui.
  const set = (patch: Partial<TraySettings>) => {
    setError(null)
    ipc
      .setSettings({ tray: { ...t, ...patch } })
      .then((s) => onChange({ tray: s.tray }))
      .catch((err) => setError(String(err)))
  }
  const row = (label: string, checked: boolean, key: keyof TraySettings, disabled = false, hint?: string) => (
    <Field className="flex flex-col gap-1 text-[13px] tracking-[0.005em]">
      <span className={ROW}>
        <FieldLabel className={disabled ? 'opacity-50' : undefined}>{label}</FieldLabel>
        <Switch
          className={switchClass}
          checked={checked}
          disabled={disabled}
          onCheckedChange={(v) => set({ [key]: v })}
        >
          <SwitchThumb className={thumbClass} />
        </Switch>
      </span>
      {hint && <FieldDescription className="m-0 text-[11px] text-muted">{hint}</FieldDescription>}
    </Field>
  )
  return (
    <div className="flex flex-col gap-2.5">
      {row(
        'Ícone na bandeja do Windows',
        t.enabled,
        'enabled',
        false,
        'Clique mostra ou esconde o Termo; o botão direito tem nova aba, Claude Code, nova janela e sair.',
      )}
      {row(
        'Fechar manda para a bandeja',
        t.closeToTray,
        'closeToTray',
        !t.enabled,
        'A janela principal some, mas as abas continuam rodando. Para fechar de vez: Sair, no menu da bandeja.',
      )}
      {row('Minimizar manda para a bandeja', t.minimizeToTray, 'minimizeToTray', !t.enabled)}
      {row('Iniciar com o Windows', t.launchAtLogin, 'launchAtLogin')}
      {row('…só na bandeja, sem abrir a janela', t.startHidden, 'startHidden', !t.enabled || !t.launchAtLogin)}
      {error && (
        <p className="m-0 text-[11px] text-claude" role="alert">
          {error}
        </p>
      )}
    </div>
  )
}
