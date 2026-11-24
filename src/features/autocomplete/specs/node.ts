import { cmd, flag } from './types'

const help = flag('--help -h', 'ajuda')
const version = flag('--version -v', 'versão')

export const bun = cmd('bun', 'runtime e gerenciador de pacotes', {
  // `bun dev` também roda o script.
  scripts: true,
  flags: [
    help,
    version,
    flag('--watch', 'reinicia quando os arquivos mudam'),
    flag('--hot', 'recarrega sem reiniciar'),
    flag('--cwd', 'roda em outra pasta', true),
    flag('--filter', 'nos pacotes do workspace', true),
  ],
  subcommands: [
    cmd('run', 'roda um script ou arquivo', {
      scripts: true,
      flags: [flag('--if-present', 'sem erro se não existir')],
    }),
    cmd('install', 'instala as dependências', {
      aliases: ['i'],
      flags: [
        flag('--frozen-lockfile', 'sem alterar o lockfile'),
        flag('--production -p', 'sem devDependencies'),
        flag('--force -f', 'reinstala'),
      ],
    }),
    cmd('add', 'adiciona pacotes', {
      flags: [
        flag('--dev -d', 'em devDependencies'),
        flag('--exact -E', 'versão exata'),
        flag('--global -g', 'global'),
        flag('--optional', 'opcional'),
        flag('--peer', 'peerDependency'),
      ],
    }),
    cmd('remove', 'remove pacotes', { aliases: ['rm'], flags: [flag('--global -g', 'global')] }),
    cmd('update', 'atualiza pacotes', { flags: [flag('--latest', 'ignora a faixa de versão')] }),
    cmd('outdated', 'pacotes desatualizados'),
    cmd('audit', 'falhas conhecidas'),
    cmd('test', 'roda os testes', {
      flags: [
        flag('--watch', 'repete quando mudar'),
        flag('--coverage', 'cobertura'),
        flag('--test-name-pattern -t', 'filtra pelo nome', true),
        flag('--bail', 'para na primeira falha'),
        flag('--timeout', 'tempo por teste', true),
        flag('--update-snapshots -u', 'regrava os snapshots'),
      ],
    }),
    cmd('build', 'empacota', {
      flags: [
        flag('--outdir', 'pasta de saída', true),
        flag('--outfile', 'arquivo de saída', true),
        flag('--target', 'browser, bun ou node', true),
        flag('--minify', 'minifica'),
        flag('--compile', 'gera executável'),
        flag('--sourcemap', 'mapa de código'),
      ],
    }),
    cmd('x', 'executa um pacote'),
    cmd('create', 'cria projeto de um modelo'),
    cmd('init', 'cria um package.json', { flags: [flag('--yes -y', 'sem perguntas')] }),
    cmd('link', 'liga um pacote local'),
    cmd('unlink', 'desfaz o link'),
    cmd('publish', 'publica o pacote', { flags: [flag('--dry-run', 'só simula'), flag('--access', 'public', true)] }),
    cmd('pm', 'utilidades de pacotes', {
      subcommands: [
        cmd('ls', 'lista'),
        cmd('cache', 'cache'),
        cmd('pack', 'gera o .tgz'),
        cmd('trust', 'libera scripts'),
      ],
    }),
    cmd('why', 'quem depende do pacote'),
    cmd('upgrade', 'atualiza o Bun'),
  ],
})

export const npm = cmd('npm', 'gerenciador de pacotes do Node', {
  flags: [help, version, flag('--prefix', 'roda em outra pasta', true), flag('--workspace -w', 'no workspace', true)],
  subcommands: [
    cmd('run', 'roda um script', {
      aliases: ['run-script'],
      scripts: true,
      flags: [flag('--if-present', 'sem erro se não existir'), flag('--silent -s', 'sem avisos')],
    }),
    cmd('install', 'instala', {
      aliases: ['i', 'add'],
      flags: [
        flag('--save-dev -D', 'em devDependencies'),
        flag('--save-exact -E', 'versão exata'),
        flag('--global -g', 'global'),
        flag('--force -f', 'força'),
        flag('--legacy-peer-deps', 'ignora peerDependencies'),
      ],
    }),
    cmd('ci', 'instalação limpa pelo lockfile'),
    cmd('uninstall', 'remove', { aliases: ['rm', 'remove'], flags: [flag('--global -g', 'global')] }),
    cmd('update', 'atualiza', { flags: [flag('--global -g', 'global')] }),
    cmd('outdated', 'pacotes desatualizados'),
    cmd('test', 'roda o script test'),
    cmd('start', 'roda o script start'),
    cmd('init', 'cria um package.json', { flags: [flag('--yes -y', 'sem perguntas')] }),
    cmd('exec', 'executa um pacote', { flags: [flag('--yes -y', 'instala sem perguntar')] }),
    cmd('create', 'cria projeto de um modelo'),
    cmd('list', 'árvore de dependências', { aliases: ['ls'], flags: [flag('--depth', 'profundidade', true)] }),
    cmd('audit', 'falhas conhecidas', {
      subcommands: [cmd('fix', 'corrige o que der', { flags: [flag('--force -f', 'aceita quebras')] })],
    }),
    cmd('publish', 'publica', { flags: [flag('--dry-run', 'só simula'), flag('--access', 'public', true)] }),
    cmd('version', 'muda a versão', {
      subcommands: [cmd('patch', '0.0.x'), cmd('minor', '0.x.0'), cmd('major', 'x.0.0')],
    }),
    cmd('view', 'dados de um pacote'),
    cmd('link', 'liga um pacote local'),
    cmd('login', 'entra no registro'),
    cmd('cache', 'cache', { subcommands: [cmd('clean', 'limpa'), cmd('verify', 'confere')] }),
    cmd('config', 'configurações', { subcommands: [cmd('get', 'lê'), cmd('set', 'grava'), cmd('list', 'lista')] }),
  ],
})
