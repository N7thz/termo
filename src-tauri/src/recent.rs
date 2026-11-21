//! Pastas recentes (estilo zoxide): cada prompt registra a pasta atual; as mais visitadas e
//! recentes aparecem nas sugestões de `cd` de qualquer lugar. Na primeira vez, o histórico é
//! semeado com os projetos que o Claude Code já conhece (`~/.claude/projects`).

use std::fs;
use std::path::{Path, PathBuf};
use std::sync::Mutex;
use std::time::{SystemTime, UNIX_EPOCH};

use serde::{Deserialize, Serialize};

const MAX_ENTRIES: usize = 300;

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq)]
pub struct Entry {
    pub path: String,
    pub visits: u32,
    /// Segundos desde 1970.
    pub last: u64,
}

fn now() -> u64 {
    SystemTime::now().duration_since(UNIX_EPOCH).map(|d| d.as_secs()).unwrap_or(0)
}

/// Frecência: visitas pesadas pela idade da última visita (como o zoxide).
pub fn score(e: &Entry, now: u64) -> f64 {
    let age = now.saturating_sub(e.last);
    let weight = match age {
        a if a < 3_600 => 4.0,
        a if a < 86_400 => 2.0,
        a if a < 604_800 => 0.5,
        _ => 0.25,
    };
    f64::from(e.visits) * weight
}

fn same_path(a: &str, b: &str) -> bool {
    if cfg!(windows) {
        a.eq_ignore_ascii_case(b)
    } else {
        a == b
    }
}

pub struct RecentDirs {
    file: PathBuf,
    entries: Mutex<Vec<Entry>>,
}

impl RecentDirs {
    pub fn load(config_dir: &Path, home: Option<&Path>) -> Self {
        let file = config_dir.join("recent-dirs.json");
        let mut entries: Vec<Entry> =
            fs::read_to_string(&file).ok().and_then(|s| serde_json::from_str(&s).ok()).unwrap_or_default();
        if entries.is_empty() {
            if let Some(home) = home {
                let t = now();
                entries = claude_projects(&home.join(".claude").join("projects"))
                    .into_iter()
                    .map(|p| Entry { path: p.to_string_lossy().into_owned(), visits: 1, last: t.saturating_sub(86_400) })
                    .collect();
            }
        }
        Self { file, entries: Mutex::new(entries) }
    }

    /// Registra uma visita (ignora pastas que não existem).
    pub fn record(&self, path: &str) {
        let path = path.trim().trim_end_matches(['\\', '/']);
        let path = if path.len() == 2 && path.ends_with(':') { format!("{path}\\") } else { path.to_string() };
        if path.is_empty() || !Path::new(&path).is_dir() {
            return;
        }
        let t = now();
        let mut list = self.entries.lock().unwrap();
        match list.iter_mut().find(|e| same_path(&e.path, &path)) {
            Some(e) => {
                // Prompts seguidos na mesma pasta contam uma visita só.
                if t.saturating_sub(e.last) > 60 {
                    e.visits = e.visits.saturating_add(1);
                }
                e.last = t;
            }
            None => list.push(Entry { path, visits: 1, last: t }),
        }
        list.sort_by(|a, b| score(b, t).total_cmp(&score(a, t)));
        list.truncate(MAX_ENTRIES);
        if let Ok(json) = serde_json::to_string(&*list) {
            if let Some(dir) = self.file.parent() {
                let _ = fs::create_dir_all(dir);
            }
            let tmp = self.file.with_extension("json.tmp");
            if fs::write(&tmp, json).is_ok() {
                let _ = fs::rename(&tmp, &self.file);
            }
        }
    }

    /// Pastas da mais para a menos relevante (só as que ainda existem).
    pub fn ranked(&self) -> Vec<PathBuf> {
        let t = now();
        let mut list = self.entries.lock().unwrap().clone();
        list.sort_by(|a, b| score(b, t).total_cmp(&score(a, t)));
        list.into_iter().map(|e| PathBuf::from(e.path)).filter(|p| p.is_dir()).collect()
    }
}

