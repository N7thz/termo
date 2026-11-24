#!/usr/bin/env bun
/**
 * Gera o `latest.json` do atualizador para um instalador já assinado (caminho com SignPath do release.yml).
 *
 *   bun scripts/updater-manifest.ts <instalador.exe> <tag>  > latest.json
 *
 * Lê `<instalador.exe>.sig` (de `tauri signer sign`) e aponta para o arquivo na release da tag.
 * O `.sig` precisa ser do instalador depois da assinatura de código: ela muda os bytes do arquivo.
 */
import { readFileSync } from 'node:fs'
import { basename } from 'node:path'

const REPO = 'N7thz/termo'

const [installer, tag] = process.argv.slice(2)
if (!installer || !tag) {
  console.error('uso: bun scripts/updater-manifest.ts <instalador.exe> <tag>')
  process.exit(1)
}

const signature = readFileSync(`${installer}.sig`, 'utf8').trim()
const url = `https://github.com/${REPO}/releases/download/${encodeURIComponent(tag)}/${encodeURIComponent(basename(installer))}`
const platform = { signature, url }

const manifest = {
  version: tag.replace(/^v/, ''),
  notes: `Veja as novidades em https://github.com/${REPO}/releases/tag/${tag}`,
  pub_date: new Date().toISOString(),
  // A mesma entrada com e sem o sufixo do instalador, como o tauri-action gera.
  platforms: { 'windows-x86_64': platform, 'windows-x86_64-nsis': platform },
}

console.log(JSON.stringify(manifest, null, 2))
