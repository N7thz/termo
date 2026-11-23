import { useEffect, useState } from 'react'
import { ipc } from '../../lib/ipc'
import type { ShellInfo } from '../../shared/types'

// A detecção (inclui `wsl -l`) roda uma vez por janela e é dividida por todos os menus.
let cache: Promise<ShellInfo[]> | null = null

function load(): Promise<ShellInfo[]> {
  cache ??= ipc.shellList().catch(() => {
    cache = null
    return []
  })
  return cache
}

/** Shells instalados (PowerShell 7, Windows PowerShell, cmd, distros do WSL), na ordem do backend. */
export function useShells(): ShellInfo[] {
  const [shells, setShells] = useState<ShellInfo[]>([])
  useEffect(() => {
    let alive = true
    void load().then((list) => alive && setShells(list))
    return () => {
      alive = false
    }
  }, [])
  return shells
}
