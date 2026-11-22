//! Painel de code review: os arquivos alterados do repositório da aba (em relação ao HEAD), o diff de
//! cada um e as ações de preparar para commit (stage), tirar do stage e descartar.
//!
//! Tudo roda com `git -C <raiz>`; os caminhos vêm relativos à raiz do repositório e só são aceitos se
//! estiverem na lista de alterados (nada de `..` nem caminho absoluto vindo da interface).

use std::collections::BTreeMap;
use std::path::{Component, Path, PathBuf};
use std::process::Command;

use serde::Serialize;

/// Diffs maiores que isso são cortados (a interface avisa).
const MAX_DIFF: usize = 1024 * 1024;
/// Arquivo novo maior que isso não tem as linhas contadas nem mostradas.
const MAX_NEW_FILE: u64 = 512 * 1024;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum FileStatus {
    Modified,
    Added,
    Deleted,
    Untracked,
    Conflict,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum Staged {
    None,
    Partial,
    Full,
}

#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ChangedFile {
    /// Relativo à raiz do repositório, com `/`.
    pub path: String,
    pub status: FileStatus,
    pub staged: Staged,
    pub added: u32,
    pub removed: u32,
    pub binary: bool,
}

#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ReviewStatus {
    pub root: String,
    pub branch: Option<String>,
    pub files: Vec<ChangedFile>,
}

#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FileDiff {
    /// Diff unificado (vazio para binários).
    pub diff: String,
    pub binary: bool,
    pub truncated: bool,
}

/// Roda o git e devolve (sucesso, stdout, stderr). Não abre console e não trava o índice de outros processos.
fn run(dir: &Path, args: &[&str]) -> Result<(bool, String, String), String> {
    let mut cmd = Command::new("git");
    cmd.arg("-C").arg(dir).args(["-c", "core.quotepath=off"]).args(args).env("GIT_OPTIONAL_LOCKS", "0");
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        cmd.creation_flags(0x0800_0000);
    }
    let out = cmd.output().map_err(|e| format!("não foi possível rodar o git: {e}"))?;
    Ok((
        out.status.success(),
        String::from_utf8_lossy(&out.stdout).into_owned(),
        String::from_utf8_lossy(&out.stderr).trim().to_string(),
    ))
}

fn ok(dir: &Path, args: &[&str]) -> Result<String, String> {
    match run(dir, args)? {
        (true, out, _) => Ok(out),
        (false, _, err) => Err(if err.is_empty() { format!("git {} falhou", args.join(" ")) } else { err }),
    }
}

/// Raiz do repositório que contém `cwd`; `None` fora de repositório.
pub fn root_of(cwd: &Path) -> Option<PathBuf> {
    let out = ok(cwd, &["rev-parse", "--show-toplevel"]).ok()?;
    let root = out.trim();
    (!root.is_empty()).then(|| PathBuf::from(root))
}

fn has_head(root: &Path) -> bool {
    run(root, &["rev-parse", "--verify", "-q", "HEAD"]).is_ok_and(|(ok, _, _)| ok)
}

/// Interpreta `git status --porcelain=v1 -z --no-renames`: (caminho, X, Y).
pub fn parse_porcelain(text: &str) -> Vec<(String, char, char)> {
    text.split('\0')
        .filter(|e| e.len() > 3)
        .map(|e| {
            let mut chars = e.chars();
            let x = chars.next().unwrap_or(' ');
            let y = chars.next().unwrap_or(' ');
            (e[3..].to_string(), x, y)
        })
        .collect()
}

/// Classifica a entrada do `status`.
pub fn classify(x: char, y: char) -> (FileStatus, Staged) {
    let conflict = x == 'U' || y == 'U' || (x == 'A' && y == 'A') || (x == 'D' && y == 'D');
    if conflict {
        return (FileStatus::Conflict, Staged::None);
    }
    if x == '?' {
        return (FileStatus::Untracked, Staged::None);
    }
    let status = if x == 'D' || y == 'D' {
        FileStatus::Deleted
    } else if x == 'A' {
        FileStatus::Added
    } else {
        FileStatus::Modified
    };
    let staged = match (x != ' ', y != ' ') {
        (true, false) => Staged::Full,
        (true, true) => Staged::Partial,
        _ => Staged::None,
    };
    (status, staged)
}

/// `git diff --numstat` (sem renomeações): caminho → (adicionadas, removidas, binário).
pub fn parse_numstat(text: &str) -> BTreeMap<String, (u32, u32, bool)> {
    text.lines()
        .filter_map(|l| {
            let mut parts = l.splitn(3, '\t');
            let (a, r, path) = (parts.next()?, parts.next()?, parts.next()?);
            let binary = a == "-" || r == "-";
            Some((path.to_string(), (a.parse().unwrap_or(0), r.parse().unwrap_or(0), binary)))
        })
        .collect()
}

fn is_binary(bytes: &[u8]) -> bool {
    bytes.iter().take(8000).any(|&b| b == 0)
}

