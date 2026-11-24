import { type Command, cmd, flag } from './types'

const all = flag('--all -a', 'todos')
const force = flag('--force -f', 'sem perguntar')
const follow = flag('--follow -f', 'acompanha')

const run = [
  flag('--detach -d', 'em segundo plano'),
  flag('--interactive -i', 'mantém a entrada aberta'),
  flag('--tty -t', 'aloca um terminal'),
  flag('-it', 'interativo com terminal'),
  flag('--rm', 'apaga ao sair'),
  flag('--name', 'nome do container', true),
  flag('--publish -p', 'porta host:container', true),
  flag('--volume -v', 'volume host:container', true),
  flag('--env -e', 'variável de ambiente', true),
  flag('--env-file', 'arquivo de variáveis', true),
  flag('--network', 'rede', true),
]
const build = [
  flag('--tag -t', 'nome:versão da imagem', true),
  flag('--file -f', 'outro Dockerfile', true),
  flag('--build-arg', 'argumento do build', true),
  flag('--no-cache', 'sem cache'),
  flag('--target', 'estágio', true),
  flag('--platform', 'plataforma', true),
]
const logs = [follow, flag('--tail -n', 'últimas linhas', true), flag('--timestamps -t', 'com horário')]
const exec = [
  flag('-it', 'interativo com terminal'),
  flag('--env -e', 'variável', true),
  flag('--user -u', 'usuário', true),
]

const manage = (names: Array<[string, string]>): Command[] => names.map(([n, d]) => cmd(n, d))

export const docker = cmd('docker', 'containers', {
  flags: [flag('--version -v', 'versão'), flag('--help', 'ajuda'), flag('--context -c', 'contexto', true)],
  subcommands: [
    cmd('ps', 'containers em execução', {
      flags: [all, flag('--quiet -q', 'só os ids'), flag('--filter -f', 'filtro', true)],
    }),
    cmd('run', 'cria e inicia um container', { flags: run }),
    cmd('exec', 'roda um comando num container', { flags: exec }),
    cmd('logs', 'saída de um container', { flags: logs }),
    cmd('build', 'constrói uma imagem', { flags: build }),
    cmd('images', 'imagens locais', { flags: [all, flag('--quiet -q', 'só os ids')] }),
    cmd('pull', 'baixa uma imagem'),
    cmd('push', 'envia uma imagem'),
    cmd('start', 'inicia containers'),
    cmd('stop', 'para containers'),
    cmd('restart', 'reinicia containers'),
    cmd('rm', 'apaga containers', { flags: [force, flag('--volumes -v', 'com os volumes')] }),
    cmd('rmi', 'apaga imagens', { flags: [force] }),
    cmd('inspect', 'detalhes em JSON'),
    cmd('cp', 'copia arquivos'),
    cmd('tag', 'dá outro nome à imagem'),
    cmd('login', 'entra no registro', { flags: [flag('--username -u', 'usuário', true)] }),
    cmd('stats', 'uso de recursos', { flags: [all, flag('--no-stream', 'uma leitura só')] }),
    cmd('compose', 'vários containers', {
      flags: [flag('--file -f', 'outro compose', true), flag('--project-name -p', 'nome do projeto', true)],
      subcommands: [
        cmd('up', 'sobe os serviços', {
          flags: [
            flag('--detach -d', 'em segundo plano'),
            flag('--build', 'reconstrói'),
            flag('--force-recreate', 'recria'),
          ],
        }),
        cmd('down', 'derruba os serviços', {
          flags: [flag('--volumes -v', 'apaga os volumes'), flag('--remove-orphans', 'remove órfãos')],
        }),
        cmd('ps', 'serviços em execução', { flags: [all] }),
        cmd('logs', 'saída dos serviços', { flags: logs }),
        cmd('exec', 'comando num serviço', { flags: exec }),
        cmd('run', 'comando avulso', { flags: run }),
        cmd('build', 'constrói as imagens', { flags: [flag('--no-cache', 'sem cache')] }),
        ...manage([
          ['pull', 'baixa as imagens'],
          ['restart', 'reinicia'],
          ['stop', 'para'],
          ['start', 'inicia'],
          ['config', 'mostra o compose final'],
        ]),
      ],
    }),
    cmd('container', 'gerencia containers', {
      subcommands: manage([
        ['ls', 'lista'],
        ['prune', 'apaga os parados'],
        ['rm', 'apaga'],
        ['inspect', 'detalhes'],
      ]),
    }),
    cmd('image', 'gerencia imagens', {
      subcommands: manage([
        ['ls', 'lista'],
        ['prune', 'apaga as sem uso'],
        ['rm', 'apaga'],
        ['inspect', 'detalhes'],
      ]),
    }),
    cmd('volume', 'volumes', {
      subcommands: manage([
        ['ls', 'lista'],
        ['create', 'cria'],
        ['rm', 'apaga'],
        ['prune', 'apaga os sem uso'],
        ['inspect', 'detalhes'],
      ]),
    }),
    cmd('network', 'redes', {
      subcommands: manage([
        ['ls', 'lista'],
        ['create', 'cria'],
        ['rm', 'apaga'],
        ['inspect', 'detalhes'],
      ]),
    }),
    cmd('system', 'o Docker em si', {
      subcommands: [
        cmd('df', 'uso de disco'),
        cmd('prune', 'limpa o que não é usado', { flags: [all, force, flag('--volumes', 'inclui volumes')] }),
      ],
    }),
  ],
})
