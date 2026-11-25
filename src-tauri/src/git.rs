//! Estado do git de uma pasta para a barra de status, a lateral e o diff no topo:
//! branch, à frente/atrás do remoto e linhas adicionadas/removidas ainda não commitadas.

use std::path::Path;
use std::process::Command;

use serde::Serialize;

#[derive(Debug, Default, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GitInfo {
    /// Nome da branch; `None` com HEAD destacado (aí vale `commit`).
    pub branch: Option<String>,
    pub commit: Option<String>,
    pub ahead: u32,
    pub behind: u32,
    /// Linhas adicionadas/removidas em relação ao HEAD (staged + não staged).
    pub added: u32,
    pub removed: u32,
    /// Arquivos rastreados alterados, arquivos novos não rastreados e conflitos.
    pub changed: u32,
    pub untracked: u32,
    pub conflicts: u32,
}

/// Roda `git` na pasta sem abrir janela de console e sem travar o índice de outros processos.
fn git(cwd: &Path, args: &[&str]) -> Option<String> {
    git_full(cwd, args).ok()
}

/// `-c` que impedem o repositório de rodar comandos pelo git do Termo. A pasta da aba vem do
/// `OSC 633;P;Cwd`, que qualquer saída do terminal pode falsificar; e um `.git/config` malicioso pode
/// rodar comando no `status` (`core.fsmonitor`) e no `add`/`restore`/`status` (filtros clean/smudge/process
/// ativados pelo `.gitattributes`). Comando vazio faz o git pular o filtro; `required=false` evita a recusa.
/// (`diff` ainda precisa de `--no-ext-diff --no-textconv` no próprio comando.)
pub fn safety_args(dir: &Path) -> Vec<String> {
    let mut args = vec!["-c".to_string(), "core.fsmonitor=false".to_string()];
    let mut cmd = Command::new("git");
    cmd.arg("-C").arg(dir).args(["config", "--name-only", "--get-regexp", r"^filter\."]);
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        cmd.creation_flags(0x0800_0000);
    }
    let names = cmd.output().map(|o| String::from_utf8_lossy(&o.stdout).into_owned()).unwrap_or_default();
    args.extend(filter_overrides(&names));
    args
}

/// Para cada filtro de `git config --name-only --get-regexp ^filter\.`, os `-c` que o desligam.
pub fn filter_overrides(config_names: &str) -> Vec<String> {
    let mut drivers: Vec<&str> = Vec::new();
    for line in config_names.lines() {
        // filter.<nome>.<chave>; o nome pode ter pontos.
        if let Some((name, _key)) = line.trim().strip_prefix("filter.").and_then(|r| r.rsplit_once('.')) {
            if !name.is_empty() && !drivers.contains(&name) {
                drivers.push(name);
            }
        }
    }
    drivers
        .iter()
        .flat_map(|n| {
            ["clean=", "smudge=", "process=", "required=false"].map(|k| ["-c".to_string(), format!("filter.{n}.{k}")])
        })
        .flatten()
        .collect()
}

/// Como `git`, mas devolve a mensagem de erro do git quando o comando falha.
pub(crate) fn git_full(cwd: &Path, args: &[&str]) -> Result<String, String> {
    let mut cmd = Command::new("git");
    cmd.arg("-C").arg(cwd).args(safety_args(cwd)).args(args).env("GIT_OPTIONAL_LOCKS", "0");
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        cmd.creation_flags(0x0800_0000);
    }
    let out = cmd.output().map_err(|e| format!("não foi possível rodar o git: {e}"))?;
    if out.status.success() {
        Ok(String::from_utf8_lossy(&out.stdout).into_owned())
    } else {
        let err = String::from_utf8_lossy(&out.stderr).trim().to_string();
        Err(if err.is_empty() { format!("git saiu com {}", out.status) } else { err })
    }
}

#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Branch {
    /// Nome para o `git switch` (a remota vem sem o `origin/`).
    pub name: String,
    pub current: bool,
    /// Só existe no remoto: trocar cria a branch local que acompanha a remota.
    pub remote: bool,
    /// Data do último commit, relativa ("2 days ago").
    pub updated: String,
}

