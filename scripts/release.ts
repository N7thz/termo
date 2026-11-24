#!/usr/bin/env bun
/**
 * Versão do Termo numa fonte só.
 *
 *   bun run release 0.2.0        atualiza package.json, Cargo.toml, Cargo.lock e tauri.conf.json,
 *                                commita ("chore: versão 0.2.0") e cria a tag v0.2.0 (sem push)
 *   bun run release --check v0.2.0   só confere se a tag bate com as três versões (usado pelo release.yml)
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const root = join(import.meta.dir, '..')
const files = {
  pkg: join(root, 'package.json'),
  cargo: join(root, 'src-tauri', 'Cargo.toml'),
  lock: join(root, 'src-tauri', 'Cargo.lock'),
  tauri: join(root, 'src-tauri', 'tauri.conf.json'),
}

const SEMVER = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/
// A primeira linha `version = "..."` do Cargo.toml é a do [package].
const CARGO_VERSION = /^version = "([^"]+)"/m
const LOCK_VERSION = /(\[\[package\]\]\r?\nname = "termo"\r?\nversion = ")([^"]+)(")/

function fail(message: string): never {
  console.error(`release: ${message}`)
  process.exit(1)
}

function read(path: string): string {
  return readFileSync(path, 'utf8')
}

function currentVersions(): Record<string, string> {
  return {
    'package.json': JSON.parse(read(files.pkg)).version,
    'Cargo.toml': read(files.cargo).match(CARGO_VERSION)?.[1] ?? '?',
    'tauri.conf.json': JSON.parse(read(files.tauri)).version,
  }
}

function check(tag: string): void {
  const wanted = tag.replace(/^refs\/tags\//, '').replace(/^v/, '')
  const versions = currentVersions()
  const wrong = Object.entries(versions).filter(([, v]) => v !== wanted)
  if (wrong.length > 0) {
    fail(
      `a tag ${tag} não bate com a versão do código (${wrong.map(([f, v]) => `${f}: ${v}`).join(', ')}). ` +
        `Crie a tag com \`bun run release ${wanted}\`.`,
    )
  }
  console.log(`release: tag ${tag} confere com a versão ${wanted}.`)
}

function git(...args: string[]): string {
  const r = Bun.spawnSync(['git', ...args], { cwd: root, stderr: 'pipe' })
  if (r.exitCode !== 0) fail(`git ${args.join(' ')}: ${r.stderr.toString().trim()}`)
  return r.stdout.toString().trim()
}

/** Troca só o número da versão, sem reformatar o JSON (mantém a ordem e o estilo do arquivo). */
function setJsonVersion(path: string, version: string): void {
  const text = read(path)
  const next = text.replace(/("version"\s*:\s*")[^"]+(")/, `$1${version}$2`)
  if (next === text && JSON.parse(text).version !== version) fail(`não achei "version" em ${path}`)
  writeFileSync(path, next)
}

function bump(version: string): void {
  if (!SEMVER.test(version)) fail(`versão inválida: ${version} (use algo como 0.2.0)`)
  const tag = `v${version}`

  if (git('status', '--porcelain', '--untracked-files=no') !== '') {
    fail('há mudanças não commitadas; commite ou guarde antes de criar a versão.')
  }
  if (git('tag', '--list', tag) !== '') fail(`a tag ${tag} já existe.`)

  setJsonVersion(files.pkg, version)
  setJsonVersion(files.tauri, version)

  const cargo = read(files.cargo)
  if (!CARGO_VERSION.test(cargo)) fail('não achei a versão no Cargo.toml')
  writeFileSync(files.cargo, cargo.replace(CARGO_VERSION, `version = "${version}"`))

  const lock = read(files.lock)
  if (!LOCK_VERSION.test(lock)) fail('não achei o pacote termo no Cargo.lock')
  writeFileSync(files.lock, lock.replace(LOCK_VERSION, `$1${version}$3`))

  git('add', files.pkg, files.tauri, files.cargo, files.lock)
  git('commit', '-m', `chore: versão ${version}`)
  git('tag', '-a', tag, '-m', `Termo ${version}`)

  console.log(`release: versão ${version} commitada e tag ${tag} criada.`)
  console.log(`Para publicar: git push && git push origin ${tag}`)
}

const args = process.argv.slice(2)
if (args[0] === '--check') {
  if (!args[1]) fail('uso: bun run release --check <tag>')
  check(args[1])
} else if (args.length === 1) {
  bump(args[0])
} else {
  fail('uso: bun run release <versão>   (ex.: bun run release 0.2.0)')
}
