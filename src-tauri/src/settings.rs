//! Configurações em `<app config>/settings.json`, com validação e gravação atômica.

use std::fs;
use std::path::{Path, PathBuf};
use std::sync::Mutex;

use serde::{Deserialize, Serialize};

pub const FONT_MIN: u16 = 9;
pub const FONT_MAX: u16 = 32;

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase", default)]
pub struct Settings {
    /// Abre a primeira aba já rodando o Claude Code.
    pub start_with_claude: bool,
    pub font_family: String,
    pub font_size: u16,
    /// Pasta inicial das abas novas. Vazio = pasta do usuário.
    pub default_cwd: String,
    /// Sugestões do PSReadLine (histórico) numa lista abaixo do cursor. Vale para abas novas.
    pub shell_predictions: bool,
    /// Id do tema (`system`, `termo-dark`, `dracula`...). O frontend cai no padrão se não conhecer.
    pub theme: String,
    /// Destaques na saída do terminal.
    pub highlights: HighlightSettings,
}

pub const MAX_RULES: usize = 20;
pub const MAX_PATTERN: usize = 200;

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase", default)]
pub struct HighlightSettings {
    /// Caminhos `arquivo:linha:coluna` clicáveis (abrem no VS Code).
    pub file_links: bool,
    /// Marca linhas de erro/aviso e conta nas abas em segundo plano.
    pub severity: bool,
    /// Hashes do git clicáveis (copiam).
    pub git_hashes: bool,
    /// `localhost:porta` e IPs clicáveis.
    pub network: bool,
    /// Regras próprias: regex + cor.
    pub rules: Vec<HighlightRule>,
}

impl Default for HighlightSettings {
    fn default() -> Self {
        Self {
            file_links: true,
            severity: true,
            git_hashes: true,
            network: true,
            rules: vec![HighlightRule { pattern: r"\b(TODO|FIXME|HACK)\b".into(), color: "#e0af68".into() }],
        }
    }
}

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq)]
pub struct HighlightRule {
    pub pattern: String,
    pub color: String,
}

impl HighlightSettings {
    /// Mantém só regras com padrão não vazio (até 200 caracteres) e cor `#rrggbb`, no máximo 20.
    fn sanitized(mut self) -> Self {
        self.rules = self
            .rules
            .into_iter()
            .map(|r| HighlightRule { pattern: r.pattern.trim().to_string(), color: r.color.trim().to_ascii_lowercase() })
            .filter(|r| {
                !r.pattern.is_empty()
                    && r.pattern.len() <= MAX_PATTERN
                    && r.color.len() == 7
                    && r.color.starts_with('#')
                    && r.color[1..].chars().all(|c| c.is_ascii_hexdigit())
            })
            .take(MAX_RULES)
            .collect();
        self
    }
}

impl Default for Settings {
    fn default() -> Self {
        Self {
            start_with_claude: false,
            font_family: "'JetBrains Mono', 'Cascadia Code', 'Fira Code', Consolas, monospace".into(),
            font_size: 14,
            default_cwd: String::new(),
            shell_predictions: true,
            theme: "system".into(),
            highlights: HighlightSettings::default(),
        }
    }
}

#[derive(Debug, Default, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SettingsPatch {
    pub start_with_claude: Option<bool>,
    pub font_family: Option<String>,
    pub font_size: Option<u16>,
    pub default_cwd: Option<String>,
    pub shell_predictions: Option<bool>,
    pub theme: Option<String>,
    /// Substitui todos os destaques de uma vez (já validados no apply).
    pub highlights: Option<HighlightSettings>,
}

/// Ids de tema: letras minúsculas, números e hífen, até 40 caracteres.
fn is_valid_theme_id(id: &str) -> bool {
    !id.is_empty() && id.len() <= 40 && id.chars().all(|c| c.is_ascii_lowercase() || c.is_ascii_digit() || c == '-')
}

impl Settings {
    /// Aplica o patch já validado: fonte limitada, textos aparados.
    pub fn apply(&mut self, patch: SettingsPatch) {
        if let Some(v) = patch.start_with_claude {
            self.start_with_claude = v;
        }
        if let Some(v) = patch.font_family {
            let v = v.trim();
            if !v.is_empty() && v.len() <= 300 {
                self.font_family = v.to_string();
            }
        }
        if let Some(v) = patch.font_size {
            self.font_size = v.clamp(FONT_MIN, FONT_MAX);
        }
        if let Some(v) = patch.default_cwd {
            self.default_cwd = v.trim().to_string();
        }
        if let Some(v) = patch.shell_predictions {
            self.shell_predictions = v;
        }
        if let Some(v) = patch.theme {
            if is_valid_theme_id(&v) {
                self.theme = v;
            }
        }
        if let Some(v) = patch.highlights {
            self.highlights = v.sanitized();
        }
    }
}