const BRANCH_FORMAT: &str = "%(HEAD)%09%(refname)%09%(committerdate:relative)";

/// Lê o `for-each-ref` das branches locais e remotas. As remotas que já têm local igual somem,
/// e o `HEAD` das remotas (`origin/HEAD`) também.
pub fn parse_branches(text: &str) -> Vec<Branch> {
    let mut local = Vec::new();
    let mut remote = Vec::new();
    for line in text.lines() {
        let mut cols = line.splitn(3, '\t');
        let (Some(head), Some(refname)) = (cols.next(), cols.next()) else { continue };
        let updated = cols.next().unwrap_or("").to_string();
        if let Some(name) = refname.strip_prefix("refs/heads/") {
            local.push(Branch { name: name.to_string(), current: head == "*", remote: false, updated });
        } else if let Some(rest) = refname.strip_prefix("refs/remotes/") {
            let Some((_, name)) = rest.split_once('/') else { continue };
            if name != "HEAD" {
                remote.push(Branch { name: name.to_string(), current: false, remote: true, updated });
            }
        }
    }
    remote.retain(|r| !local.iter().any(|l: &Branch| l.name == r.name));
    remote.dedup_by(|a, b| a.name == b.name);
    local.extend(remote);
    local
}

/// Branches da pasta, a atual e as locais primeiro (mais recentes antes); `None` fora de repositório.
pub fn branches(cwd: &Path) -> Option<Vec<Branch>> {
    let out = git(cwd, &["for-each-ref", "--sort=-committerdate", &format!("--format={BRANCH_FORMAT}"), "refs/heads", "refs/remotes"])?;
    let mut list = parse_branches(&out);
    list.sort_by_key(|b| (!b.current, b.remote));
    Some(list)
}

/// Troca de branch com `git switch`. O git recusa se houver alterações que seriam perdidas,
/// e a mensagem dele volta como erro.
pub fn switch_branch(cwd: &Path, name: &str) -> Result<(), String> {
    check_name(name)?;
    git_full(cwd, &["switch", name]).map(|_| ())
}

/// Cria a branch a partir do HEAD e já troca para ela (`git switch -c`). As alterações não
/// commitadas vão junto; o git recusa nomes inválidos ou que já existem, e a mensagem volta como erro.
pub fn create_branch(cwd: &Path, name: &str) -> Result<(), String> {
    check_name(name)?;
    git_full(cwd, &["switch", "-c", name]).map(|_| ())
}

/// Barra o que o git leria como opção (`-x`) ou que quebraria o argumento; o resto quem valida é o git.
fn check_name(name: &str) -> Result<(), String> {
    if name.is_empty() || name.starts_with('-') || name.chars().any(|c| c.is_control() || c == ' ') {
        return Err(format!("nome de branch inválido: {name}"));
    }
    Ok(())
}

/// Lê `git status --porcelain=v2 --branch`.
pub fn parse_status(text: &str, info: &mut GitInfo) {
    for line in text.lines() {
        if let Some(head) = line.strip_prefix("# branch.head ") {
            info.branch = (head != "(detached)").then(|| head.to_string());
        } else if let Some(oid) = line.strip_prefix("# branch.oid ") {
            info.commit = (oid != "(initial)").then(|| oid.chars().take(7).collect());
        } else if let Some(ab) = line.strip_prefix("# branch.ab ") {
            for part in ab.split_whitespace() {
                if let Some(n) = part.strip_prefix('+') {
                    info.ahead = n.parse().unwrap_or(0);
                } else if let Some(n) = part.strip_prefix('-') {
                    info.behind = n.parse().unwrap_or(0);
                }
            }
        } else if line.starts_with("1 ") || line.starts_with("2 ") {
            info.changed += 1;
        } else if line.starts_with("u ") {
            info.conflicts += 1;
        } else if line.starts_with("? ") {
            info.untracked += 1;
        }
    }
}

/// Soma `git diff --numstat` (arquivos binários aparecem com `-` e não contam linhas).
pub fn sum_numstat(text: &str) -> (u32, u32) {
    text.lines().fold((0, 0), |(a, r), line| {
        let mut cols = line.split('\t');
        let add = cols.next().and_then(|c| c.parse::<u32>().ok()).unwrap_or(0);
        let del = cols.next().and_then(|c| c.parse::<u32>().ok()).unwrap_or(0);
        (a.saturating_add(add), r.saturating_add(del))
    })
}

