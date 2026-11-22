import { Button } from '@ui-sdk/react/button'
import { Tooltip, TooltipContent, TooltipShortcut, TooltipTrigger } from '@ui-sdk/react/tooltip'
import { Folder, Plus, X } from 'lucide-react'
import { type ReactNode, useRef } from 'react'
import { tooltip, tooltipKbd } from '../../lib/ui'
import { MAX_PROFILES } from '../../shared/settings'
import type { Profile, SessionKind } from '../../shared/types'
import { TabMenu } from '../context-menu/TabMenu'
import type { TabMenuAction } from '../context-menu/types'
import { ProfileEditor } from '../profiles/ProfileEditor'
import { isPinned, profileColorCss } from '../profiles/profiles'
import { TabKindIcon } from '../tabs/TabKindIcon'
import type { Tab } from '../tabs/tabs'
import { folderName, shortPath } from './format'
import { type DiffColors, GitBranch, GitDiff } from './GitDiff'
import type { TabInfo } from './useWorkspace'

interface Props {
  profiles: readonly Profile[]
  profile: Profile
  /** Abas do perfil atual. */
  tabs: readonly Tab[]
  active: number | null
  info: (key: number) => TabInfo
  colors: DiffColors
  onActivate: (key: number) => void
  onClose: (key: number) => void
  /** Aba nova no perfil atual; com `cwd`, abre naquela pasta. */
  onNew: (kind: SessionKind, cwd?: string) => void
  onTabAction: (tab: Tab, action: TabMenuAction) => void
  onSwitchProfile: (id: string) => void
  onAddProfile: () => void
  onEditProfile: (patch: Partial<Profile>) => void
  onDeleteProfile: () => void
  onUnpin: (dir: string) => void
  /** Abas fechando: encolhem antes de sair (a mesma saída da barra de abas). */
  closing: ReadonlySet<number>
  /** Alertas de erro/aviso por aba (o mesmo contador da barra de abas). */
  renderAlert?: (key: number) => ReactNode
}

const ROW =
  'group/row relative flex h-9 items-center gap-2.5 rounded-lg px-2.5 text-[12.5px] text-muted [transition:background-color_140ms_ease-out,color_140ms_ease-out,scale_300ms_var(--spring)] hover:bg-surface-hover hover:text-text active:scale-[0.98] active:duration-60 motion-reduce:active:scale-100'

const CLOSE =
  'absolute grid size-6 place-items-center rounded-md opacity-0 group-hover/row:opacity-70 group-data-active/row:opacity-70 hover:bg-border hover:opacity-100'

/** Fechar das linhas de uma linha só (pastas fixadas): centrado na altura. */
const ROW_CLOSE = `${CLOSE} top-1/2 right-2 -translate-y-1/2`

/** Fechar dos cartões de aba: alinhado com a linha do título. */
const CARD_CLOSE = `${CLOSE} top-2 right-2`

const SECTION = 'px-2 pt-3 pb-1 text-[10.5px] font-semibold tracking-[0.06em] text-muted uppercase'

/** Bloco grande da grade de favoritos (como os sites fixados no topo da lateral do Dia). */
function Favorite({
  label,
  keys,
  icon,
  onClick,
}: {
  label: string
  keys: string
  icon: ReactNode
  onClick: () => void
}) {
  return (
    <Tooltip shortcut={keys}>
      <TooltipTrigger
        render={
          <Button
            className="flex h-14 flex-col items-center justify-center gap-1.5 rounded-[12px] bg-highlight text-[11.5px] leading-none tracking-[0.01em] text-muted shadow-[inset_0_0_0_1px_var(--hairline)] [transition:background-color_140ms_ease-out,color_140ms_ease-out,scale_300ms_var(--spring)] hover:bg-surface-hover hover:text-text focus-visible:outline-2 focus-visible:outline-accent active:scale-[0.96] motion-reduce:active:scale-100"
            onClick={onClick}
          />
        }
      >
        {icon}
        {label}
      </TooltipTrigger>
      <TooltipContent className={tooltip} sideOffset={6}>
        Nova aba: {label} <TooltipShortcut className={tooltipKbd} />
      </TooltipContent>
    </Tooltip>
  )
}

/**
 * Lateral no estilo do Dia: perfil no topo, favoritos em blocos, pastas fixadas, as abas do perfil,
 * "Nova aba" e, embaixo, os pontos para trocar de perfil.
 */
