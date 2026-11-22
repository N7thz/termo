import { Button } from '@ui-sdk/react/button'
import { Field, FieldDescription, FieldLabel } from '@ui-sdk/react/field'
import { Switch, SwitchThumb } from '@ui-sdk/react/switch'
import { X } from 'lucide-react'
import { useState } from 'react'
import { MAX_PATTERN, MAX_RULES } from '../../shared/settings'
import type { HighlightRule, HighlightSettings } from '../../shared/types'
import { isValidRulePattern } from './matchers'

interface Props {
  value: HighlightSettings
  onChange: (next: HighlightSettings) => void
  /** Classes das chaves e campos do painel (mesmo visual das outras configurações). */
  switchClass: string
  thumbClass: string
  inputClass: string
}

const TOGGLES: { key: keyof Omit<HighlightSettings, 'rules'>; label: string }[] = [
  { key: 'fileLinks', label: 'Caminhos arquivo:linha clicáveis (VS Code)' },
  { key: 'severity', label: 'Marcar erros e avisos' },
  { key: 'gitHashes', label: 'Hashes do git (clique copia)' },
  { key: 'network', label: 'localhost:porta e IPs' },
  { key: 'logLevels', label: 'Níveis de log (INFO, WARN, ERROR...)' },
  { key: 'diffs', label: 'Linhas de diff (+ verde, − vermelho)' },
  { key: 'timestamps', label: 'Datas e horas em tom discreto' },
  { key: 'uuids', label: 'UUIDs' },
]

const ROW = 'flex items-center justify-between gap-2.5 text-[13px] tracking-[0.005em]'

/** Seção "Destaques" do painel de configurações: chaves de cada tipo e regras próprias (regex + cor). */
export function HighlightSettingsSection({ value, onChange, switchClass, thumbClass, inputClass }: Props) {
  // Rascunho local: o padrão só é salvo ao sair do campo e se for uma regex válida.
  const [drafts, setDrafts] = useState<HighlightRule[]>(value.rules)

  const saveRules = (rules: HighlightRule[]) => {
    setDrafts(rules)
    onChange({ ...value, rules: rules.filter((r) => isValidRulePattern(r.pattern)) })
  }

  return (
    <section className="flex flex-col gap-2.5 border-t border-hairline pt-3" aria-labelledby="highlights-title">
      <h3 id="highlights-title" className="m-0 text-[12px] font-semibold tracking-[0.01em] text-muted uppercase">
        Destaques na saída
      </h3>
      {TOGGLES.map(({ key, label }) => (
        <Field key={key} className={ROW}>
          <FieldLabel>{label}</FieldLabel>
          <Switch
            className={switchClass}
            checked={value[key]}
            onCheckedChange={(checked) => onChange({ ...value, [key]: checked })}
          >
            <SwitchThumb className={thumbClass} />
          </Switch>
        </Field>
      ))}

      <div className="flex flex-col gap-1.5">
        <div className={ROW}>
          <span>Regras próprias</span>
          <Button
            className="rounded-md px-2 py-0.5 text-[12px] text-accent hover:bg-surface-hover disabled:opacity-40"
            disabled={drafts.length >= MAX_RULES}
            onClick={() => setDrafts((d) => [...d, { pattern: '', color: '#7aa2ff' }])}
          >
            + regra
          </Button>
        </div>
        {drafts.map((rule, i) => {
          const invalid = rule.pattern !== '' && !isValidRulePattern(rule.pattern)
          return (
            // biome-ignore lint/suspicious/noArrayIndexKey: regras não têm id; a posição é a identidade
            <div key={i} className="flex items-center gap-1.5">
              <input
                type="color"
                value={rule.color}
                aria-label={`Cor da regra ${i + 1}`}
                className="size-7 flex-none cursor-pointer rounded-md border border-border bg-field p-0.5"
                onChange={(e) => saveRules(drafts.map((r, j) => (j === i ? { ...r, color: e.target.value } : r)))}
              />
              <input
                value={rule.pattern}
                maxLength={MAX_PATTERN}
                placeholder="regex, ex.: \bTODO\b"
                aria-label={`Padrão da regra ${i + 1}`}
                aria-invalid={invalid}
                spellCheck={false}
                className={`${inputClass} min-w-0 flex-1 font-mono text-[12px] aria-invalid:border-[var(--claude)]`}
                style={{ color: rule.color }}
                onChange={(e) => setDrafts(drafts.map((r, j) => (j === i ? { ...r, pattern: e.target.value } : r)))}
                onBlur={() => saveRules(drafts)}
                onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
              />
              <Button
                className="grid size-6 flex-none place-items-center rounded-md text-muted hover:bg-surface-hover hover:text-text"
                aria-label={`Remover regra ${i + 1}`}
                onClick={() => saveRules(drafts.filter((_, j) => j !== i))}
              >
                <X size={13} />
              </Button>
            </div>
          )
        })}
        <FieldDescription className="m-0 text-[11px] text-muted">
          Valem para a saída nova. Ctrl+Shift+F busca no que já está na tela.
        </FieldDescription>
      </div>
    </section>
  )
}