/// Converte os nomes de `~/.claude/projects` (`D--estudos-open-finance-bank`) de volta em pastas.
/// O Claude troca `:`, `\` e `/` por `-`, então o nome é ambíguo quando a pasta tem hífen; aqui
/// a ambiguidade é resolvida olhando o que existe no disco.
pub fn claude_projects(dir: &Path) -> Vec<PathBuf> {
    let Ok(read) = fs::read_dir(dir) else { return Vec::new() };
    read.flatten()
        .filter(|e| e.file_type().map(|t| t.is_dir()).unwrap_or(false))
        .filter_map(|e| decode_project_name(&e.file_name().to_string_lossy()))
        .collect()
}

pub fn decode_project_name(name: &str) -> Option<PathBuf> {
    let (root, rest) = if cfg!(windows) {
        let mut chars = name.chars();
        let drive = chars.next().filter(|c| c.is_ascii_alphabetic())?;
        let rest = name.get(1..)?.strip_prefix("--")?;
        (PathBuf::from(format!("{drive}:\\")), rest)
    } else {
        (PathBuf::from("/"), name.strip_prefix('-')?)
    };
    if rest.is_empty() {
        return None;
    }
    let tokens: Vec<&str> = rest.split('-').collect();
    walk(&root, &tokens).filter(|p| p.is_dir())
}

/// Busca em profundidade: cada pedaço junta-se ao anterior com `-` ou começa uma subpasta.
fn walk(base: &Path, tokens: &[&str]) -> Option<PathBuf> {
    if tokens.is_empty() {
        return Some(base.to_path_buf());
    }
    for take in 1..=tokens.len() {
        let segment = tokens[..take].join("-");
        if segment.is_empty() {
            continue;
        }
        let next = base.join(&segment);
        if next.is_dir() {
            if let Some(found) = walk(&next, &tokens[take..]) {
                return Some(found);
            }
        }
    }
    None
}

#[cfg(test)]
mod tests {
    use super::*;

    fn temp(name: &str) -> PathBuf {
        let d = std::env::temp_dir().join(format!("termo-recent-{name}-{}", std::process::id()));
        let _ = fs::remove_dir_all(&d);
        fs::create_dir_all(&d).unwrap();
        d
    }

    #[test]
    fn walk_resolves_hyphenated_folders() {
        let root = temp("walk");
        fs::create_dir_all(root.join("estudos").join("open-finance-bank")).unwrap();
        fs::create_dir_all(root.join("estudos").join("open")).unwrap();
        let found = walk(&root, &["estudos", "open", "finance", "bank"]).unwrap();
        assert_eq!(found, root.join("estudos").join("open-finance-bank"));
        assert!(walk(&root, &["nada"]).is_none());
        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn records_and_ranks() {
        let root = temp("rank");
        let (a, b) = (root.join("a"), root.join("b"));
        fs::create_dir_all(&a).unwrap();
        fs::create_dir_all(&b).unwrap();
        let store = RecentDirs::load(&root.join("cfg"), None);
        store.record(&a.to_string_lossy());
        store.record(&b.to_string_lossy());
        // Força mais visitas em b.
        store.entries.lock().unwrap().iter_mut().find(|e| e.path.ends_with('b')).unwrap().visits = 5;
        assert_eq!(store.ranked()[0], b);
        store.record(&root.join("nao-existe").to_string_lossy());
        assert_eq!(store.ranked().len(), 2);
        // Persiste.
        let again = RecentDirs::load(&root.join("cfg"), None);
        assert_eq!(again.ranked().len(), 2);
        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn score_prefers_recent() {
        let t = 10_000_000;
        let fresh = Entry { path: "x".into(), visits: 1, last: t - 10 };
        let old = Entry { path: "y".into(), visits: 3, last: t - 2_000_000 };
        assert!(score(&fresh, t) > score(&old, t));
    }
}
