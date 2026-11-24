import { cmd, flag } from './types'

const force = flag('--force -f', 'força a operação')
const dryRun = flag('--dry-run -n', 'só mostra o que faria')
const all = flag('--all', 'todas as refs')
const abort = flag('--abort', 'cancela e volta ao estado anterior')
const cont = flag('--continue', 'continua depois de resolver os conflitos')
const noVerify = flag('--no-verify', 'pula os hooks')

export const git = cmd('git', 'controle de versão', {
  flags: [
    flag('-C', 'roda em outra pasta', true),
    flag('--no-pager', 'sem paginador'),
    flag('--version', 'versão do git'),
    flag('--help', 'ajuda'),
  ],
  subcommands: [
    cmd('status', 'estado da árvore de trabalho', {
      flags: [flag('--short -s', 'formato curto'), flag('--branch -b', 'mostra o branch')],
    }),
    cmd('add', 'prepara arquivos para o commit', {
      flags: [
        flag('--all -A', 'tudo, inclusive remoções'),
        flag('--patch -p', 'escolhe trecho a trecho'),
        flag('--update -u', 'só arquivos já versionados'),
        dryRun,
        force,
      ],
    }),
    cmd('commit', 'grava um commit', {
      flags: [
        flag('--message -m', 'mensagem do commit', true),
        flag('--all -a', 'inclui os arquivos alterados já versionados'),
        flag('--amend', 'refaz o último commit'),
        flag('--no-edit', 'mantém a mensagem'),
        flag('--fixup', 'correção de um commit', true),
        flag('--signoff -s', 'assina a mensagem'),
        noVerify,
      ],
    }),
    cmd('push', 'envia commits ao remoto', {
      flags: [
        flag('--set-upstream -u', 'define o branch remoto'),
        flag('--force-with-lease', 'força só se o remoto não mudou'),
        force,
        flag('--tags', 'envia as tags'),
        flag('--delete -d', 'apaga no remoto'),
        dryRun,
        noVerify,
      ],
    }),
    cmd('pull', 'traz e integra do remoto', {
      flags: [
        flag('--rebase', 'rebase em vez de merge'),
        flag('--ff-only', 'só avanço direto'),
        flag('--autostash', 'guarda e devolve as mudanças locais'),
      ],
    }),
    cmd('fetch', 'baixa do remoto sem integrar', {
      flags: [all, flag('--prune -p', 'remove refs que sumiram do remoto'), flag('--tags', 'traz as tags')],
    }),
    cmd('clone', 'copia um repositório', {
      flags: [
        flag('--depth', 'histórico raso', true),
        flag('--branch -b', 'branch inicial', true),
        flag('--recurse-submodules', 'com submódulos'),
      ],
    }),
    cmd('switch', 'troca de branch', {
      flags: [
        flag('--create -c', 'cria o branch', true),
        flag('--detach', 'HEAD solto'),
        flag('--discard-changes', 'descarta mudanças locais'),
      ],
    }),
    cmd('checkout', 'troca de branch ou restaura arquivos', {
      flags: [flag('-b', 'cria o branch', true), flag('--track', 'acompanha o remoto'), force],
    }),
    cmd('restore', 'restaura arquivos', {
      flags: [
        flag('--staged -S', 'tira da área de preparo'),
        flag('--source -s', 'de qual commit', true),
        flag('--worktree -W', 'na árvore de trabalho'),
      ],
    }),
    cmd('branch', 'lista e gerencia branches', {
      flags: [
        flag('--all -a', 'locais e remotos'),
        flag('--delete -d', 'apaga branch já integrado'),
        flag('-D', 'apaga mesmo sem integrar'),
        flag('--move -m', 'renomeia'),
        flag('-vv', 'com o remoto acompanhado'),
        flag('--show-current', 'só o branch atual'),
      ],
    }),
    cmd('merge', 'junta outro branch', {
      flags: [
        flag('--no-ff', 'sempre cria commit de merge'),
        flag('--ff-only', 'só avanço direto'),
        flag('--squash', 'junta tudo sem commit'),
        abort,
        cont,
      ],
    }),
    cmd('rebase', 'reaplica commits sobre outra base', {
      flags: [
        flag('--interactive -i', 'edita a lista de commits'),
        flag('--onto', 'nova base', true),
        flag('--autostash', 'guarda e devolve as mudanças locais'),
        flag('--skip', 'pula o commit atual'),
        abort,
        cont,
      ],
    }),
    cmd('log', 'histórico de commits', {
      flags: [
        flag('--oneline', 'uma linha por commit'),
        flag('--graph', 'desenha os branches'),
        flag('--stat', 'arquivos alterados'),
        flag('--patch -p', 'com o diff'),
        flag('--max-count -n', 'quantos commits', true),
        flag('--author', 'filtra por autor', true),
        flag('--since', 'a partir de uma data', true),
        all,
      ],
    }),
    cmd('diff', 'mostra diferenças', {
      flags: [
        flag('--staged --cached', 'o que está preparado'),
        flag('--stat', 'resumo por arquivo'),
        flag('--name-only', 'só os nomes'),
      ],
    }),
    cmd('show', 'mostra um commit', {
      flags: [flag('--stat', 'resumo por arquivo'), flag('--name-only', 'só os nomes')],
    }),
    cmd('stash', 'guarda mudanças de lado', {
      subcommands: [
        cmd('push', 'guarda', {
          flags: [
            flag('--message -m', 'descrição', true),
            flag('--include-untracked -u', 'com arquivos novos'),
            flag('--staged -S', 'só o preparado'),
          ],
        }),
        cmd('pop', 'devolve e apaga'),
        cmd('apply', 'devolve e mantém'),
        cmd('list', 'lista'),
        cmd('show', 'mostra o conteúdo', { flags: [flag('--patch -p', 'com o diff')] }),
        cmd('drop', 'apaga uma entrada'),
        cmd('clear', 'apaga todas'),
      ],
    }),
    cmd('reset', 'move o HEAD ou tira do preparo', {
      flags: [
        flag('--soft', 'mantém tudo preparado'),
        flag('--mixed', 'mantém os arquivos'),
        flag('--hard', 'descarta as mudanças'),
      ],
    }),
    cmd('revert', 'desfaz um commit com outro', { flags: [flag('--no-edit', 'mantém a mensagem'), abort, cont] }),
    cmd('cherry-pick', 'copia commits', {
      flags: [flag('-x', 'anota a origem'), flag('--no-commit -n', 'sem commit'), abort, cont],
    }),
    cmd('tag', 'lista e cria tags', {
      flags: [
        flag('--annotate -a', 'tag anotada'),
        flag('--message -m', 'mensagem', true),
        flag('--delete -d', 'apaga'),
        flag('--list -l', 'lista'),
      ],
    }),
    cmd('remote', 'repositórios remotos', {
      flags: [flag('--verbose -v', 'com as URLs')],
      subcommands: [
        cmd('add', 'adiciona'),
        cmd('remove', 'remove'),
        cmd('rename', 'renomeia'),
        cmd('set-url', 'troca a URL'),
        cmd('show', 'detalhes'),
        cmd('prune', 'limpa refs velhas'),
      ],
    }),
    cmd('worktree', 'várias árvores de trabalho', {
      subcommands: [
        cmd('add', 'cria', { flags: [flag('-b', 'cria o branch', true)] }),
        cmd('list', 'lista'),
        cmd('remove', 'remove', { flags: [force] }),
        cmd('prune', 'limpa as que sumiram'),
      ],
    }),
    cmd('init', 'cria um repositório', { flags: [flag('--initial-branch -b', 'nome do branch inicial', true)] }),
    cmd('clean', 'apaga arquivos não versionados', {
      flags: [force, dryRun, flag('-d', 'inclui pastas'), flag('-x', 'inclui ignorados')],
    }),
    cmd('blame', 'quem mudou cada linha', { flags: [flag('-L', 'faixa de linhas', true)] }),
    cmd('reflog', 'movimentos do HEAD'),
    cmd('bisect', 'acha o commit que quebrou', {
      subcommands: [
        cmd('start', 'começa'),
        cmd('good', 'este está bom'),
        cmd('bad', 'este está ruim'),
        cmd('reset', 'encerra'),
      ],
    }),
    cmd('config', 'configurações', {
      flags: [flag('--global', 'do usuário'), flag('--list -l', 'lista'), flag('--get', 'lê um valor')],
    }),
    cmd('submodule', 'submódulos', {
      subcommands: [
        cmd('add', 'adiciona'),
        cmd('update', 'atualiza', { flags: [flag('--init', 'inicia'), flag('--recursive', 'em cascata')] }),
        cmd('status', 'estado'),
      ],
    }),
  ],
})
