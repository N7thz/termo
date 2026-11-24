import { cmd, flag } from './types'

const id = flag('--id', 'identificador do pacote', true)
const exact = flag('--exact -e', 'correspondência exata')
const source = flag('--source -s', 'winget ou msstore', true)
const silent = flag('--silent -h', 'sem janelas')
const version = flag('--version -v', 'versão específica', true)
const accept = [
  flag('--accept-package-agreements', 'aceita a licença do pacote'),
  flag('--accept-source-agreements', 'aceita os termos da fonte'),
]

export const winget = cmd('winget', 'gerenciador de pacotes do Windows', {
  flags: [flag('--version -v', 'versão do winget'), flag('--info', 'detalhes'), flag('--help -?', 'ajuda')],
  subcommands: [
    cmd('install', 'instala', {
      aliases: ['add'],
      flags: [id, exact, source, version, silent, flag('--interactive -i', 'com o instalador'), ...accept],
    }),
    cmd('upgrade', 'atualiza', {
      aliases: ['update'],
      flags: [
        flag('--all -r --recurse', 'todos'),
        id,
        exact,
        silent,
        flag('--include-unknown', 'sem versão'),
        ...accept,
      ],
    }),
    cmd('uninstall', 'remove', { aliases: ['remove', 'rm'], flags: [id, exact, silent, version] }),
    cmd('search', 'procura pacotes', { aliases: ['find'], flags: [id, exact, source, flag('--tag', 'por tag', true)] }),
    cmd('list', 'instalados', {
      aliases: ['ls'],
      flags: [id, exact, source, flag('--upgrade-available', 'com update')],
    }),
    cmd('show', 'detalhes de um pacote', { flags: [id, exact, source, flag('--versions', 'versões disponíveis')] }),
    cmd('source', 'fontes de pacotes', {
      subcommands: [cmd('list', 'lista'), cmd('update', 'atualiza'), cmd('add', 'adiciona'), cmd('reset', 'restaura')],
    }),
    cmd('pin', 'trava versões', {
      subcommands: [cmd('add', 'trava'), cmd('list', 'lista'), cmd('remove', 'destrava'), cmd('reset', 'limpa')],
    }),
    cmd('export', 'salva a lista de instalados', { flags: [flag('--output -o', 'arquivo', true)] }),
    cmd('import', 'instala de uma lista', { flags: [flag('--import-file -i', 'arquivo', true), ...accept] }),
    cmd('settings', 'abre as configurações'),
    cmd('configure', 'aplica uma configuração', { flags: [flag('--file -f', 'arquivo', true)] }),
    cmd('download', 'baixa o instalador', { flags: [id, exact, version] }),
  ],
})
