//! Abas, grupos e divisões salvos entre aberturas do app (`session.json` na pasta de configuração).
//! O formato é do frontend (`SessionSnapshot` em src/features/tabs/tabs.ts), que valida ao restaurar;
//! aqui só se limita o tamanho e se grava de forma atômica (arquivo temporário + rename).

use std::fs;
use std::path::{Path, PathBuf};
use std::sync::Mutex;

use serde_json::Value;

/// Bem acima de 100 abas com pastas longas; acima disso é lixo.
pub const MAX_BYTES: usize = 256 * 1024;

pub struct SessionStore {
    path: PathBuf,
    lock: Mutex<()>,
}

impl SessionStore {
    pub fn new(dir: &Path) -> Self {
        Self { path: dir.join("session.json"), lock: Mutex::new(()) }
    }

    /// `None` se não existir, estiver grande demais ou não for um objeto JSON.
    pub fn load(&self) -> Option<Value> {
        let _guard = self.lock.lock().ok()?;
        let text = fs::read_to_string(&self.path).ok()?;
        if text.len() > MAX_BYTES {
            return None;
        }
        serde_json::from_str::<Value>(&text).ok().filter(Value::is_object)
    }

    pub fn save(&self, value: &Value) -> Result<(), String> {
        if !value.is_object() {
            return Err("a sessão precisa ser um objeto".into());
        }
        let text = serde_json::to_string(value).map_err(|e| e.to_string())?;
        if text.len() > MAX_BYTES {
            return Err("sessão grande demais".into());
        }
        let _guard = self.lock.lock().map_err(|_| "trava da sessão envenenada".to_string())?;
        if let Some(dir) = self.path.parent() {
            fs::create_dir_all(dir).map_err(|e| e.to_string())?;
        }
        let tmp = self.path.with_extension("json.tmp");
        fs::write(&tmp, text).map_err(|e| e.to_string())?;
        fs::rename(&tmp, &self.path).map_err(|e| e.to_string())
    }
}

/// Texto de cada aba (com as cores, serializado pelo xterm) em `scrollback/<id>.txt`, para reabrir
/// as abas com o fim da saída que tinham. O id vem do frontend e é só `[a-z0-9]`, de 1 a 32.
pub struct ScrollbackStore {
    dir: PathBuf,
    lock: Mutex<()>,
}

/// Uns 1000 linhas com cores; acima disso o frontend já cortou ou é lixo.
pub const MAX_SCROLLBACK: usize = 1024 * 1024;

pub fn is_valid_output_id(id: &str) -> bool {
    (1..=32).contains(&id.len()) && id.bytes().all(|b| b.is_ascii_lowercase() || b.is_ascii_digit())
}

impl ScrollbackStore {
    pub fn new(dir: &Path) -> Self {
        Self { dir: dir.join("scrollback"), lock: Mutex::new(()) }
    }

    fn file(&self, id: &str) -> Result<PathBuf, String> {
        if !is_valid_output_id(id) {
            return Err("id de saída inválido".into());
        }
        Ok(self.dir.join(format!("{id}.txt")))
    }

    pub fn load(&self, id: &str) -> Option<String> {
        let path = self.file(id).ok()?;
        let _guard = self.lock.lock().ok()?;
        let meta = fs::metadata(&path).ok()?;
        if meta.len() as usize > MAX_SCROLLBACK {
            return None;
        }
        fs::read_to_string(path).ok()
    }

    pub fn save(&self, id: &str, text: &str) -> Result<(), String> {
        let path = self.file(id)?;
        if text.len() > MAX_SCROLLBACK {
            return Err("saída grande demais".into());
        }
        let _guard = self.lock.lock().map_err(|_| "trava da saída envenenada".to_string())?;
        fs::create_dir_all(&self.dir).map_err(|e| e.to_string())?;
        let tmp = path.with_extension("txt.tmp");
        fs::write(&tmp, text).map_err(|e| e.to_string())?;
        fs::rename(&tmp, &path).map_err(|e| e.to_string())
    }

    /// Apaga as saídas de abas que não existem mais (fechadas ou de sessões antigas).
    pub fn prune(&self, keep: &[String]) -> usize {
        let Ok(_guard) = self.lock.lock() else { return 0 };
        let Ok(entries) = fs::read_dir(&self.dir) else { return 0 };
        let mut removed = 0;
        for entry in entries.flatten() {
            let name = entry.file_name().to_string_lossy().into_owned();
            let id = name.strip_suffix(".txt").or_else(|| name.strip_suffix(".txt.tmp")).unwrap_or("");
            if !keep.iter().any(|k| k == id) && fs::remove_file(entry.path()).is_ok() {
                removed += 1;
            }
        }
        removed
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    fn temp_dir(name: &str) -> PathBuf {
        let dir = std::env::temp_dir().join(format!("termo-session-{name}-{}", std::process::id()));
        let _ = fs::remove_dir_all(&dir);
        dir
    }

    #[test]
    fn scrollback_roundtrip_ids_and_prune() {
        let dir = temp_dir("scrollback");
        let store = ScrollbackStore::new(&dir);
        assert!(store.load("abc1").is_none());
        store.save("abc1", "\x1b[32mok\x1b[0m\r\n").unwrap();
        store.save("zz9", "outro").unwrap();
        assert_eq!(store.load("abc1").as_deref(), Some("\x1b[32mok\x1b[0m\r\n"));
        // Ids com caminho, maiúsculas ou vazios nunca viram arquivo.
        for bad in ["../x", "a/b", "ABC", "", "a.txt", &"a".repeat(33)] {
            assert!(store.save(bad, "x").is_err(), "{bad}");
            assert!(store.load(bad).is_none());
        }
        assert!(store.save("big", &"a".repeat(MAX_SCROLLBACK + 1)).is_err());
        assert_eq!(store.prune(&["abc1".to_string()]), 1);
        assert!(store.load("zz9").is_none());
        assert!(store.load("abc1").is_some());
        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn saves_and_loads() {
        let dir = temp_dir("roundtrip");
        let store = SessionStore::new(&dir);
        assert!(store.load().is_none());
        let v = json!({"version": 1, "tabs": [{"kind": "shell", "profile": "p"}]});
        store.save(&v).unwrap();
        assert_eq!(store.load(), Some(v));
        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn rejects_non_objects_and_huge_payloads() {
        let dir = temp_dir("limits");
        let store = SessionStore::new(&dir);
        assert!(store.save(&json!([1, 2])).is_err());
        let huge = json!({"x": "a".repeat(MAX_BYTES)});
        assert!(store.save(&huge).is_err());
        fs::create_dir_all(&dir).unwrap();
        fs::write(dir.join("session.json"), "não é json").unwrap();
        assert!(store.load().is_none());
        let _ = fs::remove_dir_all(&dir);
    }
}
