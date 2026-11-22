/** `https://example.com/docs?a=1` → host `example.com`, resto `/docs?a=1` (o protocolo some, como nos navegadores). */
export function splitUrl(url: string): { host: string; rest: string } {
  try {
    const u = new URL(url)
    const rest = `${u.pathname === '/' ? '' : u.pathname}${u.search}${u.hash}`
    return { host: u.host, rest }
  } catch {
    return { host: url, rest: '' }
  }
}