export function TabSidebar(props: Props) {
  const { profiles, profile, tabs, active, info, colors, onActivate, onClose, onNew, onTabAction, renderAlert } = props
  const { closing } = props

  // Sentido da troca de perfil: o conteúdo entra pela direita indo para um ponto à direita, e vice-versa,
  // como o carrossel de perfis do Dia (sai e volta pelo mesmo caminho).
  const index = profiles.findIndex((p) => p.id === profile.id)
  const last = useRef({ id: profile.id, index, slide: '' })
  if (last.current.id !== profile.id) {
    const next = index >= last.current.index ? 'animate-slide-next' : 'animate-slide-prev'
    last.current = { id: profile.id, index, slide: next }
  }
  const slide = last.current.slide

  return (
    // Grade de 4px com margem de 6px: a borda esquerda do nome do perfil, dos blocos e das abas é a mesma,
    // e os blocos começam na mesma linha do topo do cartão do terminal.
    <aside className="flex h-full w-56 flex-none flex-col px-2.5 select-none" aria-label="Perfil e abas">
      {/* Fica na altura da barra de título: o vazio arrasta a janela. */}
      <div data-tauri-drag-region className="flex h-10 flex-none items-center gap-1">
        <span key={profile.id} className="flex min-w-0 animate-fade-in motion-reduce:animate-none">
          <ProfileEditor
            profile={profile}
            canDelete={profiles.length > 1}
            onChange={props.onEditProfile}
            onDelete={props.onDeleteProfile}
          />
        </span>
        <span data-tauri-drag-region className="flex-1 self-stretch" />
      </div>

      <div className="grid flex-none grid-cols-2 gap-2">
        <Favorite
          label="Shell"
          keys="mod+shift+t"
          icon={<TabKindIcon kind="shell" size={16} />}
          onClick={() => onNew('shell')}
        />
        <Favorite
          label="Claude Code"
          keys="mod+shift+k"
          icon={<TabKindIcon kind="claude" size={16} />}
          onClick={() => onNew('claude')}
        />
      </div>

      <nav className="flex min-h-0 flex-1 flex-col overflow-x-hidden overflow-y-auto pb-2" aria-label="Abas do perfil">
        {/* key no perfil: a troca remonta o conteúdo, que entra deslizando no sentido da troca. */}
        <div key={profile.id} className={`flex flex-col ${slide} motion-reduce:animate-none`}>
          {profile.pinned.length > 0 && (
            <>
              <p className={SECTION}>Fixadas</p>
              {profile.pinned.map((dir) => (
                <div key={dir} className={`${ROW} animate-row-in motion-reduce:animate-none`}>
                  <button
                    type="button"
                    className="absolute inset-0 rounded-lg outline-none focus-visible:outline-2 focus-visible:outline-accent"
                    title={`${dir}\nClique para abrir uma aba nesta pasta`}
                    aria-label={`Abrir aba em ${dir}`}
                    onClick={() => onNew('shell', dir)}
                  />
                  <Folder aria-hidden size={14} className="pointer-events-none flex-none" />
                  <span className="pointer-events-none min-w-0 flex-1 truncate">{folderName(dir)}</span>
                  <Button
                    className={ROW_CLOSE}
                    tabIndex={-1}
                    aria-label={`Desafixar ${dir}`}
                    onClick={() => props.onUnpin(dir)}
                  >
                    <X size={12} />
                  </Button>
                </div>
              ))}
            </>
          )}

          {/* A linha que separa o que é fixo do que é aberto, como no Dia. */}
          <hr className="mx-1 my-2 h-px flex-none border-0 bg-hairline" />

          <div className="flex flex-col gap-1.5">
            {tabs.map((tab, index) => {
              const { cwd, git } = info(tab.key)
              const isActive = tab.key === active
              return (
                <TabMenu
                  key={tab.key}
                  vertical
                  first={index === 0}
                  last={index === tabs.length - 1}
                  alone={tabs.length === 1}
                  canPin={!!cwd && !isPinned(profile, cwd)}
                  onAction={(action) => onTabAction(tab, action)}
                  trigger={
                    <div
                      className="group/row relative flex max-h-28 animate-row-in flex-col gap-1 overflow-hidden rounded-[10px] p-2.5 text-[12px] text-muted [transition:background-color_140ms_ease-out,color_140ms_ease-out,box-shadow_200ms_ease-out,scale_300ms_var(--spring)] hover:bg-surface-hover active:scale-[0.98] active:duration-60 data-active:bg-bg data-active:text-text data-active:shadow-tab data-closing:pointer-events-none data-closing:max-h-0 data-closing:py-0 data-closing:opacity-0 data-closing:[transition:max-height_180ms_var(--spring-soft),padding_180ms_var(--spring-soft),opacity_120ms_ease-out,translate_180ms_var(--spring-soft)] data-closing:-translate-x-2 motion-reduce:animate-none motion-reduce:active:scale-100 motion-reduce:data-closing:translate-x-0"
                      data-active={isActive || undefined}
                      data-closing={closing.has(tab.key) || undefined}
                      onAuxClick={(e) => e.button === 1 && onClose(tab.key)}
                    />
                  }
                >
                  <button
                    type="button"
                    className="absolute inset-0 rounded-lg outline-none focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent"
                    aria-current={isActive ? 'page' : undefined}
                    aria-label={`${tab.title}${cwd ? `, ${cwd}` : ''}`}
                    onClick={() => onActivate(tab.key)}
                  />
                  {/* Cartão de três linhas, como no Warp: título, pasta e branch com o diff. */}
                  <span className="pointer-events-none flex items-center gap-2.5 pr-6">
                    <TabKindIcon kind={tab.kind} size={16} />
                    <span className="min-w-0 flex-1 truncate text-[13px] font-medium">{tab.title}</span>
                    {renderAlert?.(tab.key)}
                  </span>
                  {cwd && (
                    <span className="pointer-events-none truncate pl-6.5 text-[11.5px]" title={cwd}>
                      {shortPath(cwd, 2)}
                    </span>
                  )}
                  {git && (
                    <span className="pointer-events-none flex items-center gap-2 pl-6.5 text-[11.5px]">
                      <GitBranch git={git} className="min-w-0" />
                      <GitDiff git={git} colors={colors} className="ml-auto" />
                    </span>
                  )}
                  <Button
                    className={CARD_CLOSE}
                    tabIndex={-1}
                    aria-label={`Fechar ${tab.title}`}
                    onClick={() => onClose(tab.key)}
                  >
                    <X size={12} />
                  </Button>
                </TabMenu>
              )
            })}
            <Button
              className={`${ROW} focus-visible:outline-2 focus-visible:outline-accent`}
              onClick={() => onNew('shell')}
            >
              <Plus aria-hidden size={14} /> Nova aba
            </Button>
          </div>
        </div>
      </nav>

      {/* Os pontos do rodapé trocam de perfil, como no Dia. */}
      <div className="flex h-11 flex-none items-center justify-center gap-1" role="toolbar" aria-label="Perfis">
        {profiles.map((p) => {
          const current = p.id === profile.id
          return (
            <Tooltip key={p.id}>
              <TooltipTrigger
                render={
                  <button
                    type="button"
                    className="grid h-6 min-w-6 place-items-center rounded-full px-1 outline-none hover:bg-surface-hover focus-visible:outline-2 focus-visible:outline-accent"
                    aria-label={`Perfil ${p.name}`}
                    aria-pressed={current}
                    onClick={() => props.onSwitchProfile(p.id)}
                  />
                }
              >
                <span
                  className={`block h-1.5 rounded-full [transition:width_350ms_var(--spring),opacity_150ms_ease-out] motion-reduce:transition-[opacity] ${current ? 'w-4' : 'w-1.5 opacity-55'}`}
                  style={{ background: profileColorCss(p.color) }}
                />
              </TooltipTrigger>
              <TooltipContent className={tooltip} sideOffset={6}>
                {p.name}
              </TooltipContent>
            </Tooltip>
          )
        })}
        {profiles.length < MAX_PROFILES && (
          <Tooltip>
            <TooltipTrigger
              render={
                <button
                  type="button"
                  className="grid size-6 place-items-center rounded-full text-muted outline-none hover:bg-surface-hover hover:text-text focus-visible:outline-2 focus-visible:outline-accent"
                  aria-label="Novo perfil"
                  onClick={props.onAddProfile}
                />
              }
            >
              <Plus aria-hidden size={12} />
            </TooltipTrigger>
            <TooltipContent className={tooltip} sideOffset={6}>
              Novo perfil
            </TooltipContent>
          </Tooltip>
        )}
      </div>
    </aside>
  )
}
