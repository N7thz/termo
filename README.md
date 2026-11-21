# Termo

Terminal para Windows inspirado no Warp. Feito com Tauri 2 (backend em Rust), React, xterm.js e portable-pty.

## Requisitos

- Bun 1.3+
- Rust stable (MSVC) e as Build Tools do Visual Studio
- WebView2, que já vem no Windows 10/11 atualizado
- PowerShell 7 é opcional (`winget install Microsoft.PowerShell`). Sem ele, o app usa o Windows PowerShell 5.1

## Rodar

```powershell
bun install
bun run dev          # app em modo desenvolvimento
bun run dev:claude   # já abre na aba do Claude Code
bun run build        # instalador NSIS em src-tauri/target/release/bundle/nsis
bun run check        # typecheck, Biome e testes (bun test + cargo test)
```

O executável aceita `--claude`, para abrir no Claude Code, e `--cwd <pasta>` ou uma pasta solta, para abrir nela.

## Estrutura

```
src/                 frontend (React + xterm.js)
  lib/ipc.ts         contrato tipado com o Rust: toda chamada ao backend passa por aqui
  shared/            tipos e regras compartilhadas (configurações)
  features/tabs      abas (reducer testado) e atalhos
  features/terminal  TerminalView: xterm, addons, copiar/colar, vazão
  features/settings  painel de configurações
src-tauri/           backend (Rust)
  src/pty.rs         sessões ConPTY, saída em lotes, controle de vazão por ack
  src/shell.rs       shell, Claude Code, pasta inicial e linha de comando
  src/settings.rs    configurações validadas, com gravação atômica
  resources/         conpty.dll e OpenConsole.exe (ConPTY moderno, copiados ao lado do .exe)
```

## O que já tem

- Abas: Ctrl+Shift+T abre, Ctrl+Shift+W fecha, Ctrl+Tab troca, clique do meio fecha
- Aba do Claude Code: botão ✦ Claude, Ctrl+Shift+K ou a opção "Abrir o terminal já no Claude Code". O executável do Claude é procurado no PATH (`.exe`/`.cmd`, nunca o `.ps1`). Sem Claude instalado, a aba vira shell e mostra um aviso
- Ligaduras com a JetBrains Mono embutida. Ela é webfont, então o addon usa o conjunto padrão de ligaduras comuns (`=> != === <= ->` etc.)
- Imagens via Sixel (`chafa -f sixel`) e protocolo do iTerm2 (`imgcat`), com ConPTY moderno embutido
- Links abrem no navegador (só http/https, validado no Rust)
- Copiar e colar pela área de transferência do sistema. Ctrl+V com imagem copiada é repassado ao Claude Code
- Controle de vazão: saídas enormes não travam a interface
- Sem shells órfãos: recarregar ou fechar a janela encerra os processos dela

## Roadmap

0. ~~Infraestrutura: Tauri, contrato de IPC, vazão, Biome, testes, CI, instalador~~
1. Blocos por comando: integração OSC 133/633 com o PowerShell, cards com status, duração e copiar
2. Editor de entrada com highlight e autocomplete
3. Highlights na saída (caminhos, erros), prévia de imagem nos blocos e temas
4. IA: linguagem natural vira comando, botão "explicar erro"
5. Painéis divididos e várias janelas

### Ideias registradas

- **Bateria do uso semanal do Claude:** uma bateria em pixel art com o limite semanal e a janela de 5h, com um mascote que muda de estado conforme o nível. Referência: plugin usage-battery. Fonte de dados a verificar: o JSON do statusLine do Claude Code (`rate_limits`) ou os logs em `~/.claude/projects`
- **Avatar de estado por aba:** com a biblioteca open-bot-avatar (MIT), mostrar thinking, working, waiting, blocked ou done para o Claude Code de cada aba, alimentado pelos hooks do Claude Code (UserPromptSubmit, PreToolUse, PostToolUse, Notification, Stop) escrevendo num arquivo ou socket que o app observa
