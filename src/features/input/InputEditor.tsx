import type { ITheme } from '@xterm/xterm'
import { type CSSProperties, type KeyboardEvent, type RefObject, useEffect, useMemo, useRef, useState } from 'react'
import { ipc } from '../../lib/ipc'
import type { PathSuggestion } from '../../shared/types'
import { naturalLanguageRequest } from '../ai/answer'
import { CompletionList } from '../autocomplete/CompletionList'
import { type Completion, completeCommand } from '../autocomplete/complete'
import { loadCommands, nextWord, rememberCommand, type StoredCommand, suggest } from '../autocomplete/historyStore'
import { PathSuggestions } from '../autocomplete/PathSuggestions'
import { type Token, type TokenType, tokenize } from './tokenize'

/** Mesmo mapeamento do PSREADLINE_COLORS (src-tauri/src/shell.rs): a caixa e o prompt têm as mesmas cores. */
const TOKEN_THEME_KEY: Partial<Record<TokenType, keyof ITheme>> = {
  command: 'brightGreen',
  parameter: 'cyan',
  string: 'yellow',
  variable: 'magenta',
  number: 'brightMagenta',
  operator: 'brightBlack',
  comment: 'brightBlack',
  keyword: 'blue',
}

export function tokenStyle(type: TokenType, theme: ITheme): CSSProperties {
  if (type === 'path') return { color: 'var(--accent)', textDecoration: 'underline', textUnderlineOffset: '3px' }
  const key = TOKEN_THEME_KEY[type]
  const color = key && typeof theme[key] === 'string' ? (theme[key] as string) : 'var(--text)'
  return type === 'comment' ? { color, fontStyle: 'italic' } : { color }
}

/** O que o TerminalView precisa da caixa: ler o texto e trocá-lo (Ctrl+R, workflows). */
export interface InputEditorApi {
  get: () => string
  set: (text: string) => void
}

interface Props {
  /** Prompt ocioso e no PowerShell: a caixa aparece. Fechada, fica fora do fluxo e sem foco. */
  open: boolean
  theme: ITheme
  fontFamily: string
  /** Em px CSS, já compensado pelo zoom da interface (`terminalFontSize`). */
  fontSize: number
  inputRef: RefObject<HTMLTextAreaElement | null>
  /** Histórico em memória, uma lista por aba (dono: o TerminalView). */
  history: RefObject<string[]>
  cwd: () => string | null
  onSubmit: (text: string) => void
  /** Esc: devolve o foco ao xterm. */
  onEscape: () => void
  /** Ctrl+L: limpa a tela. */
  onClear: () => void
  /** Ctrl+R: abre a busca no histórico (sem isso, o Ctrl+R não faz nada na caixa). */
  onSearchHistory?: () => void
  /** Recebe a API da caixa a cada render. */
  api?: RefObject<InputEditorApi | null>
}

/** Pedaço digitado até o cursor que Tab completa: começa depois do último espaço. */
function wordBefore(text: string, caret: number) {
  const start = Math.max(text.lastIndexOf(' ', caret - 1), text.lastIndexOf('\n', caret - 1)) + 1
  return { start, word: text.slice(start, caret) }
}

const quoteIfNeeded = (label: string) => (/\s/.test(label) ? `'${label.replace(/'/g, "''")}'` : label)

/** Histórico do PSReadLine, lido uma vez por execução do app: serve de último recurso da sugestão em cinza. */
let generalHistory: Promise<string[]> | null = null
const loadGeneralHistory = () => {
  generalHistory ??= ipc.historyRead(3000).catch(() => [])
  return generalHistory
}

/** Autocomplete de comando em andamento: a palavra trocada e a opção que está na linha. */
interface CommandCycle {
  start: number
  end: number
  items: Completion[]
  i: number
}

/**
 * Caixa de comando no estilo do Warp: um textarea transparente por cima de um `<pre>` com os tokens
 * coloridos (mesma fonte e mesmo espaçamento, então o cursor e a seleção alinham com o texto colorido).
 * Entrada e saída animam só opacidade e transform, então aparecer e sumir rápido nunca deixa estado preso.
 */
