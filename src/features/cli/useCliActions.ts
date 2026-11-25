import { invoke } from '@tauri-apps/api/core'
import { listen } from '@tauri-apps/api/event'
import { useEffect, useRef } from 'react'
import type { TerminalActions } from '../context-menu/types'
import type { TabsState } from '../tabs/tabs'
import { type CliAction, type CliReply, type CliRequest, fail, formatTabs, ok } from './cli'

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
}

const nextFrame = () => new Promise<void>((resolve) => requestAnimationFrame(() => resolve()))

/** Espera a aba nova entrar no estado, para o próximo pedido não reaproveitar o mesmo número. */
async function waitForTab(ctx: CliContext, key: number) {
  const until = Date.now() + 2000
  while (ctx.state().nextKey <= key && Date.now() < until) await nextFrame()
}

async function perform(ctx: CliContext, a: CliAction): Promise<CliReply> {
  const s = ctx.state()
  const has = (key: number) => s.tabs.some((t) => t.key === key)
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
    case 'tabs': {
      const tabs = s.tabs.map((t) => ({
        key: t.key,
        kind: t.kind,
        title: t.title,
        profile: t.profile,
        cwd: ctx.tabCwd(t.key) ?? t.cwd ?? null,
      }))
      return ok(formatTabs(tabs, s.active, a.json))
    }
    case 'send': {
      const key = a.tab ?? s.active
      if (key == null) return fail('nenhuma aba ativa')
      const actions = ctx.actions(key)
      if (!has(key) || !actions) return fail(`aba ${key} não existe (veja termo tabs)`)
      if (a.enter) {
        if (!actions.sendText) return fail(`a aba ${key} não aceita texto`)
        actions.sendText(a.text)
      } else {
        if (!actions.pasteText) return fail(`a aba ${key} não aceita texto`)
        actions.pasteText(a.text)
      }
      return ok()
    }
    case 'focus':
      if (a.tab == null) return ok()
      if (!has(a.tab)) return fail(`aba ${a.tab} não existe (veja termo tabs)`)
      ctx.activate(a.tab)
      return ok()
    case 'close':
      if (!has(a.tab)) return fail(`aba ${a.tab} não existe (veja termo tabs)`)
      ctx.close(a.tab)
      return ok()
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
