import { invoke } from '@tauri-apps/api/core'
import { listen } from '@tauri-apps/api/event'
import { useEffect, useRef } from 'react'
import type { TerminalActions } from '../context-menu/types'
import type { TabsState } from '../tabs/tabs'
import { type CliAction, type CliReply, type CliRequest, type CliTab, fail, formatTabs, ok, resolveTab } from './cli'

export interface CliContext {
  /** Estado atual das abas (lido na hora, não o do último render). */
  state: () => TabsState
  /** Pasta atual da aba (a do prompt), se já se sabe. */
  tabCwd: (key: number) => string | null
  /** Aba de shell nova; `command` roda no primeiro prompt; `splitWith` abre dividida com ela. */
  openShell: (opts: { cwd: string; shellId?: string; command?: string; splitWith?: number }) => void
  /** Aba do Claude Code nova; `prompt` vai quando ele ficar pronto. */
  openClaude: (cwd: string, prompt: string | null) => void
  activate: (key: number) => void
  close: (key: number) => void
  actions: (key: number) => TerminalActions | undefined
  /** Nome mostrado da aba (o dado ou o automático). */
  tabName: (key: number) => string
  rename: (key: number, label: string | null) => void
  /** Troca a nota da aba (`null` apaga); `append` junta uma linha no fim. */
  setNote: (key: number, note: string | null, append: boolean) => void
}

const nextFrame = () => new Promise<void>((resolve) => requestAnimationFrame(() => resolve()))

/** Espera a aba nova entrar no estado, para o próximo pedido não reaproveitar o mesmo número. */
async function waitForTab(ctx: CliContext, key: number) {
  const until = Date.now() + 2000
  while (ctx.state().nextKey <= key && Date.now() < until) await nextFrame()
}

function listTabs(ctx: CliContext): CliTab[] {
  return ctx.state().tabs.map((t) => ({
    key: t.key,
    kind: t.kind,
    title: ctx.tabName(t.key),
    label: t.label ?? null,
    profile: t.profile,
    cwd: ctx.tabCwd(t.key) ?? t.cwd ?? null,
  }))
}

/** Aba do pedido: a referência (`--tab`), senão a do terminal `pty`, senão a ativa. */
function target(ctx: CliContext, ref: string | null, pty: number | null = null): { key: number } | { error: string } {
  if (ref != null) return resolveTab(listTabs(ctx), ref)
  if (pty != null) {
    const own = ctx.state().tabs.find((t) => ctx.actions(t.key)?.ptyId?.() === pty)
    if (own) return { key: own.key }
  }
  const active = ctx.state().active
  return active != null ? { key: active } : { error: 'nenhuma aba ativa' }
}

async function perform(ctx: CliContext, a: CliAction): Promise<CliReply> {
  const s = ctx.state()
  switch (a.type) {
    case 'open':
    case 'run':
    case 'claude': {
      const key = s.nextKey
      const splitWith = a.type !== 'claude' && a.split && s.active != null ? s.active : undefined
      if (a.type === 'open') ctx.openShell({ cwd: a.cwd, shellId: a.shell ?? undefined, splitWith })
      else if (a.type === 'run') ctx.openShell({ cwd: a.cwd, command: a.command, splitWith })
      else ctx.openClaude(a.cwd, a.prompt)
      await waitForTab(ctx, key)
      return ctx.state().tabs.some((t) => t.key === key) ? ok(`aba ${key}`) : fail('a aba não abriu')
    }
    case 'tabs':
      return ok(formatTabs(listTabs(ctx), s.active, a.json))
    case 'send': {
      const t = target(ctx, a.tab)
      if ('error' in t) return fail(t.error)
      const actions = ctx.actions(t.key)
      const write = a.enter ? actions?.sendText : actions?.pasteText
      if (!write) return fail(`a aba ${t.key} não aceita texto`)
      write(a.text)
      return ok()
    }
    case 'focus': {
      if (a.tab == null) return ok()
      const t = target(ctx, a.tab)
      if ('error' in t) return fail(t.error)
      ctx.activate(t.key)
      return ok()
    }
    case 'close': {
      const t = target(ctx, a.tab)
      if ('error' in t) return fail(t.error)
      ctx.close(t.key)
      return ok()
    }
    case 'title': {
      const t = target(ctx, a.tab, a.pty)
      if ('error' in t) return fail(t.error)
      ctx.rename(t.key, a.label)
      return ok()
    }
    case 'note': {
      const t = target(ctx, a.tab, a.pty)
      if ('error' in t) return fail(t.error)
      if (a.text == null && !a.clear) return ok(s.tabs.find((x) => x.key === t.key)?.note ?? '')
      ctx.setNote(t.key, a.clear ? null : a.text, a.append)
      return ok()
    }
  }
}

/**
 * Executa os pedidos do `termo` (evento `cli-action`, só na janela principal) um de cada vez e
 * devolve a resposta ao Rust pelo `cli_reply`.
 */
export function useCliActions(ctx: CliContext, enabled: boolean) {
  const ctxRef = useRef(ctx)
  ctxRef.current = ctx
  useEffect(() => {
    if (!enabled) return
    let queue = Promise.resolve()
    let unlisten: (() => void) | undefined
    let gone = false
    const reply = (id: number, r: CliReply) => invoke('cli_reply', { id, reply: r }).catch(() => undefined)
    void listen<CliRequest>('cli-action', (e) => {
      const { id, ...action } = e.payload
      queue = queue.then(async () => {
        try {
          await reply(id, await perform(ctxRef.current, action as CliAction))
        } catch (err) {
          await reply(id, fail(String(err)))
        }
      })
    })
      .then((fn) => {
        if (gone) fn()
        else unlisten = fn
      })
      .catch(() => undefined)
    return () => {
      gone = true
      unlisten?.()
    }
  }, [enabled])
}

/** "Instalar o comando termo no PATH" (paleta): avisa o resultado pelo aviso do Windows. */
export async function installCliOnPath() {
  const notify = (body: string) => invoke('notify', { title: 'Comando termo', body }).catch(() => undefined)
  try {
    const added = await invoke<boolean>('cli_install_path')
    await notify(
      added
        ? 'Pronto: abra um terminal novo e use termo . / termo run / termo tabs (termo help mostra tudo).'
        : 'O termo já está no PATH. Rode termo help num terminal.',
    )
  } catch (err) {
    await notify(`Não deu para instalar: ${String(err)}`)
  }
}
