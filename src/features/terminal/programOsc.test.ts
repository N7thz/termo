import { expect, test } from 'bun:test'
import type { Terminal } from '@xterm/xterm'
import {
  attachProgramOsc,
  MAX_CLIPBOARD_BASE64,
  type Progress,
  parseOsc9,
  parseOsc52,
  parseOsc777,
  taskbarProgress,
} from './programOsc'

test('OSC 9;4: progresso, limites e fim', () => {
  expect(parseOsc9('4;1;42')).toEqual({ progress: { state: 'normal', value: 42 } })
  expect(parseOsc9('4;1;250')).toEqual({ progress: { state: 'normal', value: 100 } })
  expect(parseOsc9('4;2;10')).toEqual({ progress: { state: 'error', value: 10 } })
  expect(parseOsc9('4;3')).toEqual({ progress: { state: 'indeterminate', value: 0 } })
  expect(parseOsc9('4;4;70')).toEqual({ progress: { state: 'paused', value: 70 } })
  expect(parseOsc9('4;0;0')).toEqual({ progress: null })
  expect(parseOsc9('4')).toEqual({ progress: null })
  expect(parseOsc9('4;9;1')).toBeNull()
})

test('OSC 9: aviso de texto, mas não os comandos do ConEmu', () => {
  expect(parseOsc9('build pronto')).toEqual({ notice: 'build pronto' })
  expect(parseOsc9('3 testes falharam')).toEqual({ notice: '3 testes falharam' })
  expect(parseOsc9('9;"C:\\x"')).toBeNull()
  expect(parseOsc9('1;500')).toBeNull()
  expect(parseOsc9('12')).toBeNull()
  expect(parseOsc9('  \x07 ')).toBeNull()
  expect(parseOsc9('a\x1bb\nc')).toEqual({ notice: 'a b c' })
  expect((parseOsc9('x'.repeat(500)) as { notice: string }).notice).toHaveLength(240)
})

test('OSC 777;notify', () => {
  expect(parseOsc777('notify;Deploy;terminou; sem erros')).toEqual({ title: 'Deploy', body: 'terminou; sem erros' })
  expect(parseOsc777('notify;;só o texto')).toEqual({ title: '', body: 'só o texto' })
  expect(parseOsc777('notify;;')).toBeNull()
  expect(parseOsc777('preexec;x')).toBeNull()
})

test('OSC 52: copia texto UTF-8, nunca lê', () => {
  const b64 = (s: string) => btoa(String.fromCharCode(...new TextEncoder().encode(s)))
  expect(parseOsc52(`c;${b64('olá, ação')}`)).toBe('olá, ação')
  expect(parseOsc52(`;${b64('x')}`)).toBe('x')
  expect(parseOsc52('c;?')).toBeNull()
  expect(parseOsc52('c;')).toBeNull()
  expect(parseOsc52('c;não é base64!')).toBeNull()
  expect(parseOsc52(`z;${b64('x')}`)).toBeNull()
  expect(parseOsc52(`c;${'A'.repeat(MAX_CLIPBOARD_BASE64 + 4)}`)).toBeNull()
  expect(parseOsc52(`c;${btoa('\xff\xfe')}`)).toBeNull()
})

function fakeTerm() {
  const handlers = new Map<number, (data: string) => boolean>()
  const term = {
    parser: {
      registerOscHandler: (id: number, fn: (data: string) => boolean) => {
        handlers.set(id, fn)
        return { dispose: () => handlers.delete(id) }
      },
    },
  } as unknown as Terminal
  return { term, send: (id: number, data: string) => handlers.get(id)?.(data), handlers }
}

test('attachProgramOsc: opções, limite de avisos e dispose', () => {
  const { term, send, handlers } = fakeTerm()
  const got: string[] = []
  let allow = { clipboard: true, notifications: true }
  let t = 0
  const d = attachProgramOsc(
    term,
    {
      onProgress: (p) => got.push(`p:${p ? `${p.state}${p.value}` : 'fim'}`),
      onNotice: (title, body) => got.push(`n:${title}|${body}`),
      onCopy: (text) => got.push(`c:${text}`),
      allow: () => allow,
    },
    () => t,
  )
  send(9, '4;1;50')
  send(9, 'oi')
  t = 1000
  send(777, 'notify;T;ignorado pelo intervalo')
  t = 5000
  send(777, 'notify;T;B')
  send(52, `c;${btoa('abc')}`)
  allow = { clipboard: false, notifications: false }
  t = 20_000
  send(52, `c;${btoa('abc')}`)
  send(9, 'desligado')
  send(9, '4;0')
  expect(send(9, '9;C:\\')).toBe(false)
  expect(got).toEqual(['p:normal50', 'n:|oi', 'n:T|B', 'c:abc', 'p:fim'])
  d.dispose()
  expect(handlers.size).toBe(0)
})

test('barra de tarefas: a aba ativa, senão um erro, senão o primeiro', () => {
  const m = new Map<number, Progress>([
    [1, { state: 'normal', value: 10 }],
    [2, { state: 'error', value: 50 }],
  ])
  expect(taskbarProgress(m, 1)).toEqual({ state: 'normal', value: 10 })
  expect(taskbarProgress(m, 3)).toEqual({ state: 'error', value: 50 })
  expect(taskbarProgress(new Map([[4, { state: 'paused', value: 5 }]]), null)).toEqual({ state: 'paused', value: 5 })
  expect(taskbarProgress(new Map(), 1)).toBeNull()
})
