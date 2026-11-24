import { useEffect, useState } from 'react'
import { ipc } from '../../lib/ipc'

/** Hosts do `~/.ssh/config` (sem curingas), lidos de novo cada vez que o menu que os usa é montado. */
export function useSshHosts(): string[] {
  const [hosts, setHosts] = useState<string[]>([])
  useEffect(() => {
    let alive = true
    void ipc
      .sshHosts()
      .then((list) => alive && setHosts(list))
      .catch(() => undefined)
    return () => {
      alive = false
    }
  }, [])
  return hosts
}
