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
bun run release 0.2.0  # nova versão: atualiza os arquivos, commita e cria a tag v0.2.0
```

O executável aceita `--claude`, para abrir no Claude Code, e `--cwd <pasta>` ou uma pasta solta, para abrir nela. Com o Termo já aberto, a chamada vai para ele (instância única) e vira uma aba. Para a aba do Claude também valem `--title <nome>`, `--prompt-file <arquivo>` (primeira mensagem), `--close-on-exit` (fecha a aba quando o Claude sai) e `-- <argumentos do claude>`; é assim que o coord abre as sessões. O comando `termo` (abaixo) repassa essas flags ao app.

## Linha de comando: `termo`

O comando `termo` controla o Termo aberto, como o `code` do VS Code. Ele vem no instalador em `<instalação>\bin\termo.exe`; para usar em qualquer terminal, rode "Instalar o comando termo no PATH" na paleta (Ctrl+Shift+P) e abra um terminal novo. Se o Termo estiver fechado, o comando abre ele antes.

```
termo .                        aba nova nesta pasta (termo D:\projeto também)
termo open [pasta] --shell cmd aba nova com outro perfil (pwsh, cmd, git-bash, wsl:Ubuntu...)
termo split [pasta]            aba nova em tela dividida com a ativa
termo run bun dev              aba nova que roda o comando (--cwd <pasta>, --split)
termo claude [pasta] "texto"   aba do Claude Code; o texto vai como primeira mensagem
termo tabs [--json]            lista as abas (número, tipo, título, pasta; * = ativa)
termo title "API: testes"      dá nome à aba (sem --tab: a do próprio terminal; --clear volta ao automático)
termo nota --add "testes ok"   nota da aba (sem texto mostra; --add junta uma linha; --clear apaga)
termo send --tab 3 "git pull"  escreve na aba e tecla Enter (--no-enter só cola); --tab aceita número ou nome
termo focus [N] / close N      traz o Termo para a frente (e ativa a aba) / fecha a aba
```

Como funciona: ao abrir, o app escuta em 127.0.0.1 numa porta livre e grava a porta e um token em `%APPDATA%\dev.termo.app\control.json` (`src-tauri/src/control.rs`); o cliente (`cli/`, binário de console só com std e serde_json) manda os argumentos e a pasta atual e mostra a resposta. Os mesmos subcomandos também funcionam como `Termo.exe run ...`, pela instância única, só que sem resposta. `bun run build:cli` compila o cliente (o `tauri dev`/`build` já chama).

## Publicar uma versão

1. `bun run release 0.2.0`: a versão fica igual em `package.json`, `Cargo.toml`, `Cargo.lock` e `tauri.conf.json`; o script commita (`chore: versão 0.2.0`) e cria a tag `v0.2.0`. Recusa se houver mudança não commitada ou se a tag já existir
2. `git push && git push origin v0.2.0`
3. O workflow `release.yml` confere se a tag bate com a versão (`bun run release --check`), roda `bun run check`, compila o instalador e cria a release como **rascunho**, com as notas geradas pelos commits
4. Confira o rascunho no GitHub e publique. Só depois disso o atualizador dos usuários enxerga a versão nova

Segredos do repositório: `TAURI_SIGNING_PRIVATE_KEY` (conteúdo de `~/.tauri/termo.key`) e, se a chave tiver senha, `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`.

### Assinatura de código (SignPath)

Sem ela o Windows mostra o aviso do SmartScreen ("editor desconhecido") ao abrir o instalador. O workflow já está pronto e liga a assinatura sozinho quando a variável `SIGNPATH_ORGANIZATION_ID` existe; sem ela, a release sai como antes, sem assinatura de código.

1. Peça o plano gratuito para open source em [signpath.org](https://signpath.org) (o repositório precisa ser público e ter licença OSI, que a MIT é)
2. No SignPath: crie o projeto `termo` ligado a este repositório, com uma _artifact configuration_ que assina o `.exe` dentro do zip que o GitHub envia (`<zip-file><pe-file path="*.exe" /></zip-file>`), e a política de assinatura `release-signing`. Cadastre o GitHub como _trusted build system_
3. No GitHub (Settings → Secrets and variables → Actions): o segredo `SIGNPATH_API_TOKEN` (token de um usuário CI do SignPath, com permissão de enviar na política) e a variável `SIGNPATH_ORGANIZATION_ID`. Se o projeto ou a política tiverem outros nomes, as variáveis `SIGNPATH_PROJECT_SLUG` e `SIGNPATH_POLICY_SLUG`

Com a assinatura ligada, o instalador vai para o SignPath antes de gerar o `.sig` do atualizador (a assinatura de código muda os bytes do arquivo), e o `latest.json` sai de `scripts/updater-manifest.ts`.

### Logs

O Termo grava o log em `%LOCALAPPDATA%\dev.termo.app\logs\termo.log` (até 2 MB, mais um arquivo antigo). Pânicos no Rust entram lá com o backtrace; anexe o arquivo ao relatar um problema.

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
  features/code-review  painel de revisão: diff por arquivo, comentários e envio ao Claude
  features/claude-bar  barra da aba do Claude: modelo, esforço, permissões, comandos, anexos e uso
  features/folder-picker  menu do botão da pasta: escolher, subir, recentes e Explorador
  features/usage-battery  bateria do uso do Claude (5 h e semana)
  features/history-search  Ctrl+R: busca aproximada nos comandos da aba e no histórico do PSReadLine
  features/notifications  avisos do Windows: Claude terminou/pede permissão, comando longo
  features/scrollback  texto de cada aba guardado e devolvido ao reabrir
  features/updater   botão de versão nova na barra de título
  features/workflows  comandos salvos com `{{parâmetros}}`: formulário, escape para o PowerShell e gerenciador
  features/autocomplete  sugestão em cinza (histórico por pasta) e autocomplete de git/bun/npm/cargo/winget/docker
  features/layouts   layouts salvos (abas, grupos, divisões, pastas e comandos)
  features/broadcast  digitar em vários painéis
scripts/release.ts   versão numa fonte só e conferência da tag no workflow
scripts/updater-manifest.ts  latest.json do atualizador para o instalador assinado pelo SignPath
src-tauri/           backend (Rust)
  src/pty.rs         sessões ConPTY, saída em lotes, controle de vazão por ack
  src/shell.rs       shell, Claude Code, pasta inicial e linha de comando
  src/shells.rs      perfis de shell: detecção (pwsh, cmd, Git Bash, distros do WSL) e integração OSC por shell
  src/settings.rs    configurações validadas, com gravação atômica
  src/ai.rs          `claude -p` sem ferramentas, prompt pela entrada padrão
  src/usage.rs       limites do Claude e a linha de status de cada aba (modelo, esforço, contexto, custo)
  src/review.rs      arquivos alterados, diff, stage e descartar (caminhos validados)
  src/coord.rs       leitura do painel do coord (127.0.0.1:4747)
  src/control.rs     controle pela linha de comando: servidor local do `termo` (abrir aba, rodar, listar, mandar texto)
  src/window.rs      várias janelas (`termo-<n>`), cada uma com abas e painel próprios
  src/node.rs        versão do Node da aba e versões do fnm/nvm-windows/Volta
  src/images.rs      imagens citadas na saída dos blocos (prévia em `data:`, só arquivos de imagem)
  src/history.rs     histórico do PSReadLine (comandos de várias linhas juntados, sem repetição)
  src/notify.rs      avisos do Windows e piscar na barra de tarefas
  src/hotkey.rs      atalho global que mostra/minimiza o Termo
  src/updater.rs     atualização pelas releases do GitHub (assinada; instalar é um clique)
  src/logging.rs     log em arquivo (tauri-plugin-log) e registro de pânicos com backtrace
  src/ssh.rs         hosts do ~/.ssh/config para as abas SSH (sem curingas, nomes validados)
  src/export.rs      "Salvar como" dos blocos exportados (.txt, .md, PNG)
  resources/         conpty.dll e OpenConsole.exe (ConPTY moderno, copiados ao lado do .exe)
```

