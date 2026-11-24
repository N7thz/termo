import { Button } from '@ui-sdk/react/button'
import { Tooltip, TooltipContent, TooltipShortcut, TooltipTrigger } from '@ui-sdk/react/tooltip'
import {
  ChevronDown,
  ChevronRight,
  Columns2,
  Folder,
  PanelLeftClose,
  PanelLeftOpen,
  Plus,
  Radio,
  X,
} from 'lucide-react'
import { type ReactNode, useRef, useState } from 'react'
import { tooltip, tooltipKbd } from '../../lib/ui'
import { MAX_PROFILES } from '../../shared/settings'
import type { Profile, SessionKind } from '../../shared/types'
import type { AgentState } from '../agent-status/agentState'
import { TabMenu } from '../context-menu/TabMenu'
import type { TabMenuAction } from '../context-menu/types'
import { ProfileEditor } from '../profiles/ProfileEditor'
import { isPinned, profileColorCss } from '../profiles/profiles'
import { NewShellMenu } from '../shell-profiles/NewShellMenu'
import { TabKindIcon } from '../tabs/TabKindIcon'
import { MAX_GROUP_NAME, type Tab, type TabGroup } from '../tabs/tabs'
import { folderName, shortPath } from './format'
import { type DiffColors, GitBranch, GitDiff } from './GitDiff'
import { type DropTarget, useFlip, useTabDrag } from './useTabDrag'
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
  /** Aba nova no perfil atual; com `cwd`, abre naquela pasta; com `shellId`, naquele shell. */
  onNew: (kind: SessionKind, cwd?: string, shellId?: string) => void
  /** `defaultShell` das configurações: ícone do botão Shell e item marcado no menu de modos. */
  defaultShell: string
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
  /** Grupos do perfil atual. */
  groups: readonly TabGroup[]
  onGroupToggle: (id: string) => void
  onGroupRename: (id: string, name: string) => void
  /** Desfaz o grupo (as abas ficam soltas). */
  onGroupDelete: (id: string) => void
  /** Aba → a outra metade da tela dividida, para o indicador e o menu. */
  partnerOf: (key: number) => number | undefined
  /** Estado do Claude Code de cada aba (avatar no lugar do ícone). */
  agents?: ReadonlyMap<number, AgentState>
  /** Arrastar: põe a aba antes de `before` (ou no fim do grupo `group`; `null` = soltas). */
  onReorder: (key: number, before: number | null, group: string | null) => void
  /** Abas que estão digitando junto (digitar em vários painéis): ganham um ícone de transmissão. */
  broadcasting?: ReadonlySet<number>
  /** Aba solta sobre o terminal: abre ao lado da aba ativa. */
  onSplitWith: (key: number) => void
  /** Lateral minimizada: faixa estreita só com os ícones. */
  collapsed: boolean
  onToggleCollapsed: () => void
}

/** Largura da lateral aberta e minimizada (o App usa a mesma para animar a coluna). */
// Aberta, ocupa o wrapper do App, que guarda a largura arrastada (padrão 224px).
export const SIDEBAR_WIDTH = { open: 'w-full', collapsed: 'w-14' } as const

/** Botão quadrado da faixa minimizada (favoritos, pastas fixadas, nova aba). */
const RAIL_BUTTON =
  'grid size-10 flex-none place-items-center rounded-[10px] text-muted outline-none [transition:background-color_140ms_ease-out,color_140ms_ease-out,scale_300ms_var(--spring)] hover:bg-surface-hover hover:text-text focus-visible:outline-2 focus-visible:outline-accent active:scale-[0.94] motion-reduce:active:scale-100'

