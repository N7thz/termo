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
  features/blocks    blocos por comando (OSC 133/633): status, duração, copiar e explicar erro
  features/input     caixa de comando com highlight, histórico e Tab
  features/ai        IA pelo `claude -p`: explicar erro e `#` linguagem natural → comando
  features/sessions  sessões do Claude Code (painel do coord)
  features/usage-battery  bateria do uso do Claude (5 h e semana)
src-tauri/           backend (Rust)
  src/pty.rs         sessões ConPTY, saída em lotes, controle de vazão por ack
  src/shell.rs       shell, Claude Code, pasta inicial e linha de comando
  src/settings.rs    configurações validadas, com gravação atômica
  src/ai.rs          `claude -p` sem ferramentas, prompt pela entrada padrão
  src/usage.rs       limites do Claude lidos do `statusLine` das abas do Claude
  src/coord.rs       leitura do painel do coord (127.0.0.1:4747)
  src/window.rs      várias janelas (`termo-<n>`), cada uma com abas e painel próprios
  src/node.rs        versão do Node da aba e versões do fnm/nvm-windows/Volta
  src/images.rs      imagens citadas na saída dos blocos (prévia em `data:`, só arquivos de imagem)
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
- Blocos por comando: barra verde ou vermelha na margem, duração, copiar o comando ou a saída e "explicar o erro" com o Claude, que sugere a correção pronta para rodar
- Prévia de imagem nos blocos: se o comando ou a saída citam imagens que existem (`ls` numa pasta com PNGs, `magick a.jpg b.png`), o bloco ganha o botão com as miniaturas; o clique abre no visualizador do Windows
- Linha de contexto acima da entrada, como a do Warp: versão do Node (em projetos com `package.json`, avisando quando o `.nvmrc`/`.node-version` pede outra), pasta e branch. A versão troca pelo fnm (por aba), nvm-windows ou Volta; o Termo ativa o fnm sozinho se o $PROFILE não fizer isso
- Branches: trocar e criar (`git switch -c`, a partir da atual) pelo botão da branch
- Abas na lateral: arrastar muda a ordem (as outras abrem espaço, como no Chrome) e entra ou sai de grupos; soltar sobre o terminal divide a tela. O menu da aba tem "Dividir a tela com" para juntar duas abas já abertas
- Caixa de comando com highlight; `# o que você quer fazer` + Enter vira um comando do PowerShell (não executa sozinho)
- Painéis divididos (Ctrl+Shift+E) e várias janelas (Ctrl+Shift+N)
- Bateria do uso do Claude na barra de título, com mascote em pixel art. Os limites vêm do `statusLine` das abas do Claude (quem já tem um `statusLine` próprio continua com ele, e a bateria fica sem dados)
- Avatar de estado por aba do Claude (pensando, trabalhando, esperando, bloqueado, pronto), pelos hooks do Claude Code
- Sessões do Claude Code (Ctrl+Shift+A): quem está trabalhando ou esperando, plano, progresso e reservas, lidos do painel do coord

## Roadmap

0. ~~Infraestrutura: Tauri, contrato de IPC, vazão, Biome, testes, CI, instalador~~
1. ~~Blocos por comando: integração OSC 133/633 com o PowerShell, cards com status, duração e copiar~~
2. ~~Editor de entrada com highlight e autocomplete~~
3. ~~Highlights na saída (caminhos, erros), temas e prévia de imagem nos blocos~~
4. ~~IA: linguagem natural vira comando, botão "explicar erro"~~
5. ~~Painéis divididos e várias janelas~~
