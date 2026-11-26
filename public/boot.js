/*
 * Tela de carregamento: roda antes do React (script clássico, sem módulo) para pintar a camada #boot
 * com as cores do último tema usado, que src/features/boot/boot.ts guarda a cada troca de tema.
 * Fica em arquivo próprio porque a CSP não aceita script inline.
 */
;(() => {
  const boot = document.getElementById('boot')
  if (!boot) return

  // Tema padrão (escuro ou claro conforme o Windows) quando ainda não há tema guardado.
  const fallback = window.matchMedia('(prefers-color-scheme: dark)').matches
    ? { bg: '#0f1117', text: '#d7dce4', muted: '#7d8597', accent: '#7aa2ff', scheme: 'dark' }
    : { bg: '#f7f8fa', text: '#1f2430', muted: '#6b7280', accent: '#2f5fd0', scheme: 'light' }
  let colors = fallback
  try {
    const saved = JSON.parse(localStorage.getItem('termo.boot') || 'null')
    if (saved && typeof saved.bg === 'string') colors = { ...fallback, ...saved }
  } catch {
    /* sem armazenamento: fica o padrão */
  }

  const root = document.documentElement
  root.style.colorScheme = colors.scheme
  root.style.background = colors.bg
  for (const key of ['bg', 'text', 'muted', 'accent']) boot.style.setProperty(`--boot-${key}`, colors[key])

  // Aberturas rápidas não mostram nada além do fundo; o indicador e o aviso só entram se demorar.
  const slow = setTimeout(() => boot.classList.add('is-waiting'), 400)
  const stuck = setTimeout(() => boot.classList.add('is-stuck'), 8000)
  window.__termoBootTimers = [slow, stuck]

  // Sem barra de título ainda: "Fechar" fala direto com a janela (core:window:allow-close).
  document.getElementById('boot-close')?.addEventListener('click', () => {
    const tauri = window.__TAURI_INTERNALS__
    const label = tauri?.metadata?.currentWindow?.label
    if (tauri && label) tauri.invoke('plugin:window|close', { label }).catch(() => {})
  })
})()
