import type { ITheme } from '@xterm/xterm'
import type { ExportBlock } from './blockExport'
import { formatDuration } from './blocks'

/** Limites da imagem: o canvas tem teto de tamanho e uma saída enorme não vira PNG legível mesmo. */
export const IMAGE_MAX_LINES = 1500
export const IMAGE_MAX_COLS = 220

/** As linhas que vão para a imagem: cada bloco com `$ comando`, a saída e o status, cortados nos limites. */
export function imageLines(
  blocks: readonly ExportBlock[],
): { text: string; kind: 'command' | 'output' | 'ok' | 'fail' }[] {
  const out: { text: string; kind: 'command' | 'output' | 'ok' | 'fail' }[] = []
  const clip = (s: string) => (s.length > IMAGE_MAX_COLS ? `${s.slice(0, IMAGE_MAX_COLS - 1)}…` : s)
  blocks.forEach((b, i) => {
    if (i > 0) out.push({ text: '', kind: 'output' })
    out.push({ text: clip(`$ ${b.command}`), kind: 'command' })
    if (b.output)
      for (const line of b.output.split(/\r?\n/)) out.push({ text: clip(line.replace(/\t/g, '    ')), kind: 'output' })
    const ok = b.exitCode == null || b.exitCode === 0
    const dur = formatDuration(b.durationMs)
    out.push({ text: ok ? `✓ ${dur}` : `✕ código ${b.exitCode} · ${dur}`, kind: ok ? 'ok' : 'fail' })
  })
  if (out.length > IMAGE_MAX_LINES) {
    const cut = out.length - IMAGE_MAX_LINES
    return [...out.slice(0, IMAGE_MAX_LINES - 1), { text: `… mais ${cut + 1} linhas`, kind: 'output' }]
  }
  return out
}

const color = (v: ITheme[keyof ITheme], fallback: string) => (typeof v === 'string' && v ? v : fallback)

/** Desenha os blocos num PNG com a fonte e as cores do terminal (texto puro, sem as cores ANSI da saída). */
export async function renderBlocksPng(
  blocks: readonly ExportBlock[],
  theme: ITheme,
  fontFamily: string,
  fontSize = 14,
): Promise<Uint8Array> {
  const lines = imageLines(blocks)
  const scale = 2
  const pad = 24
  const lineHeight = Math.round(fontSize * 1.45)
  const font = `${fontSize}px ${fontFamily}, monospace`
  const measure = document.createElement('canvas').getContext('2d')
  if (!measure) throw new Error('sem canvas')
  measure.font = font
  const widest = Math.max(240, ...lines.map((l) => measure.measureText(l.text).width))
  const width = Math.ceil(widest + pad * 2)
  const height = Math.ceil(lines.length * lineHeight + pad * 2)

  const canvas = document.createElement('canvas')
  canvas.width = width * scale
  canvas.height = height * scale
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('sem canvas')
  ctx.scale(scale, scale)
  const bg = color(theme.background, '#000000')
  // Fundo transparente (imagem de fundo ligada) não serve num PNG: usa o preto do tema.
  ctx.fillStyle = bg.length === 9 && bg.endsWith('00') ? color(theme.black, '#000000') : bg
  ctx.fillRect(0, 0, width, height)
  ctx.font = font
  ctx.textBaseline = 'middle'
  const fg = color(theme.foreground, '#ffffff')
  const tones = {
    command: color(theme.brightWhite, fg),
    output: fg,
    ok: color(theme.green, fg),
    fail: color(theme.red, fg),
  }
  lines.forEach((l, i) => {
    ctx.fillStyle = tones[l.kind]
    ctx.globalAlpha = l.kind === 'ok' || l.kind === 'fail' ? 0.85 : 1
    ctx.fillText(l.text, pad, pad + i * lineHeight + lineHeight / 2)
  })

  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'))
  if (!blob) throw new Error('não deu para gerar a imagem')
  return new Uint8Array(await blob.arrayBuffer())
}