/** Botão de minimizar/expandir a lateral, com o atalho no tooltip. */
function CollapseButton({ collapsed, onClick }: { collapsed: boolean; onClick: () => void }) {
  const label = collapsed ? 'Expandir a lateral' : 'Minimizar a lateral'
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <button
            type="button"
            className="grid size-7 flex-none place-items-center rounded-[7px] text-muted outline-none hover:bg-surface-hover hover:text-text focus-visible:outline-2 focus-visible:outline-accent"
            aria-label={label}
            aria-expanded={!collapsed}
            onClick={onClick}
          />
        }
      >
        {collapsed ? <PanelLeftOpen aria-hidden size={15} /> : <PanelLeftClose aria-hidden size={15} />}
      </TooltipTrigger>
      <TooltipContent className={tooltip} side="right" sideOffset={6}>
        {label}
      </TooltipContent>
    </Tooltip>
  )
}

/** Ícone com tooltip à direita, para a faixa minimizada. */
function RailButton({ label, onClick, children }: { label: string; onClick: () => void; children: ReactNode }) {
  return (
    <Tooltip>
      <TooltipTrigger render={<button type="button" className={RAIL_BUTTON} aria-label={label} onClick={onClick} />}>
        {children}
      </TooltipTrigger>
      <TooltipContent className={tooltip} side="right" sideOffset={6}>
        {label}
      </TooltipContent>
    </Tooltip>
  )
}

