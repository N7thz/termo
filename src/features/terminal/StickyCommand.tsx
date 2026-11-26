import { formatDuration } from '../blocks/blocks'
import type { StickyBlock } from '../blocks/commandBlocks'

/** Onde o cabeçalho fica: em cima da grade do xterm, na largura dela. */
export interface StickyPlace {
  left: number
  top: number
  width: number
  cellH: number
}

interface Props {
  block: StickyBlock
  place: StickyPlace
  fontFamily: string
  /** Tamanho da fonte do terminal (px). */
  fontSize: number
  /** Rola até o prompt do comando. */
  onJump: () => void
}

/**
 * Cabeçalho fixo do comando (como o do Warp): quando a saída de um comando passa da tela, o comando
 * que a gerou fica preso no topo, com o estado (rodando, ✓ ou ✕ e a duração). O clique volta a ele.
 */
export function StickyCommand({ block, place, fontFamily, fontSize, onJump }: Props) {
  const failed = !block.running && block.exitCode != null && block.exitCode !== 0
  const tone = block.running
    ? 'var(--accent)'
    : failed
      ? 'var(--tone-red, var(--claude))'
      : 'var(--tone-green, var(--accent))'
  const status = block.running
    ? 'rodando…'
    : `${failed ? `✕ ${block.exitCode}` : '✓'}${block.endedAt ? ` · ${formatDuration(block.endedAt - block.startedAt)}` : ''}`
  return (
    <button
      type="button"
      tabIndex={-1}
      title="Voltar ao comando"
      aria-label={`Voltar ao comando ${block.command}`}
      onMouseDown={(e) => e.preventDefault()}
      onClick={onJump}
      className="group absolute z-10 flex animate-fade-in items-center gap-2 overflow-hidden rounded-b-[6px] border-b border-hairline bg-[color-mix(in_srgb,var(--surface)_90%,transparent)] pr-2.5 pl-3 text-left shadow-tip backdrop-blur-[12px] motion-reduce:animate-none reduced-transparency:bg-surface"
      style={{
        left: place.left,
        top: place.top,
        width: place.width,
        height: Math.round(place.cellH * 1.5),
        fontFamily,
        fontSize,
      }}
    >
      <span aria-hidden className="absolute inset-y-1 left-0 w-[3px] rounded-r-full" style={{ background: tone }} />
      <span aria-hidden className="flex-none text-muted">
        ❯
      </span>
      <span className="min-w-0 flex-1 truncate text-[0.92em] text-text">{block.command}</span>
      <span className="flex-none font-sans text-[11px] text-muted tabular-nums group-hover:hidden">{status}</span>
      <span className="hidden flex-none font-sans text-[11px] text-accent group-hover:inline">↑ voltar ao comando</span>
    </button>
  )
}
