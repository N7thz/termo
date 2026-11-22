/** Resposta da IA separada em texto e blocos de código (só o essencial de Markdown que o modelo usa). */
export type AnswerPart = { type: 'text'; text: string } | { type: 'code'; lang: string; code: string }

export function parseAnswer(answer: string): AnswerPart[] {
  const parts: AnswerPart[] = []
  const re = /```([\w-]*)[^\S\n]*\n([\s\S]*?)(?:```|$)/g
  let last = 0
  for (const m of answer.matchAll(re)) {
    const before = answer.slice(last, m.index).trim()
    if (before) parts.push({ type: 'text', text: before })
    parts.push({ type: 'code', lang: m[1] || '', code: m[2].trimEnd() })
    last = (m.index ?? 0) + m[0].length
  }
  const rest = answer.slice(last).trim()
  if (rest) parts.push({ type: 'text', text: rest })
  return parts
}

/** O comando de correção: o primeiro bloco de shell (ou o primeiro bloco sem linguagem). */
export function fixCommand(answer: string): string | null {
  const blocks = parseAnswer(answer).filter((p) => p.type === 'code')
  const shell =
    blocks.find((b) => /^(powershell|pwsh|ps1?|shell|sh|bash|cmd|bat)$/i.test(b.lang)) ?? blocks.find((b) => !b.lang)
  return shell?.code.trim() || null
}

/** Pedido em linguagem natural na caixa de comando: linha que começa com `#` (comentário no PowerShell). */
export function naturalLanguageRequest(text: string): string | null {
  const m = /^\s*#\s*(.+)$/s.exec(text)
  const req = m?.[1].trim()
  return req && req.length >= 3 ? req : null
}