pub struct SettingsStore {
    path: PathBuf,
    current: Mutex<Settings>,
}

impl SettingsStore {
    pub fn load(dir: &Path) -> Self {
        let path = dir.join("settings.json");
        let current = fs::read_to_string(&path)
            .ok()
            .and_then(|s| serde_json::from_str::<Settings>(&s).ok())
            .map(|mut s| {
                // Arquivo editado à mão pode trazer valores fora da faixa.
                s.font_size = s.font_size.clamp(FONT_MIN, FONT_MAX);
                s
            })
            .unwrap_or_default();
        Self { path, current: Mutex::new(current) }
    }

    pub fn get(&self) -> Settings {
        self.current.lock().unwrap().clone()
    }

    pub fn update(&self, patch: SettingsPatch) -> Result<Settings, String> {
        let mut cur = self.current.lock().unwrap();
        let mut next = cur.clone();
        next.apply(patch);
        if next != *cur {
            write_atomic(&self.path, &serde_json::to_string_pretty(&next).map_err(|e| e.to_string())?)
                .map_err(|e| format!("não foi possível salvar as configurações: {e}"))?;
            *cur = next;
        }
        Ok(cur.clone())
    }
}

/// Grava num `.tmp` e renomeia: uma queda no meio não corrompe o arquivo.
fn write_atomic(path: &Path, contents: &str) -> std::io::Result<()> {
    if let Some(dir) = path.parent() {
        fs::create_dir_all(dir)?;
    }
    let tmp = path.with_extension("json.tmp");
    fs::write(&tmp, contents)?;
    fs::rename(&tmp, path)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn clamps_font_size() {
        let mut s = Settings::default();
        s.apply(SettingsPatch { font_size: Some(1), ..Default::default() });
        assert_eq!(s.font_size, FONT_MIN);
        s.apply(SettingsPatch { font_size: Some(500), ..Default::default() });
        assert_eq!(s.font_size, FONT_MAX);
    }

    #[test]
    fn accepts_only_valid_theme_ids() {
        let mut s = Settings::default();
        s.apply(SettingsPatch { theme: Some("dracula".into()), ..Default::default() });
        assert_eq!(s.theme, "dracula");
        for bad in ["", "Dracula", "../x", "a b", &"x".repeat(41)] {
            s.apply(SettingsPatch { theme: Some(bad.to_string()), ..Default::default() });
            assert_eq!(s.theme, "dracula");
        }
    }

    #[test]
    fn sanitizes_highlight_rules() {
        let mut s = Settings::default();
        let mut rules = vec![
            HighlightRule { pattern: " ok ".into(), color: "#AABBCC".into() },
            HighlightRule { pattern: "".into(), color: "#aabbcc".into() },
            HighlightRule { pattern: "x".into(), color: "red".into() },
            HighlightRule { pattern: "y".repeat(MAX_PATTERN + 1), color: "#aabbcc".into() },
        ];
        rules.extend((0..30).map(|i| HighlightRule { pattern: format!("r{i}"), color: "#000000".into() }));
        s.apply(SettingsPatch {
            highlights: Some(HighlightSettings { rules, severity: false, ..Default::default() }),
            ..Default::default()
        });
        assert!(!s.highlights.severity);
        assert_eq!(s.highlights.rules.len(), MAX_RULES);
        assert_eq!(s.highlights.rules[0], HighlightRule { pattern: "ok".into(), color: "#aabbcc".into() });
    }

    #[test]
    fn old_settings_file_gets_default_highlights() {
        let s: Settings = serde_json::from_str(r#"{"theme":"dracula"}"#).unwrap();
        assert_eq!(s.highlights, HighlightSettings::default());
    }

    #[test]
    fn ignores_empty_font_family() {
        let mut s = Settings::default();
        let before = s.font_family.clone();
        s.apply(SettingsPatch { font_family: Some("   ".into()), ..Default::default() });
        assert_eq!(s.font_family, before);
    }

    #[test]
    fn persists_and_reloads() {
        let dir = std::env::temp_dir().join(format!("termo-test-{}", std::process::id()));
        let store = SettingsStore::load(&dir);
        store
            .update(SettingsPatch { start_with_claude: Some(true), font_size: Some(18), ..Default::default() })
            .unwrap();
        let again = SettingsStore::load(&dir);
        assert!(again.get().start_with_claude);
        assert_eq!(again.get().font_size, 18);
        let _ = fs::remove_dir_all(dir);
    }
}
