// Layouts salvos: conjunto de abas, grupos e divisões do perfil, guardado nas configurações.
import type { SavedLayout } from '../../shared/types'
import { type Tab, type TabsAction, type TabsState, visibleGroups, visibleTabs } from '../tabs/tabs'

/** Mesmos limites do Rust (MAX_LAYOUTS e companhia em src-tauri/src/settings.rs). */
export const MAX_LAYOUTS = 20
export const MAX_LAYOUT_TABS = 16
export const MAX_LAYOUT_NAME = 60
export const MAX_LAYOUT_COMMAND = 500

const sameName = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase()

/**
 * Foto do perfil atual como layout: as abas na ordem da tela (até 16), os grupos que elas usam e as telas
 * divididas entre elas. `cwdOf` dá a pasta atual da aba; `commandOf`, o comando inicial a guardar (ou vazio).
 */
export function captureLayout(
  state: TabsState,
  name: string,
  cwdOf: (tab: Tab) => string | undefined,
  commandOf: (tab: Tab) => string = () => '',
): SavedLayout {
  const tabs = visibleTabs(state).slice(0, MAX_LAYOUT_TABS)
  const keys = tabs.map((t) => t.key)
  const used = visibleGroups(state).filter((g) => tabs.some((t) => t.group === g.id))
  const groupIndex = new Map(used.map((g, i) => [g.id, i]))
  const splits = state.pairs.flatMap((p) => {
    const left = keys.indexOf(p.left)
    const right = keys.indexOf(p.right)
    return left < 0 || right < 0 ? [] : [{ left, right, ratio: p.ratio }]
  })
  return {
    name: name.trim(),
    groups: used.map((g) => g.name),
    splits,
    tabs: tabs.map((t) => ({
      kind: t.kind,
      title: t.title,
      shell: t.kind === 'shell' ? (t.shell ?? '') : '',
      cwd: cwdOf(t) ?? '',
      group: (t.group != null ? groupIndex.get(t.group) : undefined) ?? null,
      command: t.kind === 'shell' && !t.shell?.startsWith('ssh:') ? commandOf(t).trim() : '',
    })),
  }
}

/** A ação do reducer que abre o layout (as chaves das abas novas começam em `nextKey`). */
export function openLayoutAction(layout: SavedLayout): Extract<TabsAction, { type: 'open-layout' }> {
  return {
    type: 'open-layout',
    groups: layout.groups,
    splits: layout.splits,
    tabs: layout.tabs.map((t) => ({
      kind: t.kind,
      title: t.title || (t.kind === 'claude' ? 'Claude Code' : 'shell'),
      ...(t.cwd ? { cwd: t.cwd } : {}),
      ...(t.shell ? { shell: t.shell } : {}),
      ...(t.group != null ? { group: t.group } : {}),
    })),
  }
}

/** Comandos iniciais do layout, por chave de aba (a primeira aba nova recebe `firstKey`). */
export function layoutCommands(layout: SavedLayout, firstKey: number): Map<number, string> {
  const out = new Map<number, string>()
  layout.tabs.forEach((t, i) => {
    if (t.command && t.kind === 'shell') out.set(firstKey + i, t.command)
  })
  return out
}

/** Problema com o nome, ou `null` se serve. `ignore` é a posição que está sendo renomeada. */
export function validateLayoutName(list: readonly SavedLayout[], name: string, ignore?: number): string | null {
  const n = name.trim()
  if (!n) return 'Dê um nome ao layout.'
  if (n.length > MAX_LAYOUT_NAME) return `O nome vai até ${MAX_LAYOUT_NAME} caracteres.`
  if (list.some((l, i) => i !== ignore && sameName(l.name, n))) return 'Já existe um layout com esse nome.'
  return null
}

/** Comando inicial aceito: uma linha, até 500 caracteres. */
export function validateCommand(command: string): string | null {
  if (command.length > MAX_LAYOUT_COMMAND) return `O comando vai até ${MAX_LAYOUT_COMMAND} caracteres.`
  for (const ch of command) {
    const code = ch.charCodeAt(0)
    if (code < 32 || code === 127) return 'O comando deve ter uma linha só.'
  }
  return null
}

/** Salva: troca o layout de mesmo nome (sem diferenciar maiúsculas) ou acrescenta. `null` se a lista está cheia. */
export function saveLayout(list: readonly SavedLayout[], layout: SavedLayout): SavedLayout[] | null {
  const at = list.findIndex((l) => sameName(l.name, layout.name))
  if (at >= 0) return list.map((l, i) => (i === at ? layout : l))
  return list.length >= MAX_LAYOUTS ? null : [...list, layout]
}

export const renameLayout = (list: readonly SavedLayout[], index: number, name: string): SavedLayout[] =>
  list.map((l, i) => (i === index ? { ...l, name: name.trim() } : l))

export const deleteLayout = (list: readonly SavedLayout[], index: number): SavedLayout[] =>
  list.filter((_, i) => i !== index)
