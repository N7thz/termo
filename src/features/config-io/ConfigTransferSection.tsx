import { Button } from '@ui-sdk/react/button'
import { Dialog, DialogBackdrop, DialogContent, DialogTitle } from '@ui-sdk/react/dialog'
import { Field, FieldDescription, FieldLabel } from '@ui-sdk/react/field'
import { Switch, SwitchThumb } from '@ui-sdk/react/switch'
import { Download, Upload } from 'lucide-react'
import { useMemo, useState } from 'react'
import { ipc } from '../../lib/ipc'
import type { Settings } from '../../shared/types'
import { formatExportedAt, type ImportFile, isEmptyPatch, patchFor, previewImport, type SectionId } from './configFile'

interface Props {
  settings: Settings
  /** Sincroniza o App com o que foi gravado (o import já gravou pelo ipc, para mostrar o erro aqui). */
  onChange: (patch: Partial<Settings>) => void
  switchClass: string
  thumbClass: string
}

const ROW = 'flex items-center justify-between gap-4 text-[13px] tracking-[0.005em]'
const DESCRIPTION = 'm-0 text-[11.5px]/normal text-muted'
const SMALL_BUTTON =
  'inline-flex h-7 items-center gap-1.5 rounded-md px-2.5 text-[12.5px] text-text hover:bg-surface-hover focus-visible:outline-2 focus-visible:outline-accent disabled:opacity-40'
const PANEL =
  'fixed inset-x-0 top-[10vh] bottom-auto mx-auto my-0 flex max-h-[80vh] h-fit w-[min(520px,calc(100vw-48px))] origin-top flex-col overflow-hidden rounded-[14px] border border-hairline bg-material-thick p-0 text-text shadow-panel backdrop-blur-[28px] backdrop-saturate-180 [transition:opacity_140ms_ease-out,scale_220ms_var(--spring-soft)] data-ending-style:scale-[0.98] data-ending-style:opacity-0 data-starting-style:scale-[0.98] data-starting-style:opacity-0 reduced-transparency:bg-surface reduced-transparency:backdrop-blur-none motion-reduce:scale-100'
const BUTTON =
  'inline-flex h-7 cursor-pointer items-center gap-1.5 rounded-md px-2.5 text-[12px] text-muted hover:bg-surface-hover hover:text-text focus-visible:outline-2 focus-visible:outline-accent disabled:cursor-default disabled:opacity-40 disabled:hover:bg-transparent disabled:hover:text-muted'
const PRIMARY = `${BUTTON} bg-accent text-on-accent hover:bg-accent hover:text-on-accent`

type Status =
  | { kind: 'idle' }
  | { kind: 'busy' }
  | { kind: 'done'; message: string }
  | { kind: 'error'; message: string }

/**
 * Levar as configurações para outra máquina: exportar grava um `termo-config.json`; importar lê um
 * (ou o `settings.json` de outra instalação), mostra o que muda por seção e aplica as escolhidas.
 */
