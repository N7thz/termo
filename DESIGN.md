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

## Open questions

- Referências: o que levar e o que evitar do Warp e do Dia.
- O que o Termo nunca deve parecer.
- Público além do autor (o app vai ser distribuído?).
