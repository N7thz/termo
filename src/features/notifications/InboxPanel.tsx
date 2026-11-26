import { Popover, PopoverContent, PopoverTitle, PopoverTrigger } from '@ui-sdk/react/popover'
import {
  Bell,
  BellRing,
  CheckCheck,
  CircleCheck,
  CircleX,
  ListChecks,
  ShieldQuestion,
  Trash2,
  TriangleAlert,
  Zap,
} from 'lucide-react'
import { type KeyboardEvent, type ReactNode, useEffect, useRef, useState } from 'react'
import { Scroller } from '../../lib/Scroller'
import { actionButton } from '../../lib/ui'
import { ClaudeIcon } from '../tabs/ClaudeIcon'
import { badgeText, groupByDay, type InboxItem, type InboxKind, pending, relativeTime, unreadCount } from './inbox'
import type { Inbox } from './useInbox'

interface Props {
  inbox: Inbox
  /** Aberto/fechado controlado de fora (o atalho Ctrl+Shift+O). */
  open: boolean
  onOpenChange: (open: boolean) => void
  /** A aba ainda existe nesta janela? */
  tabExists: (key: number) => boolean
  onOpenTab: (key: number) => void
  onOpenSessions: () => void
}

const PANEL =
  'm-0 flex max-h-[min(560px,75vh)] w-[min(380px,calc(100vw-24px))] origin-(--transform-origin) flex-col overflow-hidden rounded-[12px] border border-hairline bg-material-thick p-0 text-text shadow-pop backdrop-blur-[28px] backdrop-saturate-180 outline-none [transition:opacity_120ms_ease-out,scale_160ms_var(--spring-soft)] data-ending-style:scale-[0.97] data-ending-style:opacity-0 data-starting-style:scale-[0.97] data-starting-style:opacity-0 reduced-transparency:bg-surface reduced-transparency:backdrop-blur-none motion-reduce:scale-100'
const HEAD_BUTTON =
  'inline-flex h-6 cursor-pointer items-center gap-1 rounded-md px-1.5 text-[11.5px] text-muted hover:bg-surface-hover hover:text-text focus-visible:outline-2 focus-visible:outline-accent disabled:cursor-default disabled:opacity-40 disabled:hover:bg-transparent disabled:hover:text-muted'
const ROW =
  'group flex w-full cursor-pointer items-start gap-2.5 rounded-md px-2 py-1.5 text-left outline-none hover:bg-surface-hover focus-visible:bg-surface-hover focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent'
const GROUP_LABEL = 'px-2 pt-2 pb-1 text-[10px] font-semibold tracking-[0.06em] text-muted uppercase'

const YELLOW = 'var(--tone-yellow, var(--accent))'
const GREEN = 'var(--tone-green, var(--accent))'

function KindIcon({ kind }: { kind: InboxKind }): ReactNode {
  const props = { 'aria-hidden': true, size: 14, className: 'flex-none' } as const
  switch (kind) {
    case 'claude-done':
      return <ClaudeIcon size={14} className="flex-none text-claude" />
    case 'claude-blocked':
      return <ShieldQuestion {...props} style={{ color: YELLOW }} />
    case 'command-ok':
      return <CircleCheck {...props} style={{ color: GREEN }} />
    case 'command-failed':
      return <CircleX {...props} className="flex-none text-claude" />
    case 'session-done':
      return <ListChecks {...props} className="flex-none text-accent" />
    case 'session-failed':
      return <TriangleAlert {...props} className="flex-none text-claude" />
    case 'program':
      return <BellRing {...props} className="flex-none text-accent" />
    case 'trigger':
      return <Zap {...props} style={{ color: YELLOW }} />
  }
}

/**
 * Central de avisos: sino na barra de título com as não lidas e um painel com o histórico (pedidos
 * de permissão pendentes no topo, depois por dia). Clicar leva à aba ou à tela de Sessões.
 */
