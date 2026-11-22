import { open as openDialog } from '@tauri-apps/plugin-dialog'
import { Menu, MenuContent, MenuGroup, MenuGroupLabel, MenuItem, MenuTrigger } from '@ui-sdk/react/menu'
import type { ITheme } from '@xterm/xterm'
import {
  Check,
  ChevronDown,
  File as FileIcon,
  Folder,
  FolderPlus,
  Gauge,
  Paperclip,
  ShieldCheck,
  Slash,
  Sparkles,
} from 'lucide-react'
import { type CSSProperties, useEffect, useState } from 'react'
import { ipc } from '../../lib/ipc'
import { menuContent, menuItem } from '../../lib/ui'
import type { GitInfo } from '../../shared/types'
import { GitBranch } from '../workspace/GitDiff'
import {
  ATTACH_FILTERS,
  attachmentText,
  type ClaudeLine,
  contextInfo,
  EFFORT_LABEL,
  EFFORTS,
  formatCost,
  isBusy,
  isEffort,
  MODELS,
  modelAlias,
  modelLabel,
  PERMISSION_LABEL,
  QUICK_COMMANDS,
  SHIFT_TAB,
} from './claude'

const POLL_MS = 3000
const groupLabel = 'px-2.5 pt-1.5 pb-1 text-[11px] font-semibold tracking-[0.04em] text-muted uppercase'
const chip =
  'inline-flex h-[1.7em] min-w-0 flex-none items-center gap-1 rounded-[6px] border border-border bg-surface/60 px-1.5 [transition:background-color_140ms_ease-out,scale_300ms_var(--spring)] hover:bg-surface-hover active:scale-[0.96] active:duration-50 data-open:bg-surface-hover focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-accent disabled:opacity-50 motion-reduce:active:scale-100'

interface Props {
  /** Id do pty da aba (a linha de status é por sessão). */
  ptyId: number | null
  /** Estado do Claude vindo dos hooks: ocupado, os comandos esperam. */
  agentState: string | null
  /** Pasta da aba, enquanto o Claude ainda não mandou a dele. */
  cwd: string | null
  git: GitInfo | null
  theme: ITheme
  fontFamily: string
  fontSize: number
  /** Aba visível: só então a barra lê a linha de status. */
  visible: boolean
  /** Manda bytes ao Claude como se fossem digitados (Shift+Tab). */
  onKeys: (data: string) => void
  /** Digita um comando de barra no Claude e aperta Enter. */
  onCommand: (command: string) => void
}

/**
 * Barra da aba do Claude Code, no lugar da linha de contexto do shell: modelo e esforço (trocam com `/model`
 * e `/effort`), modo de permissão (o Shift+Tab do Claude), comandos rápidos, pasta, branch e o uso da sessão
 * (contexto e custo), lidos da linha de status que o Claude Code manda a cada resposta.
 */
