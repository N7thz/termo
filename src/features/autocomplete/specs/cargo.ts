import { cmd, flag } from './types'

const release = flag('--release -r', 'build otimizado')
const pkg = flag('--package -p', 'pacote do workspace', true)
const workspace = flag('--workspace', 'todos os pacotes')
const features = flag('--features -F', 'liga features', true)
const allFeatures = flag('--all-features', 'todas as features')
const targets = flag('--all-targets', 'todos os alvos')
const common = [release, pkg, features, allFeatures, flag('--target', 'plataforma', true)]

export const cargo = cmd('cargo', 'build e pacotes do Rust', {
  flags: [
    flag('--version -V', 'versão'),
    flag('--help -h', 'ajuda'),
    flag('--manifest-path', 'outro Cargo.toml', true),
    flag('--verbose -v', 'mais detalhes'),
    flag('--quiet -q', 'sem avisos'),
  ],
  subcommands: [
    cmd('build', 'compila', { aliases: ['b'], flags: [...common, workspace, targets] }),
    cmd('check', 'confere sem gerar binário', { aliases: ['c'], flags: [...common, workspace, targets] }),
    cmd('run', 'compila e roda', {
      aliases: ['r'],
      flags: [...common, flag('--bin', 'qual binário', true), flag('--example', 'qual exemplo', true)],
    }),
    cmd('test', 'roda os testes', {
      aliases: ['t'],
      flags: [...common, workspace, targets, flag('--lib', 'só a biblioteca'), flag('--no-run', 'só compila')],
    }),
    cmd('clippy', 'lints', { flags: [targets, workspace, pkg, allFeatures, flag('--fix', 'corrige')] }),
    cmd('fmt', 'formata', { flags: [flag('--check', 'só confere'), flag('--all', 'todos os pacotes')] }),
    cmd('doc', 'gera a documentação', {
      flags: [flag('--open', 'abre no navegador'), flag('--no-deps', 'só o projeto')],
    }),
    cmd('add', 'adiciona dependências', {
      flags: [flag('--dev', 'de desenvolvimento'), flag('--build', 'do build.rs'), features, pkg],
    }),
    cmd('remove', 'remove dependências', { flags: [flag('--dev', 'de desenvolvimento'), pkg] }),
    cmd('update', 'atualiza o Cargo.lock', { flags: [pkg, flag('--precise', 'versão exata', true)] }),
    cmd('new', 'cria um projeto', { flags: [flag('--lib', 'biblioteca'), flag('--bin', 'binário')] }),
    cmd('init', 'projeto na pasta atual', { flags: [flag('--lib', 'biblioteca'), flag('--bin', 'binário')] }),
    cmd('install', 'instala um binário', {
      flags: [
        flag('--path', 'de uma pasta', true),
        flag('--locked', 'usa o lockfile'),
        flag('--force -f', 'reinstala'),
      ],
    }),
    cmd('uninstall', 'remove um binário'),
    cmd('clean', 'apaga o target', { flags: [release, pkg] }),
    cmd('bench', 'benchmarks', { flags: common }),
    cmd('tree', 'árvore de dependências', {
      flags: [flag('--invert -i', 'quem usa', true), flag('--depth', 'nível', true)],
    }),
    cmd('search', 'busca no crates.io'),
    cmd('publish', 'publica', { flags: [flag('--dry-run', 'só simula'), pkg] }),
    cmd('metadata', 'dados do projeto em JSON'),
    cmd('fix', 'aplica as correções do compilador', { flags: [flag('--allow-dirty', 'com mudanças locais')] }),
  ],
})