export function ConfigTransferSection({ settings, onChange, switchClass, thumbClass }: Props) {
  const [status, setStatus] = useState<Status>({ kind: 'idle' })
  const [file, setFile] = useState<ImportFile | null>(null)
  const busy = status.kind === 'busy'

  const exportFile = () => {
    setStatus({ kind: 'busy' })
    ipc.configExport(new Date().toISOString()).then(
      (path) => setStatus(path ? { kind: 'done', message: `Exportado em ${path}` } : { kind: 'idle' }),
      (err) => setStatus({ kind: 'error', message: `Não deu para exportar: ${String(err)}` }),
    )
  }

  const importFile = () => {
    setStatus({ kind: 'busy' })
    ipc.configImportRead().then(
      (f) => {
        setStatus({ kind: 'idle' })
        if (f) setFile(f)
      },
      (err) => setStatus({ kind: 'error', message: `Não deu para importar: ${String(err)}` }),
    )
  }

  return (
    <section className="flex flex-col gap-3" aria-labelledby="transfer-title">
      <h2 id="transfer-title" className="m-0 text-[12px] font-semibold tracking-[0.01em] text-muted uppercase">
        Levar para outra máquina
      </h2>
      <Field className="flex flex-col gap-1.5 text-[13px] tracking-[0.005em]">
        <span className={ROW}>
          <FieldLabel>Arquivo de configurações</FieldLabel>
          <span className="flex gap-1">
            <Button className={SMALL_BUTTON} disabled={busy} onClick={exportFile}>
              <Download size={13} aria-hidden /> Exportar…
            </Button>
            <Button className={SMALL_BUTTON} disabled={busy} onClick={importFile}>
              <Upload size={13} aria-hidden /> Importar…
            </Button>
          </span>
        </span>
        <FieldDescription className={DESCRIPTION}>
          Tema, fonte, terminal, fundo, destaques, perfis, workflows, layouts, avisos e sistema num{' '}
          <code className="font-mono text-[11px]">termo-config.json</code>. Na outra máquina, Importar mostra o que muda
          antes de aplicar. Não leva abas abertas nem histórico.
        </FieldDescription>
        {(status.kind === 'done' || status.kind === 'error') && (
          <p
            className={`m-0 text-[11.5px] break-all ${status.kind === 'error' ? 'text-(--tone-red,var(--claude))' : 'text-muted'}`}
            role={status.kind === 'error' ? 'alert' : 'status'}
          >
            {status.message}
          </p>
        )}
      </Field>
      <ImportDialog
        file={file}
        settings={settings}
        switchClass={switchClass}
        thumbClass={thumbClass}
        onClose={() => setFile(null)}
        onApplied={(saved, patch, count) => {
          setFile(null)
          // Sincroniza o App só com as chaves gravadas, já com os valores validados pelo Rust.
          const synced = Object.fromEntries(Object.keys(patch).map((k) => [k, saved[k as keyof Settings]]))
          onChange(synced as Partial<Settings>)
          setStatus({
            kind: 'done',
            message: `Importado: ${count} ${count === 1 ? 'seção' : 'seções'} de ${file?.path ?? 'arquivo'}`,
          })
        }}
      />
    </section>
  )
}