/// Arquivos alterados em relação ao HEAD (preparados ou não) e os novos, com as linhas de cada um.
pub fn status(cwd: &Path) -> Result<Option<ReviewStatus>, String> {
    let Some(root) = root_of(cwd) else { return Ok(None) };
    let porcelain = ok(&root, &["status", "--porcelain=v1", "-z", "--no-renames", "--untracked-files=all"])?;
    let numstat = if has_head(&root) {
        ok(&root, &["diff", "HEAD", "--numstat", "--no-renames"])?
    } else {
        ok(&root, &["diff", "--cached", "--numstat", "--no-renames"])?
    };
    let counts = parse_numstat(&numstat);
    let branch = ok(&root, &["branch", "--show-current"]).ok().map(|b| b.trim().to_string()).filter(|b| !b.is_empty());

    let mut files: Vec<ChangedFile> = parse_porcelain(&porcelain)
        .into_iter()
        .map(|(path, x, y)| {
            let (status, staged) = classify(x, y);
            let (mut added, mut removed, mut binary) = counts.get(&path).copied().unwrap_or((0, 0, false));
            if status == FileStatus::Untracked {
                let full = root.join(&path);
                match std::fs::metadata(&full) {
                    Ok(m) if m.len() <= MAX_NEW_FILE => {
                        let bytes = std::fs::read(&full).unwrap_or_default();
                        binary = is_binary(&bytes);
                        if !binary {
                            added = String::from_utf8_lossy(&bytes).lines().count() as u32;
                        }
                    }
                    _ => binary = true,
                }
                removed = 0;
            }
            ChangedFile { path, status, staged, added, removed, binary }
        })
        .collect();
    files.sort_by(|a, b| a.path.to_lowercase().cmp(&b.path.to_lowercase()));
    Ok(Some(ReviewStatus { root: root.to_string_lossy().replace('\\', "/"), branch, files }))
}

/// Caminho relativo seguro: sem `..`, sem raiz nem letra de disco.
pub fn safe_relative(path: &str) -> Result<&str, String> {
    let p = Path::new(path);
    let bad = path.is_empty() || p.components().any(|c| !matches!(c, Component::Normal(_) | Component::CurDir));
    if bad {
        return Err(format!("caminho inválido: {path}"));
    }
    Ok(path)
}

/// Confere que o arquivo está mesmo entre os alterados e devolve a raiz e a entrada dele.
fn find(cwd: &Path, path: &str) -> Result<(PathBuf, ChangedFile), String> {
    safe_relative(path)?;
    let st = status(cwd)?.ok_or("a pasta não é um repositório git")?;
    let file = st.files.into_iter().find(|f| f.path == path).ok_or_else(|| format!("{path} não tem alterações"))?;
    Ok((PathBuf::from(st.root), file))
}

/// Diff de arquivo novo (não rastreado), montado aqui: o `git diff --no-index` não lida bem com /dev/null no Windows.
pub fn new_file_diff(path: &str, text: &str) -> String {
    let lines: Vec<&str> = text.lines().collect();
    let mut out = format!("diff --git a/{path} b/{path}\nnew file\n--- /dev/null\n+++ b/{path}\n");
    if !lines.is_empty() {
        out.push_str(&format!("@@ -0,0 +1,{} @@\n", lines.len()));
        for l in lines {
            out.push('+');
            out.push_str(l);
            out.push('\n');
        }
    }
    out
}

fn truncate(mut diff: String) -> (String, bool) {
    if diff.len() <= MAX_DIFF {
        return (diff, false);
    }
    let mut cut = MAX_DIFF;
    while !diff.is_char_boundary(cut) {
        cut -= 1;
    }
    let cut = diff[..cut].rfind('\n').map_or(cut, |i| i + 1);
    diff.truncate(cut);
    (diff, true)
}

/// Diff unificado do arquivo em relação ao HEAD (preparado e não preparado juntos).
pub fn diff(cwd: &Path, path: &str) -> Result<FileDiff, String> {
    let (root, file) = find(cwd, path)?;
    if file.binary {
        return Ok(FileDiff { diff: String::new(), binary: true, truncated: false });
    }
    let text = if file.status == FileStatus::Untracked {
        let bytes = std::fs::read(root.join(path)).map_err(|e| e.to_string())?;
        new_file_diff(path, &String::from_utf8_lossy(&bytes))
    } else if has_head(&root) {
        ok(&root, &["diff", "HEAD", "--no-renames", "--no-color", "--no-ext-diff", "--", path])?
    } else {
        ok(&root, &["diff", "--cached", "--no-renames", "--no-color", "--no-ext-diff", "--", path])?
    };
    let (diff, truncated) = truncate(text);
    Ok(FileDiff { diff, binary: false, truncated })
}

/// Prepara (`git add`) ou tira do stage o arquivo.
pub fn stage(cwd: &Path, path: &str, staged: bool) -> Result<(), String> {
    let (root, _) = find(cwd, path)?;
    if staged {
        ok(&root, &["add", "-A", "--", path])?;
    } else if has_head(&root) {
        ok(&root, &["restore", "--staged", "--", path])?;
    } else {
        ok(&root, &["rm", "--cached", "-q", "--", path])?;
    }
    Ok(())
}