/** Cabeçalho do grupo: recolhe/abre no clique, renomeia no duplo clique, desfaz no X. */
function GroupHeader({
  group,
  count,
  onToggle,
  onRename,
  onDelete,
}: {
  group: TabGroup
  count: number
  onToggle: () => void
  onRename: (name: string) => void
  onDelete: () => void
}) {
  const [editing, setEditing] = useState(false)
  if (editing) {
    return (
      <input
        // biome-ignore lint/a11y/noAutofocus: o campo só aparece depois do duplo clique em "renomear".
        autoFocus
        aria-label="Nome do grupo"
        maxLength={MAX_GROUP_NAME}
        defaultValue={group.name}
        className="mx-0.5 h-8 rounded-[8px] border border-accent bg-field px-2 text-[12px] font-semibold text-text outline-none"
        onBlur={(e) => {
          onRename(e.currentTarget.value)
          setEditing(false)
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter') e.currentTarget.blur()
          if (e.key === 'Escape') setEditing(false)
        }}
      />
    )
  }
  return (
    <div className={`${ROW} h-8 gap-1.5 font-semibold`}>
      <button
        type="button"
        className="absolute inset-0 rounded-lg outline-none focus-visible:outline-2 focus-visible:outline-accent"
        aria-expanded={!group.collapsed}
        aria-label={`Grupo ${group.name}, ${count} aba(s)`}
        title="Clique para recolher · duplo clique para renomear"
        onClick={onToggle}
        onDoubleClick={() => setEditing(true)}
      />
      <ChevronRight
        aria-hidden
        size={13}
        className={`pointer-events-none flex-none [transition:rotate_260ms_var(--spring)] motion-reduce:transition-none ${group.collapsed ? '' : 'rotate-90'}`}
      />
      <span className="pointer-events-none min-w-0 flex-1 truncate text-[12px] tracking-[0.01em]">{group.name}</span>
      <span className="pointer-events-none pr-6 text-[11px] font-normal tabular-nums opacity-70">{count}</span>
      <Button className={ROW_CLOSE} tabIndex={-1} aria-label={`Desfazer o grupo ${group.name}`} onClick={onDelete}>
        <X size={12} />
      </Button>
    </div>
  )
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
            className="flex h-14 w-full flex-col items-center justify-center gap-1.5 rounded-[12px] bg-highlight text-[11.5px] leading-none tracking-[0.01em] text-muted shadow-[inset_0_0_0_1px_var(--hairline)] [transition:background-color_140ms_ease-out,color_140ms_ease-out,scale_300ms_var(--spring)] hover:bg-surface-hover hover:text-text focus-visible:outline-2 focus-visible:outline-accent active:scale-[0.96] motion-reduce:active:scale-100"
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
  // Ícone do botão Shell: o modo que o Ctrl+Shift+T abre (`auto` cai no PowerShell 7).
  const defaultFamily = props.defaultShell === 'auto' ? undefined : props.defaultShell
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

  // Ordem da tela (grupos e depois as soltas), para traduzir "embaixo de X" em "antes da próxima".
  const knownGroups = new Set(props.groups.map((g) => g.id))
  const groupOf = (t: Tab) => (t.group && knownGroups.has(t.group) ? t.group : null)
  const order = [
    ...props.groups.flatMap((g) => tabs.filter((t) => t.group === g.id)),
    ...tabs.filter((t) => !groupOf(t)),
  ]
  const { dragKey, handlers } = useTabDrag({ onMove: moveTo, onSplit: props.onSplitWith })
  const navRef = useRef<HTMLElement>(null)
  // Muda a ordem (ou o grupo de uma aba): as abas deslizam até o lugar novo.
  useFlip(navRef, order.map((t) => `${t.key}:${groupOf(t) ?? ''}`).join(','), dragKey)

  function moveTo(key: number, target: DropTarget) {
    if (target.kind === 'split') return
    if (target.kind === 'group') return props.onReorder(key, null, target.group)
    if (target.kind === 'loose') return props.onReorder(key, null, null)
    if (target.kind === 'before') return props.onReorder(key, target.key, null)
    // Embaixo de X: antes da aba seguinte do mesmo grupo de X (pulando a arrastada), ou no fim desse grupo.
    const ref = order.find((t) => t.key === target.key)
    if (!ref) return
    const group = groupOf(ref)
    const next = order.slice(order.indexOf(ref) + 1).find((t) => t.key !== key && groupOf(t) === group)
    props.onReorder(key, next?.key ?? null, group)
  }

  const renderTab = (tab: Tab) => {
    const index = tabs.indexOf(tab)
    const { cwd, git } = info(tab.key)
    const isActive = tab.key === active
    const partner = props.partnerOf(tab.key)
    return (
      <TabMenu
        key={tab.key}
        vertical
        first={index === 0}
        last={index === tabs.length - 1}
        alone={tabs.length === 1}
        canPin={!!cwd && !isPinned(profile, cwd)}
        groups={props.groups.filter((g) => g.id !== tab.group)}
        inGroup={!!tab.group}
        split={partner != null}
        canSplitWithActive={active != null && tab.key !== active && partner !== active}
        splitTargets={tabs
          .filter((t) => t.key !== tab.key && t.key !== partner)
          .map((t) => ({ key: t.key, title: t.title }))}
        onAction={(action) => onTabAction(tab, action)}
        trigger={
          <div
            className="group/row relative flex max-h-28 animate-row-in flex-col gap-1 overflow-hidden rounded-[10px] p-2.5 text-[12px] text-muted [transition:background-color_140ms_ease-out,color_140ms_ease-out,box-shadow_200ms_ease-out,scale_300ms_var(--spring)] hover:bg-surface-hover active:scale-[0.98] active:duration-60 data-active:bg-bg data-active:text-text data-active:shadow-tab data-closing:pointer-events-none data-closing:max-h-0 data-closing:py-0 data-closing:opacity-0 data-closing:[transition:max-height_180ms_var(--spring-soft),padding_180ms_var(--spring-soft),opacity_120ms_ease-out,translate_180ms_var(--spring-soft)] data-closing:-translate-x-2 motion-reduce:animate-none motion-reduce:active:scale-100 motion-reduce:data-closing:translate-x-0 data-dragging:pointer-events-none data-dragging:z-10 data-dragging:bg-bg data-dragging:text-text data-dragging:shadow-pop data-dragging:[transition:box-shadow_200ms_ease-out] data-dragging:animate-none"
            data-active={isActive || undefined}
            data-closing={closing.has(tab.key) || undefined}
            data-dragging={dragKey === tab.key || undefined}
            onAuxClick={(e) => e.button === 1 && onClose(tab.key)}
            {...handlers(tab.key)}
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
          <TabKindIcon kind={tab.kind} shell={tab.shell} size={16} agent={props.agents?.get(tab.key)} />
          <span className="min-w-0 flex-1 truncate text-[13px] font-medium">{tab.title}</span>
          {props.broadcasting?.has(tab.key) && (
            <Radio size={13} className="flex-none text-accent" aria-label="Recebendo o que é digitado" role="img" />
          )}
          {partner != null && (
            <Columns2 size={13} className="flex-none opacity-70" aria-label="Em tela dividida" role="img" />
          )}
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
          data-no-drag
          tabIndex={-1}
          aria-label={`Fechar ${tab.title}`}
          onClick={() => onClose(tab.key)}
        >
          <X size={12} />
        </Button>
      </TabMenu>
    )
  }

  const renderRailTab = (tab: Tab) => {
    const index = tabs.indexOf(tab)
    const { cwd } = info(tab.key)
    const isActive = tab.key === active
    const partner = props.partnerOf(tab.key)
    return (
      <TabMenu
        key={tab.key}
        vertical
        first={index === 0}
        last={index === tabs.length - 1}
        alone={tabs.length === 1}
        canPin={!!cwd && !isPinned(profile, cwd)}
        groups={props.groups.filter((g) => g.id !== tab.group)}
        inGroup={!!tab.group}
        split={partner != null}
        canSplitWithActive={active != null && tab.key !== active && partner !== active}
        splitTargets={tabs
          .filter((t) => t.key !== tab.key && t.key !== partner)
          .map((t) => ({ key: t.key, title: t.title }))}
        onAction={(action) => onTabAction(tab, action)}
        trigger={
          <div
            className="relative grid size-10 flex-none animate-row-in place-items-center rounded-[10px] text-muted [transition:background-color_140ms_ease-out,color_140ms_ease-out,box-shadow_200ms_ease-out,scale_300ms_var(--spring),opacity_120ms_ease-out] hover:bg-surface-hover hover:text-text active:scale-[0.94] active:duration-60 data-active:bg-bg data-active:text-text data-active:shadow-tab data-closing:pointer-events-none data-closing:scale-75 data-closing:opacity-0 motion-reduce:animate-none motion-reduce:active:scale-100 data-dragging:pointer-events-none data-dragging:z-10 data-dragging:bg-bg data-dragging:shadow-pop data-dragging:animate-none"
            data-active={isActive || undefined}
            data-closing={closing.has(tab.key) || undefined}
            data-dragging={dragKey === tab.key || undefined}
            onAuxClick={(e) => e.button === 1 && onClose(tab.key)}
            {...handlers(tab.key)}
          />
        }
      >
        <button
          type="button"
          className="absolute inset-0 rounded-[10px] outline-none focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent"
          aria-current={isActive ? 'page' : undefined}
          aria-label={`${tab.title}${cwd ? `, ${cwd}` : ''}`}
          title={`${tab.title}${cwd ? `\n${cwd}` : ''}${partner != null ? '\nEm tela dividida' : ''}`}
          onClick={() => onActivate(tab.key)}
        />
        <span className="pointer-events-none">
          <TabKindIcon kind={tab.kind} shell={tab.shell} size={18} agent={props.agents?.get(tab.key)} />
        </span>
        {partner != null && (
          <span
            aria-hidden
            className="pointer-events-none absolute right-1 bottom-1 size-1.5 rounded-full bg-accent"
            title="Em tela dividida"
          />
        )}
        {props.broadcasting?.has(tab.key) && (
          <Radio aria-hidden size={10} className="pointer-events-none absolute bottom-1 left-1 text-accent" />
        )}
        {renderAlert && (
          <span className="pointer-events-none absolute -top-1 -right-1 scale-90">{renderAlert(tab.key)}</span>
        )}
      </TabMenu>
    )
  }

  const profileDots = (vertical: boolean) => (
    <div
      className={`flex flex-none items-center justify-center gap-1 ${vertical ? 'flex-col py-2' : 'h-11'}`}
      role="toolbar"
      aria-label="Perfis"
      aria-orientation={vertical ? 'vertical' : 'horizontal'}
    >
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
                className={`block rounded-full [transition:width_350ms_var(--spring),height_350ms_var(--spring),opacity_150ms_ease-out] motion-reduce:transition-[opacity] ${
                  vertical
                    ? current
                      ? 'h-4 w-1.5'
                      : 'size-1.5 opacity-55'
                    : current
                      ? 'h-1.5 w-4'
                      : 'size-1.5 opacity-55'
                }`}
                style={{ background: profileColorCss(p.color) }}
              />
            </TooltipTrigger>
            <TooltipContent className={tooltip} side={vertical ? 'right' : 'top'} sideOffset={6}>
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
          <TooltipContent className={tooltip} side={vertical ? 'right' : 'top'} sideOffset={6}>
            Novo perfil
          </TooltipContent>
        </Tooltip>
      )}
    </div>
  )

  if (props.collapsed) {
    const loose = tabs.filter((t) => !t.group || !props.groups.some((g) => g.id === t.group))
    return (
      <aside
        className={`flex h-full ${SIDEBAR_WIDTH.collapsed} flex-none flex-col items-center px-2 select-none`}
        aria-label="Perfil e abas (minimizada)"
      >
        <div data-tauri-drag-region className="flex h-10 w-full flex-none items-center justify-center">
          <CollapseButton collapsed onClick={props.onToggleCollapsed} />
        </div>
        <div className="flex flex-none flex-col items-center gap-1.5">
          <RailButton label="Nova aba: Shell (Ctrl+Shift+T)" onClick={() => onNew('shell')}>
            <TabKindIcon kind="shell" shell={defaultFamily} size={17} />
          </RailButton>
          <RailButton label="Nova aba: Claude Code (Ctrl+Shift+K)" onClick={() => onNew('claude')}>
            <TabKindIcon kind="claude" size={17} />
          </RailButton>
        </div>
        <nav
          ref={navRef}
          className="flex min-h-0 w-full flex-1 flex-col items-center overflow-x-hidden overflow-y-auto pb-2 [scrollbar-width:none]"
          aria-label="Abas do perfil"
        >
          <div key={profile.id} className={`flex flex-col items-center gap-1.5 ${slide} motion-reduce:animate-none`}>
            {profile.pinned.map((dir) => (
              <RailButton key={dir} label={`Abrir aba em ${folderName(dir)}`} onClick={() => onNew('shell', dir)}>
                <Folder aria-hidden size={15} />
              </RailButton>
            ))}
            <hr className="my-1 h-px w-6 flex-none border-0 bg-hairline" />
            {props.groups.map((group) => {
              const inside = tabs.filter((t) => t.group === group.id)
              return (
                <section
                  key={group.id}
                  className="flex flex-col items-center gap-1.5"
                  aria-label={`Grupo ${group.name}`}
                >
                  <div data-drop-group={group.id}>
                    <button
                      type="button"
                      className="grid h-4 w-8 place-items-center rounded outline-none hover:bg-surface-hover focus-visible:outline-2 focus-visible:outline-accent"
                      title={`${group.name} (${inside.length}) · clique para ${group.collapsed ? 'abrir' : 'recolher'}`}
                      aria-label={`Grupo ${group.name}, ${inside.length} aba(s)`}
                      aria-expanded={!group.collapsed}
                      onClick={() => props.onGroupToggle(group.id)}
                    >
                      <span className={`block h-0.5 rounded-full bg-muted ${group.collapsed ? 'w-2' : 'w-6'}`} />
                    </button>
                  </div>
                  {!group.collapsed && inside.map((tab) => renderRailTab(tab))}
                </section>
              )
            })}
            {loose.map((tab) => renderRailTab(tab))}
            <div data-drop-loose className="flex flex-col items-center">
              <NewShellMenu
                defaultShell={props.defaultShell}
                onPick={(kind, shellId) => onNew(kind, undefined, shellId)}
                triggerClassName={RAIL_BUTTON}
                triggerLabel="Nova aba: escolher o modo"
              >
                <Plus aria-hidden size={15} />
              </NewShellMenu>
            </div>
          </div>
        </nav>
        {profileDots(true)}
      </aside>
    )
  }

  return (
    // Grade de 4px com margem de 6px: a borda esquerda do nome do perfil, dos blocos e das abas é a mesma,
    // e os blocos começam na mesma linha do topo do cartão do terminal.
    <aside
      className={`flex h-full ${SIDEBAR_WIDTH.open} flex-none flex-col px-2.5 select-none`}
      aria-label="Perfil e abas"
    >
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
        <CollapseButton collapsed={false} onClick={props.onToggleCollapsed} />
      </div>

      <div className="grid flex-none grid-cols-2 gap-2">
        <div className="relative">
          <Favorite
            label="Shell"
            keys="mod+shift+t"
            icon={<TabKindIcon kind="shell" shell={defaultFamily} size={16} />}
            onClick={() => onNew('shell')}
          />
          {/* Canto do botão: os outros modos (cmd, WSL, Windows PowerShell). */}
          <NewShellMenu
            defaultShell={props.defaultShell}
            onPick={(kind, shellId) => onNew(kind, undefined, shellId)}
            triggerClassName="absolute top-1 right-1 grid size-5 place-items-center rounded-md text-muted outline-none hover:bg-surface-hover hover:text-text focus-visible:outline-2 focus-visible:outline-accent data-open:bg-surface-hover data-open:text-text"
            triggerLabel="Nova aba em outro modo"
          >
            <ChevronDown aria-hidden size={12} />
          </NewShellMenu>
        </div>
        <Favorite
          label="Claude Code"
          keys="mod+shift+k"
          icon={<TabKindIcon kind="claude" size={16} />}
          onClick={() => onNew('claude')}
        />
      </div>

      <nav
        ref={navRef}
        className="flex min-h-0 flex-1 flex-col overflow-x-hidden overflow-y-auto pb-2"
        aria-label="Abas do perfil"
      >
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
            {props.groups.map((group) => {
              const inside = tabs.filter((t) => t.group === group.id)
              return (
                <section key={group.id} className="flex flex-col gap-1.5" aria-label={`Grupo ${group.name}`}>
                  <div data-drop-group={group.id}>
                    <GroupHeader
                      group={group}
                      count={inside.length}
                      onToggle={() => props.onGroupToggle(group.id)}
                      onRename={(name) => props.onGroupRename(group.id, name)}
                      onDelete={() => props.onGroupDelete(group.id)}
                    />
                  </div>
                  {/* Abas do grupo recuadas, com um fio à esquerda ligando ao cabeçalho. */}
                  {!group.collapsed && inside.length > 0 && (
                    <div className="ml-3 flex flex-col gap-1.5 border-l border-hairline pl-1.5">
                      {inside.map((tab) => renderTab(tab))}
                    </div>
                  )}
                </section>
              )
            })}
            {tabs.filter((t) => !t.group || !props.groups.some((g) => g.id === t.group)).map((tab) => renderTab(tab))}
            {/* Soltar aqui (ou no vão até ele) leva a aba para o fim das soltas, fora de qualquer grupo. */}
            <div data-drop-loose className="flex flex-col">
              <span className="flex items-center">
                <Button
                  className={`${ROW} min-w-0 flex-1 focus-visible:outline-2 focus-visible:outline-accent`}
                  onClick={() => onNew('shell')}
                >
                  <Plus aria-hidden size={14} /> Nova aba
                </Button>
                <NewShellMenu
                  defaultShell={props.defaultShell}
                  onPick={(kind, shellId) => onNew(kind, undefined, shellId)}
                  triggerClassName="grid size-7 flex-none place-items-center rounded-md text-muted outline-none hover:bg-surface-hover hover:text-text focus-visible:outline-2 focus-visible:outline-accent data-open:bg-surface-hover data-open:text-text"
                  triggerLabel="Nova aba em outro modo"
                >
                  <ChevronDown aria-hidden size={13} />
                </NewShellMenu>
              </span>
            </div>
          </div>
        </div>
      </nav>

      {/* Os pontos do rodapé trocam de perfil, como no Dia. */}
      {profileDots(false)}
    </aside>
  )
}
