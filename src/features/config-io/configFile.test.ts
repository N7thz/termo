import { expect, test } from 'bun:test'
import { DEFAULT_SETTINGS } from '../../shared/settings'
import type { Settings } from '../../shared/types'
import { formatExportedAt, type ImportFile, patchFor, planCliImport, previewImport } from './configFile'

const current: Settings = {
  ...DEFAULT_SETTINGS,
  theme: 'nord',
  fontSize: 14,
  defaultCwd: 'D:\\aqui',
  profiles: [
    { id: 'trabalho', name: 'Trabalho', color: 'green', cwd: '', pinned: [] },
    { id: 'local', name: 'Só aqui', color: 'accent', cwd: '', pinned: [] },
  ],
  workflows: [{ name: 'Deploy', command: 'bun run deploy', description: '' }],
}

const file = (settings: Record<string, unknown>, missing: string[] = []): ImportFile => ({
  path: 'C:\\termo-config.json',
  settings,
  appVersion: '0.1.0',
  exportedAt: '',
  missing,
})

test('só as seções que o arquivo tem, e o que muda em cada uma', () => {
  const p = previewImport(file({ theme: 'dracula', fontSize: 14, autoUpdate: current.autoUpdate }), current, true)
  expect(p.map((s) => s.id)).toEqual(['appearance', 'system'])
  expect(p[0].patch).toEqual({ theme: 'dracula' })
  expect(p[0].summary).toBe('1 mudança')
  expect(p[1].patch).toEqual({})
  expect(p[1].summary).toBe('Igual ao atual')
})

test('listas se juntam: o do arquivo substitui o de mesmo nome e nada local some', () => {
  const p = previewImport(
    file({
      profiles: [
        { id: 'trabalho', name: 'Trabalho', color: 'yellow', cwd: '', pinned: [] },
        { id: 'jogos', name: 'Jogos', color: 'accent', cwd: '', pinned: [] },
        { name: 'sem id' },
      ],
      workflows: [
        { name: 'deploy', command: 'bun run deploy:prod', description: '' },
        { name: 'Logs', command: 'docker logs -f api', description: '' },
      ],
    }),
    current,
    true,
  )
  const profiles = p.find((s) => s.id === 'profiles')
  expect(profiles?.patch.profiles?.map((x) => `${x.id}:${x.color}`)).toEqual([
    'trabalho:yellow',
    'local:accent',
    'jogos:accent',
  ])
  expect(profiles?.summary).toBe('1 perfil novo, 1 atualizado')
  const workflows = p.find((s) => s.id === 'workflows')
  expect(workflows?.patch.workflows?.map((w) => w.command)).toEqual(['bun run deploy:prod', 'docker logs -f api'])
})

test('pastas e imagens que não existem aqui ficam de fora (ou não, se pedir)', () => {
  const missing = ['Q:\\sumiu', 'Q:\\fundo.png']
  const settings = {
    defaultCwd: 'Q:\\sumiu',
    profiles: [{ id: 'trabalho', name: 'Trabalho', color: 'green', cwd: 'Q:\\sumiu', pinned: ['Q:\\sumiu', 'C:\\ok'] }],
    background: { enabled: true, images: ['Q:\\fundo.png', 'C:\\ok.png'] },
    layouts: [{ name: 'API', tabs: [{ kind: 'shell', cwd: 'Q:\\sumiu' }], groups: [], splits: [] }],
  }
  const dropped = previewImport(file(settings, missing), current, true)
  const patch = patchFor(dropped, new Set(dropped.map((s) => s.id)))
  expect(patch.defaultCwd).toBeUndefined()
  expect(patch.profiles?.[0]).toMatchObject({ cwd: '', pinned: ['C:\\ok'] })
  expect(patch.background?.images).toEqual(['C:\\ok.png'])
  expect(patch.layouts?.[0].tabs[0].cwd).toBe('')

  const kept = previewImport(file(settings, missing), current, false)
  const all = patchFor(kept, new Set(kept.map((s) => s.id)))
  expect(all.defaultCwd).toBe('Q:\\sumiu')
  expect(all.background?.images).toEqual(['Q:\\fundo.png', 'C:\\ok.png'])
})

test('objeto antigo sem um campo novo não zera o campo atual', () => {
  const p = previewImport(
    file({ tray: { enabled: true } }),
    { ...current, tray: { ...current.tray, enabled: false, lightBackground: false } },
    true,
  )
  expect(p[0].patch.tray).toMatchObject({ enabled: true, lightBackground: false })
})

test('valores com a forma errada são ignorados, não quebram a prévia', () => {
  const p = previewImport(file({ profiles: 'x', workflows: [1, null], highlights: 3 }), current, true)
  expect(p.every((s) => Object.keys(s.patch).length === 0)).toBe(true)
})

test('só as seções escolhidas entram no patch', () => {
  const p = previewImport(file({ theme: 'dracula', globalHotkey: 'Alt+F12' }), current, true)
  expect(patchFor(p, new Set(['appearance']))).toEqual({ theme: 'dracula' })
})

test('data do arquivo', () => {
  expect(formatExportedAt('')).toBe('')
  expect(formatExportedAt('lixo')).toBe('')
  expect(formatExportedAt(new Date(2026, 10, 26, 18, 5).toISOString())).toBe('26/11/2026 18:05')
})

test('termo config import: relatório, --only e --keep-missing', () => {
  const f: ImportFile = {
    ...file(
      {
        theme: 'dracula',
        workflows: [{ name: 'Logs', command: 'docker logs', description: '' }],
        defaultCwd: 'Q:\\x',
      },
      ['Q:\\x'],
    ),
    appVersion: '0.1.0',
  }
  const all = planCliImport(f, current, { sections: [], keepMissing: false })
  expect(all.patch).toMatchObject({ theme: 'dracula' })
  expect(all.patch.workflows).toHaveLength(2)
  expect(all.patch.defaultCwd).toBeUndefined()
  expect(all.report).toContain('C:\\termo-config.json (Termo 0.1.0)')
  expect(all.report).toContain('+ Aparência')
  expect(all.report).toContain('ficaram de fora (--keep-missing mantém)')

  const only = planCliImport(f, current, { sections: ['workflows', 'terminal'], keepMissing: true })
  expect(only.patch.theme).toBeUndefined()
  expect(only.patch.defaultCwd).toBe('Q:\\x')
  expect(only.report).toContain('fora do --only')
  expect(only.report).toContain('foram mantidas')
})