function ImportDialog({
  file,
  settings,
  switchClass,
  thumbClass,
  onClose,
  onApplied,
}: {
  file: ImportFile | null
  settings: Settings
  switchClass: string
  thumbClass: string
  onClose: () => void
  onApplied: (saved: Settings, patch: Partial<Settings>, sections: number) => void
}) {
  const [dropMissing, setDropMissing] = useState(true)
  // Seções desligadas pela pessoa (as que mudam começam ligadas).
  const [off, setOff] = useState<ReadonlySet<SectionId>>(new Set())
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [openPath, setOpenPath] = useState<string | null>(null)

  // Arquivo novo: volta tudo ao padrão.
  if (file && file.path + file.exportedAt !== openPath) {
    setOpenPath(file.path + file.exportedAt)
    setOff(new Set())
    setDropMissing(true)
    setError(null)
  }

  const previews = useMemo(
    () => (file ? previewImport(file, settings, dropMissing) : []),
    [file, settings, dropMissing],
  )
  const changing = previews.filter((p) => !isEmptyPatch(p.patch))
  const chosen = new Set(changing.filter((p) => !off.has(p.id)).map((p) => p.id))
  const name = file?.path.split(/[\\/]/).pop() ?? ''
  const when = file ? formatExportedAt(file.exportedAt) : ''
  const from = [when && `exportado em ${when}`, file?.appVersion && `Termo ${file.appVersion}`]
    .filter(Boolean)
    .join(' · ')

  const apply = () => {
    const patch = patchFor(previews, chosen)
    if (isEmptyPatch(patch)) return
    setSaving(true)
    setError(null)
    ipc.setSettings(patch).then(
      (saved) => {
        setSaving(false)
        onApplied(saved, patch, chosen.size)
      },
      (err) => {
        setSaving(false)
        setError(String(err))
      },
    )
  }

  return (
    <Dialog open={file != null} onOpenChange={(o) => !o && !saving && onClose()}>
      <DialogBackdrop className="fixed inset-0 bg-black/30 transition-opacity duration-150 data-ending-style:opacity-0 data-starting-style:opacity-0" />
      <DialogContent
        className={PANEL}
        // O Esc fecha só o diálogo, não a tela de configurações por trás.
        onKeyDown={(e) => e.key === 'Escape' && e.stopPropagation()}
      >
        <div className="flex flex-col gap-0.5 border-b border-hairline px-4 py-3">
          <DialogTitle className="m-0 text-[13.5px] font-semibold">Importar configurações</DialogTitle>
          <span className="truncate text-[11.5px] text-muted" title={file?.path}>
            {name}
            {from && ` · ${from}`}
          </span>
        </div>

        <div className="flex min-h-0 flex-col gap-2.5 overflow-y-auto px-4 py-3">
          {changing.length === 0 ? (
            <p className="m-0 py-4 text-center text-[13px] text-muted" role="status">
              O arquivo é igual às suas configurações: não há nada para importar.
            </p>
          ) : (
            <>
              <p className={DESCRIPTION}>
                Escolha o que trazer. Perfis, workflows e layouts se juntam aos seus: os de mesmo nome são substituídos
                e nada seu é apagado.
              </p>
              {previews.map((p) => {
                const unchanged = isEmptyPatch(p.patch)
                return (
                  <Field key={p.id} className={ROW}>
                    <span className="flex min-w-0 flex-col">
                      <FieldLabel className={unchanged ? 'opacity-50' : undefined}>{p.label}</FieldLabel>
                      <span className="text-[11.5px] text-muted">{p.summary}</span>
                    </span>
                    <Switch
                      className={switchClass}
                      checked={chosen.has(p.id)}
                      disabled={unchanged || saving}
                      onCheckedChange={(on) =>
                        setOff((prev) => {
                          const next = new Set(prev)
                          if (on) next.delete(p.id)
                          else next.add(p.id)
                          return next
                        })
                      }
                    >
                      <SwitchThumb className={thumbClass} />
                    </Switch>
                  </Field>
                )
              })}
            </>
          )}

          {file && file.missing.length > 0 && (
            <Field className="flex flex-col gap-1 border-t border-hairline pt-2.5 text-[13px]">
              <span className={ROW}>
                <FieldLabel>Deixar de fora o que não existe nesta máquina</FieldLabel>
                <Switch
                  className={switchClass}
                  checked={dropMissing}
                  disabled={saving}
                  onCheckedChange={setDropMissing}
                >
                  <SwitchThumb className={thumbClass} />
                </Switch>
              </span>
              <details className="text-[11.5px] text-muted">
                <summary className="cursor-pointer select-none">
                  {file.missing.length} {file.missing.length === 1 ? 'pasta ou imagem' : 'pastas e imagens'} do arquivo
                  não {file.missing.length === 1 ? 'existe' : 'existem'} aqui
                </summary>
                <ul className="m-0 mt-1 flex list-none flex-col gap-0.5 p-0 font-mono text-[11px] break-all">
                  {file.missing.map((p) => (
                    <li key={p}>{p}</li>
                  ))}
                </ul>
              </details>
            </Field>
          )}

          {error && (
            <p className="m-0 text-[11.5px] text-(--tone-red,var(--claude))" role="alert">
              Não deu para importar: {error}
            </p>
          )}
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-hairline px-4 py-2.5">
          <button type="button" className={BUTTON} disabled={saving} onClick={onClose}>
            Cancelar
          </button>
          <button type="button" className={PRIMARY} disabled={saving || chosen.size === 0} onClick={apply}>
            {saving
              ? 'Importando…'
              : chosen.size > 0
                ? `Importar ${chosen.size} ${chosen.size === 1 ? 'seção' : 'seções'}`
                : 'Importar'}
          </button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
