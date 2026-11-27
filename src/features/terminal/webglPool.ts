/**
 * Teto de contextos WebGL da janela. O Chromium (e o WebView2) mantém no máximo ~16 contextos por página e,
 * passando disso, derruba o mais antigo, que pode ser o do terminal na tela. Cada aba montada tem um
 * terminal (as escondidas só ficam invisíveis), então o pool guarda o WebGL dos terminais usados por último
 * e devolve os das abas escondidas há mais tempo ao renderizador DOM. Eles ganham o WebGL de volta ao aparecer.
 */
export const MAX_WEBGL = 10

export interface WebglSlot {
  /** O terminal está na tela agora (aba ativa ou painel da tela dividida). */
  visible: () => boolean
  /** Solta o contexto WebGL (o terminal segue com o renderizador DOM). */
  release: () => void
}

export function createWebglPool(max = MAX_WEBGL) {
  /** Do usado por último para o mais antigo. */
  const order: WebglSlot[] = []
  return {
    /** O terminal acabou de ganhar (ou usar) o WebGL: vai para a frente, e os excedentes escondidos soltam o deles. */
    touch(slot: WebglSlot) {
      const i = order.indexOf(slot)
      if (i >= 0) order.splice(i, 1)
      order.unshift(slot)
      for (let j = order.length - 1; j >= 0 && order.length > max; j--) {
        const old = order[j]
        if (old === slot || old.visible()) continue
        order.splice(j, 1)
        old.release()
      }
    },
    /** O terminal soltou o WebGL ou foi fechado. */
    remove(slot: WebglSlot) {
      const i = order.indexOf(slot)
      if (i >= 0) order.splice(i, 1)
    },
    get size() {
      return order.length
    },
  }
}

/** Um pool por janela (cada janela do Termo é uma página própria). */
export const webglPool = createWebglPool()
