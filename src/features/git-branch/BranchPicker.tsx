import { Menu, MenuContent, MenuGroup, MenuGroupLabel, MenuItem, MenuSeparator, MenuTrigger } from '@ui-sdk/react/menu'
import { Check, ChevronDown, Cloud, CornerDownLeft, LoaderCircle, Plus, TriangleAlert } from 'lucide-react'
import { type KeyboardEvent, useState } from 'react'
import { ipc } from '../../lib/ipc'
import { menuContent, menuItem, menuSeparator } from '../../lib/ui'
import type { GitInfo } from '../../shared/types'
import { GitBranch } from '../workspace/GitDiff'
import type { GitBranchInfo } from './types'

const groupLabel = 'px-2.5 pt-1.5 pb-1 text-[11px] font-semibold tracking-[0.04em] text-muted uppercase'

/** Nome digitado para a branch nova: espaços viram `-` (o git não aceita espaço). */
export const branchName = (typed: string) => typed.replace(/\s+/g, '-')

/**
 * Botão da branch na barra inferior. Abre a lista de branches (locais primeiro, depois as que
 * só existem no remoto) e troca com `git switch`; "Nova branch" cria a partir da atual com
 * `git switch -c`. Se o git recusar (alterações que seriam perdidas, nome que já existe), a
 * lista fica aberta com a mensagem dele.
 */
export function BranchPicker({ cwd, git, className = '' }: { cwd: string; git: GitInfo; className?: string }) {
  const [open, setOpen] = useState(false)
  const [branches, setBranches] = useState<GitBranchInfo[] | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  /** Campo da branch nova aberto (`null`: fechado). */
  const [creating, setCreating] = useState<string | null>(null)

  const onOpenChange = (next: boolean) => {
    setOpen(next)
    if (!next) return
    setError(null)
    setCreating(null)
    void ipc
      .gitBranches(cwd)
      .then((list) => setBranches(list ?? []))
      .catch((e) => setError(String(e)))
  }

  const pick = async (branch: GitBranchInfo) => {
    if (branch.current || busy) return
    setBusy(branch.name)
    setError(null)
    try {
      await ipc.gitSwitch(cwd, branch.name)
      setOpen(false)
    } catch (e) {
      setError(String(e))
    } finally {
      setBusy(null)
    }
  }

  const create = async () => {
    const name = branchName(creating?.trim() ?? '')
    if (!name || busy) return
    setBusy(name)
    setError(null)
    try {
      await ipc.gitCreateBranch(cwd, name)
      setOpen(false)
    } catch (e) {
      setError(String(e))
    } finally {
      setBusy(null)
    }
  }

  // O campo fica dentro do menu: as teclas não podem virar navegação nem busca por letra do menu.
  const onNameKey = (e: KeyboardEvent<HTMLInputElement>) => {
    e.stopPropagation()
    if (e.key === 'Enter') {
      e.preventDefault()
      void create()
    } else if (e.key === 'Escape') {
      e.preventDefault()
      setCreating(null)
    }
  }

  const local = branches?.filter((b) => !b.remote) ?? []
  const remote = branches?.filter((b) => b.remote) ?? []
  const row = (b: GitBranchInfo) => (
    <MenuItem
      key={`${b.remote}:${b.name}`}
      className={menuItem}
      value={b.name}
      closeOnSelect={false}
      disabled={busy != null && busy !== b.name}
      onSelect={() => void pick(b)}
    >
      <span className="grid size-3.5 flex-none place-items-center">
        {busy === b.name ? (
          <LoaderCircle aria-hidden size={13} className="animate-spin motion-reduce:animate-none" />
        ) : b.current ? (
          <Check aria-hidden size={13} className="text-accent" />
        ) : b.remote ? (
          <Cloud aria-hidden size={13} className="text-muted" />
        ) : null}
      </span>
      <span className={`min-w-0 flex-1 truncate ${b.current ? 'font-[600]' : ''}`}>{b.name}</span>
      <span className="flex-none pl-4 text-[11px] text-muted">{b.updated}</span>
    </MenuItem>
  )

  return (
    <Menu open={open} onOpenChange={onOpenChange}>
      <MenuTrigger className={className} title="Trocar de branch" aria-label="Trocar de branch">
        <GitBranch git={git} />
        <ChevronDown aria-hidden size={12} className="flex-none opacity-60" />
      </MenuTrigger>
      <MenuContent
        className={`${menuContent} max-h-[min(420px,70vh)] max-w-[min(440px,90vw)] overflow-y-auto`}
        side="top"
        align="start"
        sideOffset={6}
        collisionPadding={8}
        aria-label="Branches"
      >
        {error && (
          <div role="alert" className="mx-1 mb-1 flex gap-2 rounded-md bg-surface px-2.5 py-2 text-[12px] text-text">
            <TriangleAlert aria-hidden size={14} className="mt-px flex-none text-claude" />
            <span className="whitespace-pre-wrap break-words">{error}</span>
          </div>
        )}
        {creating == null ? (
          <MenuItem
            className={menuItem}
            value="__nova-branch"
            closeOnSelect={false}
            disabled={busy != null}
            onSelect={() => {
              setError(null)
              setCreating('')
            }}
          >
            <Plus aria-hidden size={13} className="flex-none text-muted" />
            <span className="flex-1">Nova branch…</span>
          </MenuItem>
        ) : (
          <div className="flex flex-col gap-1 px-1 pt-0.5 pb-1">
            <div className="flex items-center gap-2 rounded-md border border-accent/50 bg-surface px-2.5 py-[5px] focus-within:border-accent">
              {busy ? (
                <LoaderCircle
                  aria-hidden
                  size={13}
                  className="flex-none animate-spin text-muted motion-reduce:animate-none"
                />
              ) : (
                <Plus aria-hidden size={13} className="flex-none text-muted" />
              )}
              <input
                // biome-ignore lint/a11y/noAutofocus: o campo só existe depois de escolher "Nova branch"
                autoFocus
                value={creating}
                onChange={(e) => setCreating(branchName(e.target.value))}
                onKeyDown={onNameKey}
                disabled={busy != null}
                spellCheck={false}
                aria-label="Nome da branch nova"
                placeholder="nome-da-branch"
                className="min-w-0 flex-1 border-0 bg-transparent p-0 text-text outline-none placeholder:text-muted"
              />
              <CornerDownLeft aria-hidden size={12} className="flex-none text-muted" />
            </div>
            <span className="px-2.5 text-[11px] text-muted">
              A partir de {git.branch ?? (git.commit ? `@${git.commit}` : 'HEAD')}, levando as alterações atuais
            </span>
          </div>
        )}
        <MenuSeparator className={menuSeparator} />
        {branches == null && !error && <div className="px-2.5 py-[5px] text-muted">Carregando branches…</div>}
        {branches && branches.length === 0 && <div className="px-2.5 py-[5px] text-muted">Nenhuma branch</div>}
        {local.length > 0 && (
          <MenuGroup>
            <MenuGroupLabel className={groupLabel}>Locais</MenuGroupLabel>
            {local.map(row)}
          </MenuGroup>
        )}
        {remote.length > 0 && (
          <MenuGroup>
            <MenuGroupLabel className={groupLabel}>Só no remoto</MenuGroupLabel>
            {remote.map(row)}
          </MenuGroup>
        )}
      </MenuContent>
    </Menu>
  )
}
