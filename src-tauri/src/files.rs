//! Busca de arquivos para a busca geral (Ctrl+P): lista os arquivos da pasta (pelo git quando
//! dá, respeitando o .gitignore; senão percorrendo a pasta) e ordena por correspondência difusa.

use std::collections::HashMap;
use std::fs;
use std::path::{Path, PathBuf};
use std::process::Command;
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};

use serde::Serialize;

const MAX_FILES: usize = 20_000;
const MAX_DEPTH: usize = 6;
const CACHE_TTL: Duration = Duration::from_secs(15);
const SKIP_DIRS: &[&str] = &[".git", "node_modules", "target", "dist", "build", "out", ".next", ".turbo", ".cache"];

#[derive(Debug, Clone, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct FileHit {
    /// Caminho relativo à pasta, com `/`.
    pub path: String,
    pub score: i32,
}

fn git_ls_files(cwd: &Path) -> Option<Vec<String>> {
    let mut cmd = Command::new("git");
    cmd.arg("-C").arg(cwd).args(["ls-files", "-co", "--exclude-standard"]).env("GIT_OPTIONAL_LOCKS", "0");
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        cmd.creation_flags(0x0800_0000);
    }
    let out = cmd.output().ok()?;
    if !out.status.success() {
        return None;
    }
    Some(String::from_utf8_lossy(&out.stdout).lines().take(MAX_FILES).map(str::to_string).collect())
}

fn walk(root: &Path, dir: &Path, depth: usize, out: &mut Vec<String>) {
    if depth > MAX_DEPTH || out.len() >= MAX_FILES {
        return;
    }
    let Ok(entries) = fs::read_dir(dir) else { return };
    for entry in entries.flatten() {
        if out.len() >= MAX_FILES {
            return;
        }
        let name = entry.file_name().to_string_lossy().into_owned();
        let Ok(kind) = entry.file_type() else { continue };
        if kind.is_dir() {
            if !SKIP_DIRS.contains(&name.as_str()) {
                walk(root, &entry.path(), depth + 1, out);
            }
        } else if kind.is_file() {
            if let Ok(rel) = entry.path().strip_prefix(root) {
                out.push(rel.to_string_lossy().replace('\\', "/"));
            }
        }
    }
}

pub fn list_files(cwd: &Path) -> Vec<String> {
    git_ls_files(cwd).unwrap_or_else(|| {
        let mut out = Vec::new();
        walk(cwd, cwd, 0, &mut out);
        out
    })
}

/// Correspondência difusa: as letras da busca aparecem em ordem no caminho. Pontua mais quando
/// caem no nome do arquivo, em sequência ou no começo de um pedaço (`/`, `-`, `_`, `.`, maiúscula).
pub fn fuzzy_score(path: &str, query: &str) -> Option<i32> {
    let query: Vec<char> = query.chars().filter(|c| !c.is_whitespace()).flat_map(char::to_lowercase).collect();
    if query.is_empty() {
        return Some(0);
    }
    let chars: Vec<char> = path.chars().collect();
    let base_start = path.rfind('/').map(|i| path[..=i].chars().count()).unwrap_or(0);
    let mut score = 0;
    let mut qi = 0;
    let mut prev: Option<usize> = None;
    for (i, &c) in chars.iter().enumerate() {
        if qi == query.len() {
            break;
        }
        if c.to_lowercase().next() == Some(query[qi]) {
            score += 1;
            if i >= base_start {
                score += 2;
            }
            if prev == Some(i.wrapping_sub(1)) {
                score += 4;
            }
            let boundary = i == 0
                || matches!(chars[i - 1], '/' | '-' | '_' | '.' | ' ')
                || (c.is_uppercase() && chars[i - 1].is_lowercase());
            if boundary {
                score += 3;
            }
            prev = Some(i);
            qi += 1;
        }
    }
    (qi == query.len()).then(|| score * 10 - chars.len() as i32 / 4)
}

pub fn search(files: &[String], query: &str, limit: usize) -> Vec<FileHit> {
    let mut hits: Vec<FileHit> = files
        .iter()
        .filter_map(|p| fuzzy_score(p, query).map(|score| FileHit { path: p.clone(), score }))
        .collect();
    hits.sort_by(|a, b| b.score.cmp(&a.score).then_with(|| a.path.len().cmp(&b.path.len())));
    hits.truncate(limit);
    hits
}

/// Guarda a lista de arquivos de cada pasta por alguns segundos (a paleta busca a cada tecla).
#[derive(Default)]
pub struct FileIndex {
    cache: Mutex<HashMap<PathBuf, (Instant, Arc<Vec<String>>)>>,
}

impl FileIndex {
    pub fn files(&self, cwd: &Path) -> Arc<Vec<String>> {
        if let Some((at, files)) = self.cache.lock().unwrap().get(cwd) {
            if at.elapsed() < CACHE_TTL {
                return files.clone();
            }
        }
        let files = Arc::new(list_files(cwd));
        let mut cache = self.cache.lock().unwrap();
        if cache.len() > 32 {
            cache.clear();
        }
        cache.insert(cwd.to_path_buf(), (Instant::now(), files.clone()));
        files
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn files() -> Vec<String> {
        ["src/App.tsx", "src/features/tabs/tabs.ts", "src-tauri/src/lib.rs", "README.md", "src/features/app-shell.ts"]
            .map(String::from)
            .to_vec()
    }

    #[test]
    fn prefers_file_name_and_boundaries() {
        let hits = search(&files(), "app", 10);
        assert_eq!(hits[0].path, "src/App.tsx");
        assert!(hits.iter().any(|h| h.path == "src/features/app-shell.ts"));
        assert!(!hits.iter().any(|h| h.path == "README.md"));
    }

    #[test]
    fn subsequence_across_folders() {
        let hits = search(&files(), "ftabs", 10);
        assert_eq!(hits[0].path, "src/features/tabs/tabs.ts");
        assert!(fuzzy_score("src/lib.rs", "xyz").is_none());
    }

    #[test]
    fn empty_query_lists_shortest_first() {
        let hits = search(&files(), "", 2);
        assert_eq!(hits.len(), 2);
        assert_eq!(hits[0].path, "README.md");
    }

    #[test]
    fn walk_skips_heavy_folders() {
        let dir = std::env::temp_dir().join(format!("termo-files-{}", std::process::id()));
        let _ = fs::remove_dir_all(&dir);
        fs::create_dir_all(dir.join("node_modules/x")).unwrap();
        fs::create_dir_all(dir.join("src")).unwrap();
        fs::write(dir.join("node_modules/x/i.js"), "").unwrap();
        fs::write(dir.join("src/a.ts"), "").unwrap();
        let mut out = Vec::new();
        walk(&dir, &dir, 0, &mut out);
        assert_eq!(out, vec!["src/a.ts".to_string()]);
        fs::remove_dir_all(dir).unwrap();
    }
}