export function ClaudeBar({
  ptyId,
  agentState,
  cwd,
  git,
  theme,
  fontFamily,
  fontSize,
  visible,
  onKeys,
  onCommand,
}: Props) {
  const [line, setLine] = useState<ClaudeLine | null>(null)

  useEffect(() => {
    if (ptyId == null || !visible) return
    let alive = true
    const load = () =>
      ipc
        .claudeLine(ptyId)
        .then((l) => alive && setLine((cur) => (JSON.stringify(cur) === JSON.stringify(l) ? cur : l)))
        .catch(() => {})
    void load()
    const timer = window.setInterval(load, POLL_MS)
    return () => {
      alive = false
      window.clearInterval(timer)
    }
  }, [ptyId, visible])

  // Um pouco depois de cada mudança de estado (resposta terminou), relê para pegar o modelo/uso novos.
  // biome-ignore lint/correctness/useExhaustiveDependencies: `agentState` só dispara a releitura
  useEffect(() => {
    if (ptyId == null || !visible) return
    const timer = window.setTimeout(() => void ipc.claudeLine(ptyId).then(setLine, () => {}), 600)
    return () => window.clearTimeout(timer)
  }, [agentState, ptyId, visible])

  const busy = isBusy(agentState)
  const waitTitle = busy ? 'Espere o Claude terminar a resposta' : undefined
  const currentModel = modelAlias(line)
  const effort = isEffort(line?.effort) ? line.effort : null
  const permission = line?.permissionMode ? (PERMISSION_LABEL[line.permissionMode] ?? line.permissionMode) : null
  const context = contextInfo(line?.contextPct ?? null)
  const cost = formatCost(line?.costUsd ?? null)
  const dir = line?.cwd || cwd
  const tone = (key: keyof ITheme) => (typeof theme[key] === 'string' ? (theme[key] as string) : 'var(--accent)')
  const contextColor = context
    ? context.tone === 'full'
      ? tone('red')
      : context.tone === 'warn'
        ? tone('yellow')
        : tone('green')
    : undefined
  const menuProps = { side: 'top' as const, align: 'start' as const, sideOffset: 6, collisionPadding: 8 }

  /**
   * Anexos: seletor do Windows com vários itens; cada um entra na caixa do Claude como `@menção` (sem Enter),
   * que é como o Claude Code anexa arquivos: imagens e PDF ele abre como tal, o resto lê como texto.
   */
  const attach = async (folders: boolean) => {
    const picked = await openDialog({
      multiple: true,
      directory: folders,
      defaultPath: dir ?? undefined,
      title: folders ? 'Anexar pastas ao Claude' : 'Anexar arquivos ao Claude',
      filters: folders ? undefined : ATTACH_FILTERS,
    }).catch(() => null)
    const paths = Array.isArray(picked) ? picked : typeof picked === 'string' ? [picked] : []
    const text = attachmentText(paths, dir)
    if (text) onKeys(text)
  }

  return (
    <div
      className="flex min-w-0 flex-none items-center gap-1.5 overflow-hidden pt-2 select-none"
      style={{ fontFamily, fontSize: Math.round(fontSize * 0.86), '--ctx-branch': tone('green') } as CSSProperties}
      role="toolbar"
      aria-label="Opções do Claude"
    >
      <Menu>
        <MenuTrigger className={`${chip} text-text`} disabled={busy} title={waitTitle ?? 'Trocar o modelo (/model)'}>
          <Sparkles aria-hidden size={12} className="flex-none text-claude" />
          <span className="truncate">{modelLabel(line)}</span>
          {line?.fastMode && <span className="text-muted">rápido</span>}
          <ChevronDown aria-hidden size={12} className="flex-none opacity-60" />
        </MenuTrigger>
        <MenuContent className={menuContent} {...menuProps} aria-label="Modelos">
          <MenuGroup>
            <MenuGroupLabel className={groupLabel}>Modelo</MenuGroupLabel>
            {MODELS.map((m) => (
              <MenuItem key={m.alias} className={menuItem} onSelect={() => onCommand(`/model ${m.alias}`)}>
                <span className="grid size-3.5 flex-none place-items-center">
                  {currentModel === m.alias && <Check aria-hidden size={13} className="text-accent" />}
                </span>
                <span className="flex-1">{m.label}</span>
                {m.hint && <span className="text-[11px] text-muted">{m.hint}</span>}
              </MenuItem>
            ))}
          </MenuGroup>
        </MenuContent>
      </Menu>

      <Menu>
        <MenuTrigger className={`${chip} text-text`} disabled={busy} title={waitTitle ?? 'Nível de esforço (/effort)'}>
          <Gauge aria-hidden size={12} className="flex-none text-muted" />
          <span className="truncate">{effort ? `esforço ${EFFORT_LABEL[effort]}` : 'Esforço'}</span>
          <ChevronDown aria-hidden size={12} className="flex-none opacity-60" />
        </MenuTrigger>
        <MenuContent className={menuContent} {...menuProps} aria-label="Esforço">
          <MenuGroup>
            <MenuGroupLabel className={groupLabel}>Esforço</MenuGroupLabel>
            {EFFORTS.map((e) => (
              <MenuItem key={e} className={menuItem} onSelect={() => onCommand(`/effort ${e}`)}>
                <span className="grid size-3.5 flex-none place-items-center">
                  {effort === e && <Check aria-hidden size={13} className="text-accent" />}
                </span>
                <span className="flex-1">{EFFORT_LABEL[e]}</span>
                <span className="font-mono text-[11px] text-muted">{e}</span>
              </MenuItem>
            ))}
          </MenuGroup>
        </MenuContent>
      </Menu>

      <button
        type="button"
        className={`${chip} text-text`}
        disabled={busy}
        title={waitTitle ?? 'Alternar o modo de permissão (Shift+Tab): pede permissão → aceita edições → modo plano'}
        onClick={() => onKeys(SHIFT_TAB)}
      >
        <ShieldCheck aria-hidden size={12} className="flex-none text-muted" />
        <span className="truncate">{permission ?? 'Permissões'}</span>
      </button>

      <Menu>
        <MenuTrigger className={`${chip} text-text`} disabled={busy} title={waitTitle ?? 'Comandos do Claude'}>
          <Slash aria-hidden size={12} className="flex-none text-muted" />
          <span>Comandos</span>
          <ChevronDown aria-hidden size={12} className="flex-none opacity-60" />
        </MenuTrigger>
        <MenuContent
          className={`${menuContent} max-w-[min(380px,90vw)]`}
          {...menuProps}
          aria-label="Comandos do Claude"
        >
          {QUICK_COMMANDS.map((c) => (
            <MenuItem key={c.command} className={menuItem} onSelect={() => onCommand(c.command)}>
              <span className="w-18 flex-none font-mono text-[12px] text-accent">{c.command}</span>
              <span className="flex min-w-0 flex-1 flex-col">
                <span>{c.label}</span>
                <span className="truncate text-[11px] text-muted">{c.hint}</span>
              </span>
            </MenuItem>
          ))}
        </MenuContent>
      </Menu>

      <Menu>
        <MenuTrigger
          className={`${chip} text-text`}
          title="Anexar arquivos ou pastas: entram na mensagem como @menção (imagens, PDF, código, texto…)"
        >
          <Paperclip aria-hidden size={12} className="flex-none text-muted" />
          <span>Anexar</span>
          <ChevronDown aria-hidden size={12} className="flex-none opacity-60" />
        </MenuTrigger>
        <MenuContent className={menuContent} {...menuProps} aria-label="Anexar">
          <MenuItem className={menuItem} onSelect={() => void attach(false)}>
            <FileIcon aria-hidden size={13} className="flex-none text-muted" />
            <span className="flex min-w-0 flex-1 flex-col">
              <span>Arquivos…</span>
              <span className="text-[11px] text-muted">imagens, PDF, código, texto · vários de uma vez</span>
            </span>
          </MenuItem>
          <MenuItem className={menuItem} onSelect={() => void attach(true)}>
            <FolderPlus aria-hidden size={13} className="flex-none text-muted" />
            <span className="flex min-w-0 flex-1 flex-col">
              <span>Pastas…</span>
              <span className="text-[11px] text-muted">o Claude vê o conteúdo da pasta</span>
            </span>
          </MenuItem>
        </MenuContent>
      </Menu>

      {dir && (
        <button
          type="button"
          className={`${chip} max-w-[28%] text-text`}
          title={`${dir}\nClique para abrir no Explorador`}
          onClick={() => void ipc.openFolder(dir).catch(() => {})}
        >
          <Folder aria-hidden size={12} className="flex-none text-muted" />
          <span className="truncate">{dir}</span>
        </button>
      )}
      {git && <GitBranch git={git} className="min-w-0 flex-none px-1 text-(--ctx-branch)" />}

      <span className="flex-1" />

      {context && (
        <span
          className="inline-flex flex-none items-center gap-1.5 text-muted tabular-nums"
          title={`${context.label}${line?.contextSize ? ` de ${Math.round(line.contextSize / 1000)} mil tokens` : ''}${context.tone === 'full' ? ' · use /compact' : ''}`}
        >
          <span className="h-1.5 w-12 overflow-hidden rounded-full bg-border" aria-hidden>
            <span
              className="block h-full rounded-full [transition:width_400ms_var(--spring-soft)]"
              style={{ width: `${Math.round(line?.contextPct ?? 0)}%`, background: contextColor }}
            />
          </span>
          {context.label}
        </span>
      )}
      {cost && (
        <span
          className="flex-none text-muted tabular-nums"
          title={`Custo estimado da sessão${line?.linesAdded != null ? ` · +${line.linesAdded} −${line.linesRemoved ?? 0} linhas` : ''}`}
        >
          {cost}
        </span>
      )}
    </div>
  )
}
