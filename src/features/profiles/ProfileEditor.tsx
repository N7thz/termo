import { Button } from '@ui-sdk/react/button'
import { Popover, PopoverContent, PopoverTitle, PopoverTrigger } from '@ui-sdk/react/popover'
import { Check, ChevronDown, Trash2 } from 'lucide-react'
import { useEffect, useState } from 'react'
import type { Profile } from '../../shared/types'
import { PROFILE_COLORS, profileColorCss, TONE_LABELS } from './profiles'

const PANEL =
  'm-0 flex w-72 origin-(--transform-origin) flex-col gap-3 rounded-[14px] border border-hairline bg-material-thick p-3.5 text-text shadow-panel backdrop-blur-[28px] backdrop-saturate-180 [transition:scale_350ms_var(--spring),opacity_140ms_ease-out] data-ending-style:scale-[0.94] data-ending-style:opacity-0 data-starting-style:scale-[0.94] data-starting-style:opacity-0 reduced-transparency:bg-surface reduced-transparency:backdrop-blur-none motion-reduce:scale-100'

const INPUT =
  'h-7.5 w-full rounded-[7px] border border-border bg-field px-2 text-[12.5px] text-text outline-none placeholder:text-muted focus-visible:border-accent'

const LABEL = 'flex flex-col gap-1 text-[11.5px] text-muted'

interface Props {
  profile: Profile
  /** Dá para excluir (sobra pelo menos um perfil). */
  canDelete: boolean
  onChange: (patch: Partial<Profile>) => void
  onDelete: () => void
}

/** Nome do perfil no topo da lateral; o clique abre a edição (nome, cor, pasta inicial, excluir). */
export function ProfileEditor({ profile, canDelete, onChange, onDelete }: Props) {
  const [open, setOpen] = useState(false)
  const [name, setName] = useState(profile.name)
  const [cwd, setCwd] = useState(profile.cwd)

  useEffect(() => {
    setName(profile.name)
    setCwd(profile.cwd)
  }, [profile.name, profile.cwd])

  // O Rust descarta perfil sem nome; vazio volta ao nome anterior.
  const commitName = () => {
    const v = name.trim().slice(0, 30)
    if (v && v !== profile.name) onChange({ name: v })
    else setName(profile.name)
  }
  const commitCwd = () => cwd.trim() !== profile.cwd && onChange({ cwd: cwd.trim() })

  return (
    <Popover open={open} onOpenChange={setOpen} modal={false}>
      <PopoverTrigger
        className="flex h-7 min-w-0 items-center gap-1.5 rounded-[7px] px-1.5 text-[12.5px] font-[600] tracking-[0.01em] text-text outline-none hover:bg-surface-hover focus-visible:outline-2 focus-visible:outline-accent data-open:bg-surface-hover"
        aria-label={`Perfil ${profile.name}: editar`}
      >
        <span className="size-2 flex-none rounded-full" style={{ background: profileColorCss(profile.color) }} />
        <span className="truncate">{profile.name}</span>
        <ChevronDown aria-hidden size={12} className="flex-none text-muted" />
      </PopoverTrigger>
      {/* role=dialog explícito: o painel do navegador (webview nativo, por cima do HTML) se esconde ao ver um. */}
      <PopoverContent role="dialog" className={PANEL} side="bottom" align="start" sideOffset={6} collisionPadding={8}>
        <PopoverTitle className="m-0 text-[13px] font-semibold">Perfil</PopoverTitle>
        <label className={LABEL}>
          Nome
          <input
            className={INPUT}
            value={name}
            maxLength={30}
            onChange={(e) => setName(e.target.value)}
            onBlur={commitName}
            onKeyDown={(e) => e.key === 'Enter' && commitName()}
          />
        </label>
        <fieldset className="m-0 flex flex-col gap-1.5 border-0 p-0">
          <legend className="mb-1.5 p-0 text-[11.5px] text-muted">Cor do perfil (tons do tema)</legend>
          <div className="flex flex-wrap gap-1.5">
            {PROFILE_COLORS.map((color) => (
              <button
                key={color}
                type="button"
                className="grid size-6 place-items-center rounded-full text-on-accent outline-none [transition:scale_250ms_var(--spring)] hover:scale-110 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
                style={{ background: profileColorCss(color) }}
                aria-label={TONE_LABELS[color]}
                title={TONE_LABELS[color]}
                aria-pressed={profile.color === color}
                onClick={() => onChange({ color })}
              >
                {profile.color === color && <Check aria-hidden size={13} strokeWidth={3} />}
              </button>
            ))}
          </div>
        </fieldset>
        <label className={LABEL}>
          Pasta inicial das abas novas
          <input
            className={INPUT}
            value={cwd}
            placeholder="A pasta inicial geral"
            spellCheck={false}
            onChange={(e) => setCwd(e.target.value)}
            onBlur={commitCwd}
            onKeyDown={(e) => e.key === 'Enter' && commitCwd()}
          />
        </label>
        {canDelete && (
          <Button
            className="flex h-7 items-center justify-center gap-1.5 rounded-[7px] text-[12px] text-claude hover:bg-surface-hover focus-visible:outline-2 focus-visible:outline-accent"
            onClick={() => {
              setOpen(false)
              onDelete()
            }}
          >
            <Trash2 aria-hidden size={13} /> Excluir perfil (as abas vão para outro)
          </Button>
        )}
      </PopoverContent>
    </Popover>
  )
}
