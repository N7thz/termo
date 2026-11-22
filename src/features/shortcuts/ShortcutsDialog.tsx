import { formatShortcut } from '@ui-sdk/core/shortcuts'
import { Dialog, DialogBackdrop, DialogClose, DialogContent, DialogTitle } from '@ui-sdk/react/dialog'
import { X } from 'lucide-react'
import { Fragment } from 'react'
import { actionButton } from '../../lib/ui'
import { SHORTCUT_GROUPS, SHORTCUTS } from '../tabs/shortcuts'

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
}

interface Row {
  label: string
  keys: readonly string[]
  range: boolean
}

const tabJumps = SHORTCUTS.filter((s) => s.action?.startsWith('tab-'))

// "Ir para a aba 1…8" vira uma linha só na folha.
function rows(group: string): Row[] {
  const out: Row[] = []
  for (const s of SHORTCUTS) {
    if (s.group !== group) continue
    if (s === tabJumps[0]) {
      out.push({ label: 'Ir para a aba 1 a 8', keys: [s.keys[0], tabJumps[tabJumps.length - 1].keys[0]], range: true })
    } else if (!tabJumps.includes(s)) {
      out.push({ label: s.label, keys: s.keys, range: false })
    }
  }
  return out
}

function Keys({ keys, range }: { keys: readonly string[]; range: boolean }) {
  return (
    <span className="flex flex-wrap items-center justify-end gap-1.5">
      {keys.map((k, i) => (
        <Fragment key={k}>
          {i > 0 && <span className="text-[11px] text-muted">{range ? 'a' : 'ou'}</span>}
          <kbd className="rounded-[5px] border border-border bg-field px-1.5 py-0.5 font-mono text-[11px] text-text shadow-[inset_0_-1px_0_var(--border)]">
            {formatShortcut(k)}
          </kbd>
        </Fragment>
      ))}
    </span>
  )
}

export function ShortcutsDialog({ open, onOpenChange }: Props) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogBackdrop className="fixed inset-0 bg-black/40 transition-opacity duration-150 data-ending-style:opacity-0 data-starting-style:opacity-0" />
      <DialogContent className="m-auto flex max-h-[min(640px,calc(100vh-48px))] w-[min(720px,calc(100vw-48px))] flex-col overflow-hidden rounded-[14px] border border-hairline bg-material-thick p-0 text-text shadow-panel backdrop-blur-[28px] backdrop-saturate-180 [transition:opacity_160ms_ease-out,scale_300ms_var(--spring)] data-ending-style:scale-[0.96] data-ending-style:opacity-0 data-starting-style:scale-[0.96] data-starting-style:opacity-0 reduced-transparency:bg-surface reduced-transparency:backdrop-blur-none motion-reduce:scale-100">
        <header className="flex items-center gap-3 border-b border-hairline px-5 py-3">
          <DialogTitle className="flex-1 text-[15px] font-semibold tracking-[0.01em]">Atalhos de teclado</DialogTitle>
          <DialogClose className={actionButton} aria-label="Fechar">
            <X size={15} />
          </DialogClose>
        </header>
        <div className="grid min-h-0 flex-1 gap-x-8 gap-y-5 overflow-y-auto px-5 py-4 sm:grid-cols-2">
          {SHORTCUT_GROUPS.map((group) => (
            <section key={group} aria-label={group} className={group === 'Abas' ? 'sm:row-span-2' : undefined}>
              <h2 className="mb-2 text-[11px] font-semibold tracking-[0.06em] text-muted uppercase">{group}</h2>
              <dl className="flex flex-col">
                {rows(group).map((r) => (
                  <div
                    key={r.label}
                    className="flex items-center justify-between gap-4 border-b border-hairline py-1.5 text-[13px] last:border-0"
                  >
                    <dt>{r.label}</dt>
                    <dd>
                      <Keys keys={r.keys} range={r.range} />
                    </dd>
                  </div>
                ))}
              </dl>
            </section>
          ))}
        </div>
        <footer className="border-t border-hairline px-5 py-2 text-[11px] text-muted">
          Os atalhos com Ctrl+Shift não chegam ao shell; Ctrl+letra continua indo para o programa no terminal.
        </footer>
      </DialogContent>
    </Dialog>
  )
}
