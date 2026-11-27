//! Sessões em worktree: uma cópia isolada do repositório (`git worktree`) numa branch própria,
//! para uma aba do Claude trabalhar sem mexer na pasta principal. Depois, juntar (merge na
//! branch da pasta principal) ou descartar.
//!
//! As cópias ficam ao lado do repositório, em `<pai>/<repo>.worktrees/<nome>`, na branch
//! `termo/<nome>`.

use std::path::{Path, PathBuf};

use serde::Serialize;

use crate::git::git_full;

/// Prefixo das branches criadas pelo Termo.
pub const BRANCH_PREFIX: &str = "termo/";
const MAX_NAME: usize = 40;

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Worktree {
    /// Pasta da cópia, no formato do Windows (`D:\x\y`).
    pub path: String,
    /// Branch da cópia; `None` com HEAD destacado.
    pub branch: Option<String>,
    /// A pasta principal do repositório (a primeira da lista do git).
    pub main: bool,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WorktreeStatus {
    #[serde(flatten)]
    pub worktree: Worktree,
    /// Commits da cópia que a branch da pasta principal ainda não tem.
    pub ahead: u32,
    /// Arquivos alterados ou novos ainda não commitados na cópia.
    pub dirty: u32,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WorktreeList {
    /// Pasta principal e a branch dela (para onde o "juntar" vai).
    pub main_path: String,
    pub main_branch: Option<String>,
    /// As cópias (sem a pasta principal), as do Termo primeiro.
    pub worktrees: Vec<WorktreeStatus>,
}

/// Nome curto da cópia: letras, números, `-`, `_` e `.`, sem começar por `-` ou `.`.
pub fn check_name(name: &str) -> Result<(), String> {
    let ok_chars = name.chars().all(|c| c.is_ascii_alphanumeric() || matches!(c, '-' | '_' | '.'));
    if name.is_empty() || name.len() > MAX_NAME || !ok_chars || name.starts_with(['-', '.']) || name.ends_with(".lock") {
        return Err(format!("nome inválido: use até {MAX_NAME} letras, números, - _ ou ."));
    }
    Ok(())
}

/// `D:/x/y` (como o git escreve) vira `D:\x\y`.
fn native(path: &str) -> String {
    if cfg!(windows) {
        path.replace('/', "\\")
    } else {
        path.to_string()
    }
}

/// Compara pastas sem ligar para barra final, tipo de barra e (no Windows) maiúsculas.
fn same_dir(a: &str, b: &str) -> bool {
    let norm = |s: &str| {
        let s = native(s);
        let s = s.trim_end_matches(['\\', '/']).to_string();
        if cfg!(windows) {
            s.to_lowercase()
        } else {
            s
        }
    };
    norm(a) == norm(b)
}

/// Lê `git worktree list --porcelain`. A primeira entrada é a pasta principal; repositórios
/// `bare` e entradas sem pasta são ignorados.
pub fn parse_list(text: &str) -> Vec<Worktree> {
    let mut out = Vec::new();
    for block in text.split("\n\n") {
        let mut path = None;
        let mut branch = None;
        let mut bare = false;
        for line in block.lines() {
            if let Some(p) = line.strip_prefix("worktree ") {
                path = Some(native(p));
            } else if let Some(b) = line.strip_prefix("branch ") {
                branch = Some(b.strip_prefix("refs/heads/").unwrap_or(b).to_string());
            } else if line == "bare" {
                bare = true;
            }
        }
        if let (Some(path), false) = (path, bare) {
            let main = out.is_empty();
            out.push(Worktree { path, branch, main });
        }
    }
    out
}

fn list_raw(cwd: &Path) -> Result<Vec<Worktree>, String> {
    let list = parse_list(&git_full(cwd, &["worktree", "list", "--porcelain"])?);
    if list.is_empty() {
        return Err("não é um repositório git".into());
    }
    Ok(list)
}

fn count_lines(text: &str) -> u32 {
    text.lines().filter(|l| !l.trim().is_empty()).count() as u32
}

/// Cópias do repositório da pasta, com commits à frente e alterações não commitadas.
pub fn list(cwd: &Path) -> Result<WorktreeList, String> {
    let all = list_raw(cwd)?;
    let main = all[0].clone();
    let mut worktrees: Vec<WorktreeStatus> = all[1..]
        .iter()
        .filter(|w| Path::new(&w.path).is_dir())
        .map(|w| {
            let ahead = match (&main.branch, &w.branch) {
                (Some(base), Some(b)) => git_full(cwd, &["rev-list", "--count", &format!("{base}..{b}")])
                    .ok()
                    .and_then(|s| s.trim().parse().ok())
                    .unwrap_or(0),
                _ => 0,
            };
            let dirty = git_full(Path::new(&w.path), &["status", "--porcelain"]).map(|s| count_lines(&s)).unwrap_or(0);
            WorktreeStatus { worktree: w.clone(), ahead, dirty }
        })
        .collect();
    worktrees.sort_by_key(|w| !w.worktree.branch.as_deref().is_some_and(|b| b.starts_with(BRANCH_PREFIX)));
    Ok(WorktreeList { main_path: main.path, main_branch: main.branch, worktrees })
}

/// Pasta das cópias: `<pai>/<repo>.worktrees`.
fn worktrees_dir(main: &Path) -> PathBuf {
    let name = main.file_name().map(|n| n.to_string_lossy().into_owned()).unwrap_or_else(|| "repo".into());
    main.parent().unwrap_or(main).join(format!("{name}.worktrees"))
}

/// Cria a cópia `<nome>` a partir do HEAD da pasta principal, na branch `termo/<nome>`.
/// Devolve a cópia criada.
pub fn create(cwd: &Path, name: &str) -> Result<Worktree, String> {
    check_name(name)?;
    let main = list_raw(cwd)?.remove(0);
    let path = worktrees_dir(Path::new(&main.path)).join(name);
    if path.exists() {
        return Err(format!("já existe: {}", path.display()));
    }
    let branch = format!("{BRANCH_PREFIX}{name}");
    let p = path.to_string_lossy().into_owned();
    git_full(Path::new(&main.path), &["worktree", "add", "-b", &branch, &p, "HEAD"])?;
    Ok(Worktree { path: native(&p), branch: Some(branch), main: false })
}

/// A cópia `path` do repositório de `cwd` (nunca a pasta principal).
fn find(cwd: &Path, path: &str) -> Result<(Worktree, Worktree), String> {
    let all = list_raw(cwd)?;
    let main = all[0].clone();
    let wt = all.into_iter().skip(1).find(|w| same_dir(&w.path, path)).ok_or_else(|| format!("não é uma cópia deste repositório: {path}"))?;
    Ok((main, wt))
}

/// Tira a cópia e apaga a branch dela. `force` descarta o que não foi commitado e os commits.
fn remove(main: &Worktree, wt: &Worktree, force: bool) -> Result<(), String> {
    let dir = Path::new(&main.path);
    let mut args = vec!["worktree", "remove"];
    if force {
        args.push("--force");
    }
    args.push(&wt.path);
    git_full(dir, &args)?;
    if let Some(b) = &wt.branch {
        git_full(dir, &["branch", if force { "-D" } else { "-d" }, b])?;
    }
    Ok(())
}

/// Junta a cópia na branch da pasta principal (`merge --no-ff`) e a remove. Recusa se a cópia
/// tiver alterações não commitadas; com conflito, desfaz o merge e devolve a mensagem do git.
/// Devolve quantos commits entraram.
pub fn merge(cwd: &Path, path: &str) -> Result<u32, String> {
    let (main, wt) = find(cwd, path)?;
    let branch = wt.branch.clone().ok_or("a cópia não está numa branch")?;
    let main_branch = main.branch.clone().ok_or("a pasta principal não está numa branch")?;
    let dirty = count_lines(&git_full(Path::new(&wt.path), &["status", "--porcelain"])?);
    if dirty > 0 {
        return Err(format!("a cópia tem {dirty} arquivo(s) não commitado(s): commite ou descarte antes de juntar"));
    }
    let dir = Path::new(&main.path);
    let ahead: u32 = git_full(dir, &["rev-list", "--count", &format!("{main_branch}..{branch}")])?.trim().parse().unwrap_or(0);
    if ahead > 0 {
        let msg = format!("Juntar {branch} em {main_branch}");
        if let Err(e) = git_full(dir, &["merge", "--no-ff", "-m", &msg, &branch]) {
            let _ = git_full(dir, &["merge", "--abort"]);
            return Err(format!("o merge não foi feito: {e}"));
        }
    }
    remove(&main, &wt, false)?;
    Ok(ahead)
}

/// Apaga a cópia, os commits e as alterações dela.
pub fn discard(cwd: &Path, path: &str) -> Result<(), String> {
    let (main, wt) = find(cwd, path)?;
    remove(&main, &wt, true)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn validates_names() {
        assert!(check_name("corrige-login").is_ok());
        assert!(check_name("v2.1_x").is_ok());
        for bad in ["", "-x", ".x", "a b", "a/b", "x.lock", "ç", &"a".repeat(41)] {
            assert!(check_name(bad).is_err(), "{bad}");
        }
    }

    #[test]
    fn parses_porcelain_list() {
        let text = "worktree D:/p/termo\nHEAD abc\nbranch refs/heads/master\n\nworktree D:/p/termo.worktrees/x\nHEAD def\nbranch refs/heads/termo/x\n\nworktree D:/p/solto\nHEAD 123\ndetached\n";
        let list = parse_list(text);
        assert_eq!(list.len(), 3);
        assert!(list[0].main && !list[1].main);
        assert_eq!(list[0].branch.as_deref(), Some("master"));
        assert_eq!(list[1].branch.as_deref(), Some("termo/x"));
        assert_eq!(list[2].branch, None);
        assert!(same_dir(&list[1].path, "D:\\p\\termo.worktrees\\x\\"));
    }

    #[test]
    fn create_merge_and_discard() {
        if which::which("git").is_err() {
            return;
        }
        let root = std::env::temp_dir().join(format!("termo-wt-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&root);
        let repo = root.join("repo");
        std::fs::create_dir_all(&repo).unwrap();
        let who = ["-c", "user.name=termo", "-c", "user.email=termo@localhost"];
        let commit = |dir: &Path, msg: &str| {
            git_full(dir, &["add", "-A"]).unwrap();
            git_full(dir, &[&who[..], &["commit", "-q", "--allow-empty", "-m", msg]].concat()).unwrap();
        };
        git_full(&repo, &["init", "-q", "-b", "main"]).unwrap();
        // O merge commita por conta própria; no CI não há identidade global do git.
        git_full(&repo, &["config", "user.name", "termo"]).unwrap();
        git_full(&repo, &["config", "user.email", "termo@localhost"]).unwrap();
        commit(&repo, "inicio");

        let wt = create(&repo, "tarefa").unwrap();
        assert!(Path::new(&wt.path).ends_with("repo.worktrees/tarefa") || wt.path.ends_with("repo.worktrees\\tarefa"));
        assert!(create(&repo, "tarefa").is_err(), "nome repetido");

        // Alteração não commitada impede o merge.
        std::fs::write(Path::new(&wt.path).join("a.txt"), "oi").unwrap();
        let l = list(&repo).unwrap();
        assert_eq!(l.main_branch.as_deref(), Some("main"));
        assert_eq!((l.worktrees[0].ahead, l.worktrees[0].dirty), (0, 1));
        assert!(merge(&repo, &wt.path).is_err());

        commit(Path::new(&wt.path), "a.txt");
        assert_eq!(merge(&repo, &wt.path).unwrap(), 1);
        assert!(repo.join("a.txt").exists());
        assert!(!Path::new(&wt.path).exists());
        assert!(list(&repo).unwrap().worktrees.is_empty());

        // Descartar apaga a cópia e a branch, mesmo com commits.
        let wt2 = create(&repo, "outra").unwrap();
        std::fs::write(Path::new(&wt2.path).join("b.txt"), "x").unwrap();
        commit(Path::new(&wt2.path), "b.txt");
        discard(&repo, &wt2.path).unwrap();
        assert!(!Path::new(&wt2.path).exists());
        assert!(!repo.join("b.txt").exists());
        assert!(git_full(&repo, &["rev-parse", "--verify", "termo/outra"]).is_err());
        assert!(discard(&repo, &repo.to_string_lossy()).is_err(), "a pasta principal não é descartável");

        std::fs::remove_dir_all(&root).ok();
    }
}