/// `None` quando a pasta não está num repositório git (ou o git não está instalado).
pub fn git_info(cwd: &Path) -> Option<GitInfo> {
    let status = git(cwd, &["status", "--porcelain=v2", "--branch", "--untracked-files=normal"])?;
    let mut info = GitInfo::default();
    parse_status(&status, &mut info);

    // Com commits: diff contra o HEAD (staged + não staged). Repositório vazio: staged + não staged.
    let (added, removed) = match git(cwd, &["diff", "HEAD", "--numstat", "--no-ext-diff", "--no-textconv"]) {
        Some(out) => sum_numstat(&out),
        None => {
            let (a1, r1) = git(cwd, &["diff", "--cached", "--numstat", "--no-ext-diff", "--no-textconv"]).map(|o| sum_numstat(&o)).unwrap_or_default();
            let (a2, r2) = git(cwd, &["diff", "--numstat", "--no-ext-diff", "--no-textconv"]).map(|o| sum_numstat(&o)).unwrap_or_default();
            (a1 + a2, r1 + r2)
        }
    };
    info.added = added;
    info.removed = removed;
    Some(info)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn creates_and_switches_to_new_branch() {
        if which::which("git").is_err() {
            return;
        }
        let dir = std::env::temp_dir().join(format!("termo-git-create-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).unwrap();
        git_full(&dir, &["init", "-q", "-b", "main"]).unwrap();
        // Um commit para as branches existirem de verdade (sem commit, a branch nova ainda não existe).
        let who = ["-c", "user.name=termo", "-c", "user.email=termo@localhost"];
        git_full(&dir, &[&who[..], &["commit", "-q", "--allow-empty", "-m", "inicio"]].concat()).unwrap();
        create_branch(&dir, "feat/nova").unwrap();
        assert_eq!(git(&dir, &["symbolic-ref", "--short", "HEAD"]).unwrap().trim(), "feat/nova");
        // Já existe (mesmo nome) e nome que viraria opção do git: os dois são recusados.
        assert!(create_branch(&dir, "feat/nova").is_err());
        assert!(create_branch(&dir, "-D").is_err());
        std::fs::remove_dir_all(&dir).ok();
    }

    #[test]
    fn parses_porcelain_v2() {
        let text = "# branch.oid 8520e9fa1b2c3d\n# branch.head master\n# branch.upstream origin/master\n# branch.ab +2 -1\n\
1 .M N... 100644 100644 100644 a b src/a.ts\n2 R. N... 100644 100644 100644 a b R100 new.ts\told.ts\n\
u UU N... 1 2 3 4 a b c conflito.ts\n? novo.txt\n? outro.txt\n";
        let mut info = GitInfo::default();
        parse_status(text, &mut info);
        assert_eq!(
            info,
            GitInfo {
                branch: Some("master".into()),
                commit: Some("8520e9f".into()),
                ahead: 2,
                behind: 1,
                changed: 2,
                untracked: 2,
                conflicts: 1,
                ..Default::default()
            }
        );
    }

    #[test]
    fn detached_and_initial() {
        let mut info = GitInfo::default();
        parse_status("# branch.oid (initial)\n# branch.head (detached)\n", &mut info);
        assert_eq!(info.branch, None);
        assert_eq!(info.commit, None);
    }

    #[test]
    fn sums_numstat_ignoring_binaries() {
        assert_eq!(sum_numstat("10\t2\ta.ts\n-\t-\timg.png\n3\t0\tb.rs\n"), (13, 2));
        assert_eq!(sum_numstat(""), (0, 0));
    }

    #[test]
    fn parses_branches_and_hides_duplicate_remotes() {
        let text = "*	refs/heads/master	2 hours ago
 	refs/heads/feat/x	3 days ago
 	refs/remotes/origin/HEAD	2 hours ago
 	refs/remotes/origin/master	2 hours ago
 	refs/remotes/origin/main	1 week ago
";
        let list = parse_branches(text);
        let names: Vec<_> = list.iter().map(|b| (b.name.as_str(), b.current, b.remote)).collect();
        assert_eq!(names, vec![("master", true, false), ("feat/x", false, false), ("main", false, true)]);
        assert_eq!(list[1].updated, "3 days ago");
    }

    #[test]
    fn rejects_option_like_branch_names() {
        let dir = std::env::temp_dir();
        assert!(switch_branch(&dir, "--orphan").is_err());
        assert!(switch_branch(&dir, "").is_err());
        assert!(switch_branch(&dir, "a b").is_err());
    }

    #[test]
    fn neutralizes_filters_by_name() {
        let names = "filter.lfs.clean\nfilter.lfs.smudge\nfilter.a.b.process\n";
        let args = filter_overrides(names);
        assert!(args.contains(&"filter.lfs.clean=".to_string()));
        assert!(args.contains(&"filter.lfs.required=false".to_string()));
        assert!(args.contains(&"filter.a.b.smudge=".to_string()));
        // Cada `-c` vem antes do valor, e cada filtro aparece uma vez (4 chaves × 2 filtros).
        assert_eq!(args.len(), 16);
        assert!(args.chunks(2).all(|c| c[0] == "-c"));
    }

    #[test]
    fn malicious_repo_config_does_not_run() {
        if which::which("git").is_err() {
            return;
        }
        let dir = std::env::temp_dir().join(format!("termo-git-evil-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).unwrap();
        git_full(&dir, &["init", "-q", "-b", "main"]).unwrap();
        // Configuração que um repositório baixado pode trazer: comandos no status e no add.
        let raw = |args: &[&str]| {
            Command::new("git").arg("-C").arg(&dir).args(args).output().unwrap();
        };
        raw(&["config", "core.fsmonitor", "echo x > pwned-fsmonitor.txt"]);
        raw(&["config", "filter.evil.clean", "echo x > pwned-filter.txt; cat"]);
        raw(&["config", "filter.evil.required", "true"]);
        std::fs::write(dir.join(".gitattributes"), "*.txt filter=evil\n").unwrap();
        std::fs::write(dir.join("a.txt"), "1\n").unwrap();
        assert!(git_info(&dir).is_some());
        git_full(&dir, &["add", "a.txt"]).unwrap();
        assert!(!dir.join("pwned-fsmonitor.txt").exists(), "fsmonitor rodou");
        assert!(!dir.join("pwned-filter.txt").exists(), "filtro clean rodou");
        // Sem o endurecimento o filtro roda (prova de que o teste testa algo).
        raw(&["rm", "-q", "--cached", "a.txt"]);
        raw(&["add", "a.txt"]);
        assert!(dir.join("pwned-filter.txt").exists(), "o git puro deveria rodar o filtro");
        std::fs::remove_dir_all(&dir).ok();
    }

    #[test]
    fn real_repo_when_git_is_available() {
        if which::which("git").is_err() {
            return;
        }
        let dir = std::env::temp_dir().join(format!("termo-git-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).unwrap();
        assert!(git_info(&dir).is_none(), "fora de repositório");
        git(&dir, &["init", "-q", "-b", "main"]).unwrap();
        std::fs::write(dir.join("a.txt"), "1\n2\n").unwrap();
        let info = git_info(&dir).unwrap();
        assert_eq!(info.branch.as_deref(), Some("main"));
        assert_eq!(info.untracked, 1);

        git(&dir, &["add", "."]).unwrap();
        git(&dir, &["-c", "user.name=t", "-c", "user.email=t@t", "commit", "-qm", "x"]).unwrap();
        git(&dir, &["branch", "outra"]).unwrap();
        let list = branches(&dir).unwrap();
        assert_eq!(list[0].name, "main");
        assert!(list[0].current);
        assert!(list.iter().any(|b| b.name == "outra" && !b.current));
        switch_branch(&dir, "outra").unwrap();
        assert_eq!(git_info(&dir).unwrap().branch.as_deref(), Some("outra"));
        assert!(switch_branch(&dir, "nao-existe").is_err());
        let _ = std::fs::remove_dir_all(&dir);
    }
}
