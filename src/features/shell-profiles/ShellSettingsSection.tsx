import { Field, FieldDescription, FieldLabel } from '@ui-sdk/react/field'
import { useEffect, useState } from 'react'
import { ipc } from '../../lib/ipc'
import type { Settings, ShellInfo } from '../../shared/types'

interface Props {
  settings: Settings
  onChange: (patch: Partial<Settings>) => void
  inputClass: string
}

/** Shell das abas novas: `Automático` (PowerShell 7, senão o Windows PowerShell) ou um dos shells detectados. */
export function ShellSettingsSection({ settings, onChange, inputClass }: Props) {
  const [shells, setShells] = useState<ShellInfo[]>([])
  useEffect(() => {
    ipc
      .shellList()
      .then(setShells)
      .catch(() => setShells([]))
  }, [])
  // O valor salvo pode ser de um shell que sumiu (distro removida): continua na lista para não parecer outro.
  const known = settings.defaultShell === 'auto' || shells.some((s) => s.id === settings.defaultShell)
  return (
    <Field className="flex flex-col gap-1.5 text-[13px] tracking-[0.005em]">
      <FieldLabel>Shell das abas novas</FieldLabel>
      <select
        className={inputClass}
        value={settings.defaultShell}
        onChange={(e) => onChange({ defaultShell: e.target.value })}
      >
        <option value="auto">Automático (PowerShell 7 ou Windows PowerShell)</option>
        {shells.map((s) => (
          <option key={s.id} value={s.id}>
            {s.label}
          </option>
        ))}
        {!known && <option value={settings.defaultShell}>{settings.defaultShell} (não encontrado)</option>}
      </select>
      <FieldDescription className="m-0 text-[11px] text-muted">
        No cmd não há blocos por comando e a pasta não troca pelo seletor. No WSL os blocos funcionam, mas a linha de
        contexto mostra só a pasta. A aba do Claude Code sempre usa o PowerShell.
      </FieldDescription>
    </Field>
  )
}