export function InboxPanel({ inbox, open, onOpenChange: setOpen, tabExists, onOpenTab, onOpenSessions }: Props) {
  const [confirmClear, setConfirmClear] = useState(false)
  const [now, setNow] = useState(() => Date.now())
  // Com o ponteiro sobre a lista, avisos novos esperam: a linha sob o mouse não sai do lugar.
  const [frozen, setFrozen] = useState<InboxItem[] | null>(null)
  const listRef = useRef<HTMLDivElement>(null)

  const unread = unreadCount(inbox.items)
  const items = frozen ?? inbox.items
  const waiting = pending(items)
  const groups = groupByDay(items, now)

  useEffect(() => {
    if (!open) return
    setNow(Date.now())
    setConfirmClear(false)
    const t = window.setInterval(() => setNow(Date.now()), 30_000)
    return () => window.clearInterval(t)
  }, [open])

  const target = (item: InboxItem): 'tab' | 'sessions' | null => {
    if (item.tabKey != null) return tabExists(item.tabKey) ? 'tab' : null
    return item.sessionId ? 'sessions' : null
  }

  const choose = (item: InboxItem) => {
    inbox.read(item.id)
    const where = target(item)
    if (!where) return
    setOpen(false)
    if (where === 'tab' && item.tabKey != null) onOpenTab(item.tabKey)
    else onOpenSessions()
  }

  // ↑/↓ entre as linhas, Home/End nas pontas.
  const onListKey = (e: KeyboardEvent<HTMLDivElement>) => {
    if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(e.key)) return
    const rows = Array.from(listRef.current?.querySelectorAll<HTMLButtonElement>('[data-inbox-row]') ?? [])
    if (!rows.length) return
    e.preventDefault()
    const i = rows.indexOf(document.activeElement as HTMLButtonElement)
    const next =
      e.key === 'Home'
        ? 0
        : e.key === 'End'
          ? rows.length - 1
          : e.key === 'ArrowDown'
            ? Math.min(rows.length - 1, i + 1)
            : Math.max(0, i - 1)
    rows[next].focus()
  }

  const row = (item: InboxItem) => {
    const where = target(item)
    const full = `${item.title}\n${item.detail}${item.count > 1 ? ` (×${item.count})` : ''}${where == null ? ' · a aba já foi fechada' : ''}`
    return (
      <li key={item.id}>
        <button type="button" data-inbox-row className={ROW} title={full} onClick={() => choose(item)}>
          <span className="mt-[3px] flex">
            <KindIcon kind={item.kind} />
          </span>
          <span className="flex min-w-0 flex-1 flex-col">
            <span className="flex items-center gap-1.5">
              <span
                className={`min-w-0 truncate text-[12.5px] ${item.read ? 'text-muted' : 'font-semibold text-text'}`}
              >
                {item.title}
              </span>
              {item.count > 1 && <span className="flex-none text-[11px] text-muted tabular-nums">×{item.count}</span>}
            </span>
            <span className="line-clamp-2 text-[11.5px] break-words text-muted">{item.detail}</span>
          </span>
          <span className="flex flex-none flex-col items-end gap-1 pt-px">
            <span className="text-[11px] whitespace-nowrap text-muted tabular-nums">{relativeTime(item.at, now)}</span>
            {!item.read && (
              <span className="size-1.5 rounded-full bg-accent">
                <span className="sr-only">não lido</span>
              </span>
            )}
          </span>
        </button>
      </li>
    )
  }

  const label = unread ? `Avisos: ${unread} não lido${unread === 1 ? '' : 's'}` : 'Avisos'

  return (
    <Popover
      open={open}
      onOpenChange={(o) => {
        setOpen(o)
        if (!o) setFrozen(null)
      }}
      modal={false}
    >
      {/* O número fica ao lado do sino, como no indicador de Sessões: amarelo com permissão pendente. */}
      <PopoverTrigger className={`${actionButton} tabular-nums`} aria-label={label} title={`${label} · Ctrl+Shift+O`}>
        <Bell aria-hidden size={14} />
        {unread > 0 && (
          <span
            aria-hidden
            className="text-[11.5px] text-accent"
            style={waiting.length ? { color: YELLOW } : undefined}
          >
            {badgeText(unread)}
          </span>
        )}
      </PopoverTrigger>
      {/* role=dialog explícito: o painel do navegador (webview nativo, por cima do HTML) se esconde ao ver um. */}
      <PopoverContent
        role="dialog"
        className={PANEL}
        side="bottom"
        align="end"
        sideOffset={6}
        collisionPadding={8}
        // Abre com o foco no aviso mais recente (Enter abre, setas navegam), não num botão do cabeçalho.
        initialFocus={() => listRef.current?.querySelector<HTMLElement>('[data-inbox-row]') ?? undefined}
      >
        <div className="flex items-center gap-1 border-b border-hairline px-3 py-2">
          <PopoverTitle className="m-0 flex-1 text-[13px] font-semibold">Avisos</PopoverTitle>
          <button type="button" className={HEAD_BUTTON} disabled={unread === 0} onClick={inbox.readAll}>
            <CheckCheck aria-hidden size={13} />
            Marcar como lidos
          </button>
          <button
            type="button"
            className={`${HEAD_BUTTON} ${confirmClear ? 'text-claude hover:text-claude' : ''}`}
            disabled={inbox.items.length === 0}
            onClick={() => {
              if (!confirmClear) return setConfirmClear(true)
              inbox.clear()
              setConfirmClear(false)
              setFrozen(null)
            }}
            onBlur={() => setConfirmClear(false)}
          >
            <Trash2 aria-hidden size={13} />
            {confirmClear ? 'Confirmar' : 'Limpar'}
          </button>
        </div>

        {items.length === 0 ? (
          <div className="flex flex-col items-center gap-1.5 px-6 py-8 text-center">
            <Bell aria-hidden size={18} className="text-muted" />
            <p className="m-0 text-[12.5px] text-text">Nenhum aviso ainda</p>
            <p className="m-0 text-[11.5px] text-muted">
              Aparecem aqui quando o Claude termina ou pede permissão, quando um comando longo acaba e quando uma sessão
              conclui o plano.
            </p>
          </div>
        ) : (
          <Scroller className="min-h-0 flex-1">
            {/* biome-ignore lint/a11y/noStaticElementInteractions: só repassa as setas para as linhas (botões) */}
            <div
              ref={listRef}
              className="p-1"
              onKeyDown={onListKey}
              onPointerEnter={() => setFrozen(inbox.items)}
              onPointerLeave={() => setFrozen(null)}
            >
              {waiting.length > 0 && (
                <section aria-label="Esperando você">
                  <div className={GROUP_LABEL} style={{ color: YELLOW }}>
                    Esperando você
                  </div>
                  <ul className="m-0 flex list-none flex-col p-0">{waiting.map(row)}</ul>
                </section>
              )}
              {groups.map((g) => (
                <section key={g.label} aria-label={g.label}>
                  <div className={GROUP_LABEL}>{g.label}</div>
                  <ul className="m-0 flex list-none flex-col p-0">{g.items.map(row)}</ul>
                </section>
              ))}
            </div>
          </Scroller>
        )}

        {(inbox.coordDown || inbox.saveFailed) && (
          <p className="m-0 border-t border-hairline px-3 py-1.5 text-[11px] text-muted">
            {inbox.coordDown && 'Sessões do coord indisponíveis: só os avisos das abas aparecem.'}
            {inbox.coordDown && inbox.saveFailed && ' '}
            {inbox.saveFailed && 'Não deu para salvar o histórico: ele some ao fechar o app.'}
          </p>
        )}
      </PopoverContent>
    </Popover>
  )
}
