import { useCallback, useEffect, useRef, useState } from 'react'
import { ipc } from '../../lib/ipc'
import type { GitInfo } from '../../shared/types'

export interface TabInfo {
  /** Pasta atual da aba (vem do prompt do shell). */
  cwd: string | null
  /** `null` fora de repositório git (ou antes da primeira leitura). */
  git: GitInfo | null
}

const EMPTY: TabInfo = { cwd: null, git: null }
/** Releitura periódica do git da aba ativa (arquivos mudam por fora: editor, Claude Code). */
const POLL_MS = 5000

/**
 * Pasta e git de cada aba. O TerminalView avisa a pasta (`reportCwd`) e cada prompt novo
 * (`reportPrompt`), e o git é relido nesses momentos; a aba ativa também é relida a cada 5 s
 * enquanto a janela está visível.
 */
export function useWorkspace(activeKey: number | null) {
  const [tabs, setTabs] = useState<ReadonlyMap<number, TabInfo>>(new Map())
  const tabsRef = useRef(tabs)
  tabsRef.current = tabs
  const timers = useRef(new Map<number, ReturnType<typeof setTimeout>>())

  const patch = useCallback((key: number, next: Partial<TabInfo>) => {
    setTabs((prev) => {
      const cur = prev.get(key) ?? EMPTY
      if (Object.entries(next).every(([k, v]) => cur[k as keyof TabInfo] === v)) return prev
      const map = new Map(prev)
      map.set(key, { ...cur, ...next })
      return map
    })
  }, [])

  /** Relê o git da aba (com um pequeno atraso para juntar avisos seguidos). */
  const refresh = useCallback(
    (key: number) => {
      clearTimeout(timers.current.get(key))
      timers.current.set(
        key,
        setTimeout(async () => {
          const cwd = tabsRef.current.get(key)?.cwd
          if (!cwd) return
          const git = await ipc.gitInfo(cwd).catch(() => null)
          // A aba pode ter mudado de pasta enquanto o git respondia.
          if (tabsRef.current.get(key)?.cwd !== cwd) return
          const cur = tabsRef.current.get(key)?.git
          if (JSON.stringify(cur) !== JSON.stringify(git)) patch(key, { git })
        }, 250),
      )
    },
    [patch],
  )

  const reportCwd = useCallback(
    (key: number, cwd: string) => {
      patch(key, { cwd })
      refresh(key)
    },
    [patch, refresh],
  )

  const reportPrompt = useCallback((key: number) => refresh(key), [refresh])

  const remove = useCallback((key: number) => {
    clearTimeout(timers.current.get(key))
    timers.current.delete(key)
    setTabs((prev) => {
      if (!prev.has(key)) return prev
      const map = new Map(prev)
      map.delete(key)
      return map
    })
  }, [])

  useEffect(() => {
    if (activeKey == null) return
    refresh(activeKey)
    const id = setInterval(() => {
      if (document.visibilityState === 'visible') refresh(activeKey)
    }, POLL_MS)
    return () => clearInterval(id)
  }, [activeKey, refresh])

  useEffect(() => {
    const all = timers.current
    return () => {
      for (const t of all.values()) clearTimeout(t)
    }
  }, [])

  const info = (key: number | null | undefined): TabInfo => (key == null ? EMPTY : (tabs.get(key) ?? EMPTY))

  return { info, reportCwd, reportPrompt, remove }
}