## O que já tem

- Abas: Ctrl+Shift+T abre, Ctrl+Shift+W fecha, Ctrl+Tab troca, clique do meio fecha. Fechar a última aba não fecha a janela: ela fica na tela vazia, com "Nova aba" e "Claude Code"
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
- Botão da pasta: escolher outra pasta no seletor do Windows, subir uma pasta, ir para uma pasta recente ou abrir no Explorador (a troca é um `Set-Location` no próprio shell)
- Barra da aba do Claude Code, no lugar da linha de contexto: modelo (`/model`), esforço (`/effort`), modo de permissão (o Shift+Tab do Claude), comandos rápidos (`/compact`, `/clear`, `/context`, `/usage`, `/resume`), pasta, branch, contexto usado e custo da sessão. Os dados vêm da linha de status que o Claude Code manda a cada resposta, gravada por aba. O menu de esforço segue o guia de modelo e esforço: "Padrão do modelo" (`/effort auto`) no topo, o nível padrão marcado e o ícone amarelo quando o esforço está abaixo do padrão do modelo
- Anexos no Claude: o botão Anexar escolhe vários arquivos ou pastas de uma vez e os põe na mensagem como `@menção` (imagens, PDF, notebooks, código e texto; caminho relativo à pasta da sessão, entre aspas quando tem espaço)
- Branches: trocar e criar (`git switch -c`, a partir da atual) pelo botão da branch
- Larguras ajustáveis: arraste a borda da lateral das abas, do painel de revisão ou do navegador. Na lateral e na revisão, as setas do teclado também ajustam e o duplo clique volta ao padrão. A largura fica guardada
- Lateral minimizável (Ctrl+Alt+B ou o botão no topo dela): uma faixa estreita só com os ícones das abas, que continua com arrastar, grupos e o menu da aba. Ctrl+Shift+B esconde a lateral inteira
- Abas na lateral: arrastar muda a ordem (as outras abrem espaço, como no Chrome) e entra ou sai de grupos; soltar sobre o terminal divide a tela. O menu da aba tem "Dividir a tela com" para juntar duas abas já abertas. O cabeçalho de cada grupo mostra quantos Claudes dele estão trabalhando e quantos esperam você, mesmo recolhido
- Navegação nos blocos: Ctrl+↑/↓ seleciona o bloco anterior/próximo e o destaca (Shift+↑/↓ estende para vários); com um bloco selecionado, Ctrl+C copia a saída, Ctrl+Shift+C o comando, Enter reabre o comando na linha do shell, `/` (ou Ctrl+Shift+L, ou o botão do funil) filtra a saída por texto ou regex, mostrando só as linhas que batem (a saída original não muda) e Esc sai
- Perfis de shell: o `+` tem uma seta com PowerShell 7, Windows PowerShell, cmd, Git Bash e as distros do WSL; o padrão vem de `defaultShell` (Configurações). A aba guarda o shell e a restauração reabre com ele. No WSL o bash recebe a integração por um `--rcfile` temporário (o `.bashrc` não é alterado) e a linha de contexto mostra só a pasta. O Git Bash (o `bin\bash.exe` do Git for Windows, achado pelas pastas de instalação ou pelo `git` do PATH) abre com a mesma integração, carregando antes o `/etc/profile` e o `~/.bash_profile` como um login faria; tem blocos, pasta e branch. No cmd há pasta e prompt, mas não blocos por comando (o cmd não expõe o comando nem o código de saída). A aba do Claude Code sempre usa o PowerShell
- Caixa de comando com highlight; `# o que você quer fazer` + Enter vira um comando do PowerShell (não executa sozinho)
- Ctrl+R busca no histórico: lista sobreposta com busca aproximada sobre os comandos da aba e o histórico do PSReadLine; Tab alterna "só nesta pasta"; Enter põe o comando na linha, Shift+Enter roda. Nas configurações dá para devolver o Ctrl+R ao shell
- Workflows (Ctrl+Shift+R ou a paleta, com o prefixo `workflow`): comandos salvos com `{{parâmetros}}` que viram um formulário; Enter põe na linha, Ctrl+Enter roda. Os valores entram literais (escape pelo contexto de aspas do PowerShell). Criar, editar, apagar e reordenar nas configurações, e "salvar como workflow" no bloco
- Avisos do Windows (com a janela sem foco): Claude terminou ou pede permissão, e comando que levou mais que N segundos (30 por padrão). O ícone da barra de tarefas pisca
- Atalho global (Configurações → Avisos e sistema): grava uma combinação como Alt+F12; de qualquer programa ela traz o Termo para a frente, e com ele na frente minimiza
- Modos do terminal com cara própria: PowerShell 7, Windows PowerShell, cmd, WSL, Git Bash e Claude Code têm ícone e tom do tema próprios na aba, na lateral, na paleta e na barra de status, e uma faixa fina no topo do terminal. A seta do `+`, o canto do botão Shell da lateral, a tela sem abas e a paleta ("Nova aba: <modo>") abrem uma aba em qualquer modo
- Imagens na entrada: colar uma imagem (print) ou arrastar arquivos para a janela põe o caminho na linha, entre aspas no formato do shell (a imagem colada vira um PNG em `%TEMP%	ermo-paste`), e mostra miniaturas acima da linha de comando (clique abre no visualizador; Enter limpa). Vale para a linha do terminal, a caixa estilo Warp e a aba do Claude Code, onde o Ctrl+V continua anexando pelo próprio Claude
- Imagem de fundo (como a extensão Background do VS Code): uma ou várias imagens atrás do texto do terminal ou por cima da janela, com opacidade, desfoque, ajuste e troca automática. Nas Configurações cada imagem da lista tem miniatura e um clique mostra a prévia com a opacidade, o desfoque e o ajuste escolhidos
- Configurações em tela própria, sobre o terminal: lateral com as seções (Geral, Terminal, Fonte, Imagem de fundo, Destaques, Avisos e sistema) e busca no cabeçalho (Ctrl+F, sem diferença de acento). Salva na hora; Esc limpa a busca e depois fecha
- Scripts do `package.json` na linha de contexto, como o NPM Scripts do VS Code: um clique roda `npm run`/`bun run`/`pnpm run`... com o gerenciador do projeto
- Modo bandeja (Configurações → Avisos e sistema): ícone na bandeja do Windows (clique mostra/esconde; menu com nova aba, Claude Code, nova janela e sair), fechar ou minimizar a janela principal manda para a bandeja com as abas rodando, iniciar com o Windows e, nesse caso, ficar só na bandeja
- Modo leve em segundo plano (Configurações → Avisos e sistema, ligado por padrão): minimizado ou na bandeja, o WebView2 vai para o modo de pouca memória e a memória ociosa do Termo, do WebView2 e dos processos das abas (shells, Claude) volta ao Windows, de novo a cada 5 min enquanto escondido. Nada é encerrado; ao voltar, a interface volta ao normal. A opção mostra quanto o Termo usa agora
- Reabrir as abas com o texto que tinham: o fim da saída de cada aba de shell (até 1000 linhas, com cores) é guardado a cada 10 s e volta ao reabrir, acima de um separador
- Atualização automática: ao abrir, procura versão nova nas releases do GitHub; um botão na barra de título instala e reinicia. Para publicar, veja [Publicar uma versão](#publicar-uma-versão)
- Painéis divididos (Ctrl+Shift+E) e várias janelas (Ctrl+Shift+N)
- Bateria do uso do Claude na barra de título, com mascote em pixel art. Os limites vêm do `statusLine` das abas do Claude (quem já tem um `statusLine` próprio continua com ele, e a bateria fica sem dados)
- Avatar de estado por aba do Claude (pensando, trabalhando, esperando, bloqueado, pronto), pelos hooks do Claude Code
- Revisão de código (Ctrl+Shift+G ou clique no +N −M): arquivos alterados com o diff (palavras alteradas em destaque, linhas longas quebradas ou rolagem lateral), índice de arquivos, recolher/expandir tudo, J/K para ir de arquivo em arquivo e N/P de trecho em trecho; stage por arquivo ou de tudo, descartar, abrir no editor, comentários por linha enviados ao Claude Code e "Revisar com o Claude". No rodapé, a caixa de commit: a mensagem pode ser escrita pelo Claude (`claude -p`, a partir do diff do stage e dos últimos commits) e "Commitar" commita só o que está no stage, com os hooks do repositório
- Sugestão enquanto digita (no editor de entrada): o resto do comando aparece em cinza, tirado dos comandos rodados naquela pasta (depois dos de qualquer pasta e do histórico do PSReadLine); → ou End aceitam tudo, Ctrl+→ uma palavra. Linhas que parecem ter senha ou token não são guardadas
- Autocomplete por comando (Tab no editor de entrada): subcomandos e flags de `git`, `bun`, `npm`, `cargo`, `winget` e `docker`, e os scripts do `package.json` da pasta depois de `bun run`/`npm run`; Tab ou ↑/↓ percorrem as opções
- Blocos para o Claude: com um ou vários blocos selecionados (Shift+↑/↓ estende a seleção), Ctrl+Enter ou o botão do balão cola comando, pasta, código de saída e saída numa aba do Claude Code, sem enviar, para você escrever a pergunta
- Exportar blocos (botão da seta ou E com blocos selecionados): copiar como Markdown (ou M direto), salvar como `.txt` ou como imagem PNG com a fonte e as cores do tema
- Aviso na aba: um comando de 10 s ou mais que termina numa aba escondida marca a aba com ✓ ou ✕ até você abri-la
- Erros clicáveis na saída: `arquivo:linha:coluna`, o `-->` do rustc, o `(linha,coluna)` do tsc e as pilhas do Node abrem no VS Code na posição certa
- Marcadores na barra de rolagem: linhas de erro e aviso, blocos que falharam e resultados da busca
- Layouts salvos: guarde as abas, grupos, divisões, pastas e um comando inicial por aba do perfil e abra tudo com um clique, pela seta do + ou pela paleta
- Digitar em vários painéis (Ctrl+Alt+I): o que você digita na aba vai também para as outras abas de shell do grupo, ou para o par da tela dividida, com indicação nas abas
- Abas SSH: os hosts do `~/.ssh/config` aparecem na seta do +, e abrem uma aba rodando `ssh <host>`, com cor própria
- Zoom do painel (Ctrl+Shift+Enter): maximiza o painel atual da tela dividida sem desfazer a divisão; o mesmo atalho volta
- Sessões do Claude Code (Ctrl+Shift+A ou o indicador na barra de título, com quantas estão trabalhando e esperando você): modelo e esforço, plano com as etapas e o tempo de cada uma, arquivos em edição e reservas (esquecer/liberar), abrir a sessão numa aba (`claude attach` ou `claude --resume`) e o histórico, lidos do painel do coord
- Nome nas abas: duplo clique na lateral ou "Renomear aba…" no menu; o Claude da aba também muda o nome com `termo title` para mostrar o que está fazendo (o Termo avisa o Claude disso ao abrir a sessão). O nome vale sobre o título automático, fica guardado com a sessão, aparece no `termo tabs` e serve de referência no `--tab` do `send`, `focus` e `close`
- Papéis para o Claude: os agentes de `.claude/agents` do projeto da aba ativa e de `~/.claude/agents` aparecem na seta do + como "Claude como <nome>" (com a descrição), e abrem uma aba com `claude --agent <nome>`, que usa as instruções e o modelo do agente. O do projeto vale sobre o de mesmo nome do usuário
- Claude Code numa cópia isolada (seta do + ou paleta): cria um `git worktree` na branch `termo/<tarefa>`, numa pasta ao lado do projeto (`<repo>.worktrees/<tarefa>`), e abre o Claude nela. A janela lista as cópias com commits e alterações pendentes, abre Claude ou shell nelas, junta na branch da pasta principal (merge, recusado com alterações não commitadas; conflito desfaz o merge) ou descarta (cópia, branch e commits), fechando antes as abas que estão dentro da cópia
- Central de avisos (sino na barra de título ou Ctrl+Shift+O, com as não lidas): histórico do Claude terminou ou pede permissão (pedidos pendentes no topo, até o Claude voltar a trabalhar), comandos longos que terminaram ou falharam (repetidos viram "×3") e sessões do coord que concluíram o plano. Agrupado por dia, até 200 avisos, guardado entre aberturas; clicar marca como lido e leva à aba ou à tela de Sessões. Os avisos do Windows continuam só com a janela sem foco
- Nota por aba: o Claude da aba registra progresso e decisões com `termo nota` (o contexto do Termo ensina a usar), a última linha aparece na lateral abaixo do nome e a nota inteira no tooltip; "Nota da aba…" no menu da aba lê e edita. Fica guardada com a sessão

## Roadmap

0. ~~Infraestrutura: Tauri, contrato de IPC, vazão, Biome, testes, CI, instalador~~
1. ~~Blocos por comando: integração OSC 133/633 com o PowerShell, cards com status, duração e copiar~~
2. ~~Editor de entrada com highlight e autocomplete~~
3. ~~Highlights na saída (caminhos, erros), temas e prévia de imagem nos blocos~~
4. ~~IA: linguagem natural vira comando, botão "explicar erro"~~
5. ~~Painéis divididos e várias janelas~~

6. ~~Próximas ideias: sugestão enquanto digita, autocomplete por comando, blocos para o Claude, layouts, digitar em vários painéis, SSH, avisos, zoom do painel e exportar blocos~~

## Licença

[MIT](LICENSE)