export function InputEditor({
  open,
  theme,
  fontFamily,
  fontSize,
  inputRef,
  history,
  cwd,
  onSubmit,
  onEscape,
  onClear,
  onSearchHistory,
  api,
}: Props) {
  const [text, setText] = useState('')
  const [items, setItems] = useState<PathSuggestion[]>([])
  // Autocomplete de comando (Tab em `git sta`, `bun run `): lista e opção ativa.
  const [cycle, setCycle] = useState<{ items: Completion[]; i: number } | null>(null)
  const cmdCycle = useRef<CommandCycle | null>(null)
  // Sugestão em cinza: comandos guardados (por pasta) e o histórico geral; o cursor precisa estar no fim.
  const stored = useRef<StoredCommand[]>([])
  const [general, setGeneral] = useState<string[]>([])
  const [atEnd, setAtEnd] = useState(true)
  const boxRef = useRef<HTMLDivElement>(null)
  const [listBottom, setListBottom] = useState(0)
  // Navegação no histórico: `cursor === history.length` é o rascunho atual.
  const nav = useRef({ cursor: 0, draft: '' })
  // Tab: palavra sendo completada e a opção atual (Tab de novo troca para a próxima).
  const completion = useRef<{ start: number; end: number; items: PathSuggestion[]; i: number } | null>(null)
  const seq = useRef(0)
  /** `# pedido` + Enter: o Claude está convertendo o pedido em comando (a caixa fica só leitura). */
  const [asking, setAsking] = useState(false)
  const [askError, setAskError] = useState<string | null>(null)

  const tokens = useMemo<Token[]>(() => tokenize(text), [text])
  const ghost =
    open && atEnd && !asking && !cycle && items.length === 0 ? suggest(text, cwd(), stored.current, general) : ''

  // A cada prompt, relê os comandos guardados (outras abas também gravam).
  useEffect(() => {
    if (open) stored.current = loadCommands()
  }, [open])
  useEffect(() => {
    let alive = true
    void loadGeneralHistory().then((list) => alive && setGeneral(list))
    return () => {
      alive = false
    }
  }, [])

  if (api) {
    api.current = {
      get: () => text,
      set: (next) => {
        setText(next)
        setAtEnd(true)
        requestAnimationFrame(() => inputRef.current?.setSelectionRange(next.length, next.length))
      },
    }
  }

  const closeList = () => {
    seq.current++
    completion.current = null
    cmdCycle.current = null
    setItems([])
    setCycle(null)
  }

  // Fechou (comando rodando, buffer alternativo): some a lista.
  // biome-ignore lint/correctness/useExhaustiveDependencies: closeList só mexe em refs e no setter estável
  useEffect(() => {
    if (!open) closeList()
  }, [open])

  const replaceRange = (start: number, end: number, value: string) => {
    const next = text.slice(0, start) + value + text.slice(end)
    setText(next)
    const caret = start + value.length
    setAtEnd(caret === next.length)
    // Depois do render, com o texto novo no textarea.
    requestAnimationFrame(() => inputRef.current?.setSelectionRange(caret, caret))
    return caret
  }

  const apply = (c: { start: number; end: number; items: PathSuggestion[]; i: number }) => {
    const item = c.items[c.i]
    if (!item) return
    const value = quoteIfNeeded(item.label)
    const caret = replaceRange(c.start, c.end, value)
    completion.current = { ...c, end: caret }
  }

  /** Escreve a opção `i` do autocomplete de comando no lugar da palavra e lembra onde ela termina. */
  const applyCommand = (c: CommandCycle, space: boolean) => {
    const item = c.items[c.i]
    if (!item) return
    const value = item.kind === 'script' ? quoteIfNeeded(item.value) : item.value
    // Sem mais opções, o espaço já deixa o cursor pronto para o próximo argumento.
    const tail = space && !/^\s/.test(text.slice(c.end)) ? ' ' : ''
    const caret = replaceRange(c.start, c.end, value + tail)
    cmdCycle.current = { ...c, end: caret - tail.length }
    setCycle(c.items.length > 1 ? { items: c.items, i: c.i } : null)
    if (c.items.length > 1) setListBottom((boxRef.current?.offsetHeight ?? 0) + 4)
  }

  /** Os scripts do package.json só são lidos quando o comando é de um gerenciador de pacotes que os usa. */
  const scriptsFor = async (before: string, dir: string | null) => {
    if (!dir || !/(?:^|[\s;|&(])(?:bun|npm)(?:\.cmd)?\s/i.test(before)) return []
    return (await ipc.nodeInfo(null, dir).catch(() => null))?.scripts ?? []
  }

  const complete = async () => {
    const el = inputRef.current
    const dir = cwd()
    if (!el) return
    const turn = cmdCycle.current
    if (turn && turn.items.length > 1) {
      applyCommand({ ...turn, i: (turn.i + 1) % turn.items.length }, false)
      return
    }
    const caretNow = el.selectionStart
    const known = completeCommand(text, caretNow, await scriptsFor(text.slice(0, caretNow), dir))
    if (known) {
      // O texto pode ter mudado durante a espera pelos scripts.
      if (inputRef.current?.value !== text) return
      completion.current = null
      setItems([])
      applyCommand({ start: known.start, end: caretNow, items: known.items, i: 0 }, known.items.length === 1)
      return
    }
    if (!dir) return
    const active = completion.current
    if (active && active.items.length > 1) {
      apply({ ...active, i: (active.i + 1) % active.items.length })
      return
    }
    const caret = el.selectionStart
    const { start, word } = wordBefore(text, caret)
    const query = word.replace(/^['"]/, '')
    const mine = ++seq.current
    const found = await ipc.suggestPaths(dir, query).catch(() => [])
    if (mine !== seq.current || found.length === 0) return
    const c = { start, end: caret, items: found, i: 0 }
    apply(c)
    if (found.length > 1) {
      setListBottom((boxRef.current?.offsetHeight ?? 0) + 4)
      setItems(found)
    }
  }

  /** Linguagem natural: `# listar arquivos grandes` vira o comando na própria caixa, sem executar. */
  const askCommand = (request: string) => {
    const mine = ++seq.current
    setAsking(true)
    setAskError(null)
    ipc
      .aiAsk('command', request, cwd())
      .then((command) => {
        if (mine !== seq.current) return
        setText(command)
        setAtEnd(true)
        requestAnimationFrame(() => {
          inputRef.current?.focus()
          inputRef.current?.setSelectionRange(command.length, command.length)
        })
      })
      .catch((err) => mine === seq.current && setAskError(String(err)))
      .finally(() => mine === seq.current && setAsking(false))
  }

  const submit = () => {
    const value = text
    const request = naturalLanguageRequest(value)
    if (request) return askCommand(request)
    if (value.trim() && history.current[history.current.length - 1] !== value) history.current.push(value)
    // Alimenta a sugestão em cinza, com a pasta em que o comando vai rodar.
    rememberCommand(value, cwd())
    stored.current = loadCommands()
    nav.current = { cursor: history.current.length, draft: '' }
    closeList()
    setText('')
    onSubmit(value)
  }

  const go = (to: number) => {
    const list = history.current
    if (nav.current.cursor === list.length) nav.current.draft = text
    nav.current.cursor = to
    const next = to === list.length ? nav.current.draft : (list[to] ?? '')
    setText(next)
    setAtEnd(true)
    requestAnimationFrame(() => inputRef.current?.setSelectionRange(next.length, next.length))
  }

  /** Aceita a sugestão em cinza (tudo, ou só a próxima palavra) e põe o cursor no fim. */
  const acceptGhost = (all: boolean) => {
    const next = text + (all ? ghost : nextWord(ghost))
    setText(next)
    requestAnimationFrame(() => inputRef.current?.setSelectionRange(next.length, next.length))
  }

  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.nativeEvent.isComposing) return
    if (asking) {
      // Esc cancela o pedido à IA; o resto do teclado espera a resposta.
      if (e.key === 'Escape') {
        seq.current++
        setAsking(false)
      }
      e.preventDefault()
      return
    }
    const el = e.currentTarget
    const collapsed = el.selectionStart === el.selectionEnd
    const ctrl = e.ctrlKey && !e.altKey && !e.shiftKey
    const plain = !e.ctrlKey && !e.altKey && !e.shiftKey && !e.metaKey
    if (ghost && collapsed && el.selectionStart === text.length && (e.key === 'ArrowRight' || e.key === 'End')) {
      // → e End no fim da linha aceitam tudo; Ctrl+→ aceita uma palavra.
      if (plain) {
        e.preventDefault()
        acceptGhost(true)
        return
      }
      if (ctrl && e.key === 'ArrowRight') {
        e.preventDefault()
        acceptGhost(false)
        return
      }
    }
    if (cycle && plain && (e.key === 'ArrowUp' || e.key === 'ArrowDown') && cmdCycle.current) {
      // Com a lista aberta, ↑/↓ percorrem as opções em vez do histórico.
      e.preventDefault()
      const c = cmdCycle.current
      const step = e.key === 'ArrowDown' ? 1 : c.items.length - 1
      applyCommand({ ...c, i: (c.i + step) % c.items.length }, false)
      return
    }
    if (ctrl && e.key.toLowerCase() === 'r' && onSearchHistory) {
      e.preventDefault()
      onSearchHistory()
    } else if (e.key === 'Enter' && !e.shiftKey && !e.ctrlKey && !e.altKey) {
      e.preventDefault()
      submit()
    } else if (e.key === 'Tab' && !e.shiftKey && !e.ctrlKey && !e.altKey) {
      e.preventDefault()
      void complete()
    } else if (e.key === 'Escape') {
      e.preventDefault()
      if (items.length > 0 || cycle) closeList()
      else onEscape()
    } else if (
      e.key === 'ArrowUp' &&
      collapsed &&
      !e.altKey &&
      !e.shiftKey &&
      !text.slice(0, el.selectionStart).includes('\n')
    ) {
      if (nav.current.cursor > 0) {
        e.preventDefault()
        go(nav.current.cursor - 1)
      }
    } else if (
      e.key === 'ArrowDown' &&
      collapsed &&
      !e.altKey &&
      !e.shiftKey &&
      !text.slice(el.selectionEnd).includes('\n')
    ) {
      if (nav.current.cursor < history.current.length) {
        e.preventDefault()
        go(nav.current.cursor + 1)
      }
    } else if (ctrl && e.key.toLowerCase() === 'c' && collapsed) {
      // Sem seleção, limpa a caixa; com seleção o navegador copia.
      e.preventDefault()
      closeList()
      setText('')
      nav.current = { cursor: history.current.length, draft: '' }
    } else if (ctrl && e.key.toLowerCase() === 'l') {
      e.preventDefault()
      onClear()
    }
  }

  const shared =
    'm-0 min-h-[1.2em] whitespace-pre-wrap break-words [font:inherit] [letter-spacing:normal] [word-break:break-word]'

  return (
    <div
      ref={boxRef}
      inert={!open}
      data-input-editor={open ? 'open' : 'closed'}
      className={`z-4 flex items-start gap-2 rounded-lg border border-border bg-surface/70 px-3 py-2 backdrop-blur-sm focus-within:border-accent/50 ${
        open
          ? 'relative mt-2 translate-y-0 opacity-100 transition-[opacity,transform] duration-300 ease-spring motion-reduce:transition-none'
          : 'pointer-events-none absolute right-2 bottom-3 left-5 translate-y-2 opacity-0 transition-[opacity,transform] duration-150 ease-spring-soft motion-reduce:transition-none'
      }`}
      style={{ fontFamily, fontSize, lineHeight: 1.2 }}
    >
      <span
        aria-hidden
        className={`select-none ${asking ? 'animate-pulse text-claude motion-reduce:animate-none' : 'text-accent'}`}
      >
        {asking ? '✦' : '❯'}
      </span>
      <div className="relative min-w-0 flex-1">
        <pre aria-hidden className={`${shared} pointer-events-none`}>
          {tokens.map((t, i) => (
            // biome-ignore lint/suspicious/noArrayIndexKey: tokens são recalculados a cada digitação, sem identidade própria
            <span key={i} style={tokenStyle(t.type, theme)}>
              {t.text}
            </span>
          ))}
          {ghost && (
            <span data-ghost className="text-muted/70">
              {ghost}
            </span>
          )}
          {/* O último \n de um <pre> não ocupa linha sem um caractere depois dele. */}
          {'​'}
        </pre>
        <textarea
          ref={inputRef}
          value={text}
          rows={1}
          spellCheck={false}
          autoCapitalize="off"
          autoCorrect="off"
          aria-label="Comando"
          placeholder="Digite um comando, ou # e o que você quer fazer"
          readOnly={asking}
          className={`${shared} absolute inset-0 size-full resize-none overflow-hidden border-0 bg-transparent p-0 text-transparent caret-text outline-none selection:bg-accent/30 placeholder:text-muted`}
          onChange={(e) => {
            // Qualquer edição encerra o ciclo do Tab.
            completion.current = null
            cmdCycle.current = null
            seq.current++
            setText(e.target.value)
            setAtEnd(e.target.selectionStart === e.target.value.length)
            if (cycle) setCycle(null)
            if (askError) setAskError(null)
            if (items.length > 0) setItems([])
          }}
          onKeyDown={onKeyDown}
          onSelect={(e) => {
            const el = e.currentTarget
            setAtEnd(el.selectionStart === el.selectionEnd && el.selectionEnd === el.value.length)
          }}
        />
      </div>
      {(asking || askError) && (
        <span
          role="status"
          className="flex-none self-center font-sans text-[11.5px] text-muted"
          title={askError ?? undefined}
        >
          {asking ? 'Pedindo o comando ao Claude… (Esc cancela)' : 'Não consegui gerar o comando'}
        </span>
      )}
      {cycle && (
        <CompletionList
          items={cycle.items}
          active={cycle.i}
          bottom={listBottom}
          onPick={(i) => {
            const c = cmdCycle.current
            if (!c) return
            applyCommand({ ...c, i }, false)
            closeList()
            inputRef.current?.focus()
          }}
        />
      )}
      <PathSuggestions
        items={items}
        position={{ left: 0, bottom: listBottom }}
        onPick={(item) => {
          const c = completion.current
          const caret = inputRef.current?.selectionStart ?? text.length
          const start = c?.start ?? wordBefore(text, caret).start
          const end = c?.end ?? caret
          replaceRange(start, end, quoteIfNeeded(item.label))
          closeList()
          inputRef.current?.focus()
        }}
        onDismiss={() => {
          closeList()
          inputRef.current?.focus()
        }}
      />
    </div>
  )
}