/// Descarta as alterações do arquivo: volta ao HEAD; arquivo novo é apagado.
pub fn discard(cwd: &Path, path: &str) -> Result<(), String> {
    let (root, file) = find(cwd, path)?;
    match file.status {
        FileStatus::Untracked => std::fs::remove_file(root.join(path)).map_err(|e| e.to_string()),
        FileStatus::Added => {
            ok(&root, &["rm", "-f", "-q", "--", path])?;
            Ok(())
        }
        FileStatus::Conflict => Err("resolva o conflito antes de descartar".into()),
        _ => {
            ok(&root, &["restore", "--source=HEAD", "--staged", "--worktree", "--", path])?;
            Ok(())
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn porcelain_and_classification() {
        let text = " M src/a.rs\0M  b.txt\0MM c.ts\0A  novo.rs\0 D velho.rs\0?? x/y z.md\0UU conflito.rs\0";
        let parsed = parse_porcelain(text);
        assert_eq!(parsed.len(), 7);
        assert_eq!(parsed[5].0, "x/y z.md");
        let kinds: Vec<_> = parsed.iter().map(|(_, x, y)| classify(*x, *y)).collect();
        assert_eq!(kinds[0], (FileStatus::Modified, Staged::None));
        assert_eq!(kinds[1], (FileStatus::Modified, Staged::Full));
        assert_eq!(kinds[2], (FileStatus::Modified, Staged::Partial));
        assert_eq!(kinds[3], (FileStatus::Added, Staged::Full));
        assert_eq!(kinds[4], (FileStatus::Deleted, Staged::None));
        assert_eq!(kinds[5], (FileStatus::Untracked, Staged::None));
        assert_eq!(kinds[6], (FileStatus::Conflict, Staged::None));
    }

    #[test]
    fn numstat() {
        let m = parse_numstat("3\t1\tsrc/a.rs\n-\t-\timg.png\n");
        assert_eq!(m["src/a.rs"], (3, 1, false));
        assert_eq!(m["img.png"], (0, 0, true));
    }

    #[test]
    fn rejects_escaping_paths() {
        assert!(safe_relative("src/a.rs").is_ok());
        assert!(safe_relative("../fora").is_err());
        assert!(safe_relative("C:/Windows/win.ini").is_err());
        assert!(safe_relative("/etc/passwd").is_err());
        assert!(safe_relative("").is_err());
    }

    #[test]
    fn new_file() {
        assert_eq!(
            new_file_diff("a.txt", "x\ny\n"),
            "diff --git a/a.txt b/a.txt\nnew file\n--- /dev/null\n+++ b/a.txt\n@@ -0,0 +1,2 @@\n+x\n+y\n"
        );
    }

    fn git(dir: &Path, args: &[&str]) {
        ok(dir, args).unwrap();
    }

    #[test]
    fn real_repo_flow() {
        let dir = std::env::temp_dir().join(format!("termo-review-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).unwrap();
        git(&dir, &["init", "-q", "-b", "main"]);
        git(&dir, &["config", "user.email", "t@t"]);
        git(&dir, &["config", "user.name", "t"]);
        std::fs::write(dir.join("a.txt"), "1\n2\n3\n").unwrap();
        git(&dir, &["add", "."]);
        git(&dir, &["commit", "-q", "-m", "x"]);
        std::fs::write(dir.join("a.txt"), "1\ndois\n3\n").unwrap();
        std::fs::write(dir.join("novo.txt"), "a\nb\n").unwrap();

        let st = status(&dir).unwrap().unwrap();
        assert_eq!(st.files.len(), 2);
        let a = &st.files[0];
        assert_eq!((a.path.as_str(), a.status, a.added, a.removed), ("a.txt", FileStatus::Modified, 1, 1));
        assert_eq!((st.files[1].status, st.files[1].added), (FileStatus::Untracked, 2));
        assert!(diff(&dir, "a.txt").unwrap().diff.contains("+dois"));
        assert!(diff(&dir, "novo.txt").unwrap().diff.contains("+b"));
        assert!(diff(&dir, "../fora").is_err());

        stage(&dir, "a.txt", true).unwrap();
        assert_eq!(status(&dir).unwrap().unwrap().files[0].staged, Staged::Full);
        stage(&dir, "a.txt", false).unwrap();
        assert_eq!(status(&dir).unwrap().unwrap().files[0].staged, Staged::None);

        discard(&dir, "a.txt").unwrap();
        discard(&dir, "novo.txt").unwrap();
        assert!(status(&dir).unwrap().unwrap().files.is_empty());
        assert_eq!(std::fs::read_to_string(dir.join("a.txt")).unwrap().replace("\r\n", "\n"), "1\n2\n3\n");
        let _ = std::fs::remove_dir_all(&dir);
    }
}
