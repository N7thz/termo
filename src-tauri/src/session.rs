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
