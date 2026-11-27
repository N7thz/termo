# Termo: brief de design

Versão mínima, escrita a partir do código e do README em 2026-11-23 (a entrevista foi pulada).
O que não foi confirmado pelo usuário está marcado "(assumed)" ou em Open questions.

## Product

Terminal para Windows inspirado no Warp, em Tauri 2 + React + xterm.js. Abas e perfis numa lateral no
estilo do Dia, blocos por comando, IA pelo Claude Code e uma aba dedicada ao Claude Code.

## Audience and voice

- Desenvolvedor que passa o dia no terminal e no Claude Code, no Windows (o próprio autor).
- Interface e textos em português do Brasil, frases curtas e diretas, sem jargão de marketing.

## Mood

Calmo e denso, como um app nativo: materiais translúcidos, cantos arredondados, sombras suaves,
movimento com mola e respeito a "reduzir movimento". A cor aparece pouco e significa algo
(estado, tipo de aba, perfil). (assumed: deduzido das classes e do README)

## Brand

- Design system source: `src/tailwind.css` (tokens `--bg`, `--surface`, `--text`, `--muted`, `--accent`,
  `--claude`, materiais e sombras) e `src/lib/ui.ts` (botões, tooltips, menus).
- Todas as cores vêm do tema escolhido (`src/features/theme`), incluindo os tons `--tone-*` derivados
  das cores ANSI do terminal. Nunca hex fixo em componente.
- Tipografia: Segoe UI Variable na interface, JetBrains Mono no terminal.
- Ícones: lucide-react, mais o ícone próprio do Claude.

## References

- Warp: blocos por comando, linha de contexto, caixa de entrada. (assumed: o que levar e o que evitar
  não foi perguntado)
- Dia / Arc: lateral com perfis, grupos e abas fixadas.

## Constraints

- Windows 10/11, WebView2. `html` em 16px (1rem = 16px), tamanho da interface por zoom do webview.
- Temas claros e escuros; contraste alto e transparência reduzida respeitados.

## Decisions log

- 2026-11-23: entrevista de setup pulada pelo usuário; brief escrito a partir do código.
- 2026-11-23: sem ferramenta de design; o código é a fonte do design system (import não se aplica).
- 2026-11-23: modos do terminal (PowerShell 7, Windows PowerShell, cmd, WSL, Claude Code) se distinguem
  por ícone + tom do tema, na aba, na lateral, nos menus e numa faixa fina no topo do terminal.
- 2026-11-23: imagens na entrada do terminal (linha do xterm e caixa estilo Warp): colar ou arrastar põe o
  caminho na linha, entre aspas no formato do shell (imagem copiada vira PNG em %TEMP%\termo-paste), e
  mostra uma faixa de miniaturas acima da linha de comando; Enter limpa a faixa. No Claude Code o Ctrl+V
  continua anexando pelo próprio Claude, agora com a miniatura. Arrastar solta na aba com foco.
- 2026-11-24: Configurações saíram do popover de 320px e viraram tela própria sobre o terminal (como Temas
  e Sessões): lateral com as seções (Geral, Terminal, Fonte, Imagem de fundo, Destaques, Avisos e sistema)
  que acompanha a rolagem, conteúdo em cartões de até 680px e busca no cabeçalho (Ctrl+F, sem acento,
  com "Nada encontrado" + Limpar). Escolhido pelo usuário: lateral + conteúdo, com busca. Salva na hora;
  o cabeçalho mostra "Salvo" por ~2 s ou "Não deu para salvar · Tentar de novo". Esc limpa a busca e depois
  fecha. Temas abre por cima e volta para a tela. Abaixo de 768px a lateral some e fica a busca.
- 2026-11-25: central de avisos própria: sino na barra de título (ao lado de Sessões) com o número de não
  lidas ao lado do ícone, no mesmo padrão do indicador de Sessões (amarelo do tema com permissão pendente).
  Painel suspenso de 380px, não tela inteira, porque aviso se olha rápido. Pedidos de permissão pendentes
  ficam no topo; o resto por dia. Registra mesmo com o Termo em foco; das sessões do coord, só "concluiu o
  plano" e "terminou/falhou" (segundo plano), para não virar ruído. Aprovado pelo usuário.
- 2026-11-25: worktree e nota por aba entram nos padrões existentes: janela de diálogo como a de Layouts, item
  no menu da seta do +; a nota é uma terceira linha no cartão da aba (ícone de nota + última linha).
- 2026-11-26: tela de carregamento da janela (`#boot` no index.html + public/boot.js, some por `bootDone()`
  quando as configurações e a sessão chegam). Ícone + "Termo" com cursor piscando no `--accent`, entrada com
  fade subindo; barra fina só após 400 ms (abertura rápida não pisca nada); após 8 s, "Está demorando mais que o
  normal" + Fechar. A camada toda arrasta a janela. Cores do último tema guardadas (localStorage para a página,
  arquivo `window-color` para a janela nativa pelo Rust), porque o tema só é conhecido depois que o JS carrega.
  Reduzir movimento: sem animação. Aprovado pelo usuário, que pediu a animação.
- 2026-11-26: brilho do tema atrás do terminal (escolhido: "brilho suave", com chave e intensidade). Dois halos
  radiais parados: `--accent` no alto à esquerda e um tom ANSI (magenta, ou ciano/azul se o magenta for quase o
  destaque) embaixo à direita, sobre o fundo do terminal; um por cartão. Pico de 30% (escuro) / 18% (claro) em
  100%, padrão ligado em 50%, ajuste 10–100% em Configurações › Imagem de fundo › "Brilho do tema". Some quando
  há imagem atrás do terminal; com contraste alto ou transparência reduzida fica só a cor lisa. O xterm fica
  transparente mantendo o RGB do fundo (`#rrggbb00`), para o contraste mínimo calcular contra a cor certa.
- 2026-11-26: o brilho saiu de dentro do terminal e foi para as bordas da janela (pedido do usuário; escolhido
  "moldura da janela"). Fica na moldura (`-z-1` na raiz, `isolate`), atrás da lateral, da barra e das frestas; o
  cartão do terminal voltou a ser liso e opaco. Halos: destaque no alto ao longo da barra, tom ANSI embaixo à
  esquerda (o canto de baixo à direita fica escondido pelo cartão). Pico claro subiu para 24%. Convive com a
  imagem de fundo.

## Open questions

- Referências: o que levar e o que evitar do Warp e do Dia.
- O que o Termo nunca deve parecer.
- Público além do autor (o app vai ser distribuído?).
