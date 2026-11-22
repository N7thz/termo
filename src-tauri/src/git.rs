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
    let mut cmd = Command::new("git");
    cmd.arg("-C").arg(cwd).args(args).env("GIT_OPTIONAL_LOCKS", "0");
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        cmd.creation_flags(0x0800_0000);
    }
    let out = cmd.output().ok()?;
    out.status.success().then(|| String::from_utf8_lossy(&out.stdout).into_owned())
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
    let (added, removed) = match git(cwd, &["diff", "HEAD", "--numstat"]) {
        Some(out) => sum_numstat(&out),
        None => {
            let (a1, r1) = git(cwd, &["diff", "--cached", "--numstat"]).map(|o| sum_numstat(&o)).unwrap_or_default();
            let (a2, r2) = git(cwd, &["diff", "--numstat"]).map(|o| sum_numstat(&o)).unwrap_or_default();
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
        let _ = std::fs::remove_dir_all(&dir);
    }
}
