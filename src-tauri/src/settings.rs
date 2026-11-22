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
    /// Partes da janela: abas na lateral, barra de status e diff do git no topo.
    pub layout: LayoutSettings,
    /// Perfis (como no Dia): cada um com as suas abas, cor de moldura, pasta inicial e pastas fixadas.
    pub profiles: Vec<Profile>,
    /// Onde os links do terminal abrem: `panel` (painel ao lado) ou `browser` (navegador do sistema).
    pub link_target: String,
    /// Tamanho da interface: `small`, `medium` ou `large` (zoom do webview).
    pub interface_size: String,
}

const INTERFACE_SIZES: [&str; 3] = ["small", "medium", "large"];

pub const MAX_PROFILES: usize = 9;
pub const MAX_PINNED: usize = 12;

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase", default)]
pub struct Profile {
    /// Letras minúsculas, números e hífen, até 40 caracteres; único na lista.
    pub id: String,
    pub name: String,
    /// Tom do tema (`green`, `accent`...) que tinge a moldura; a cor real vem do tema ativo.
    pub color: String,
    /// Pasta inicial das abas deste perfil. Vazio = a pasta inicial geral.
    pub cwd: String,
    /// Pastas fixadas na lateral.
    pub pinned: Vec<String>,
}

impl Default for Profile {
    fn default() -> Self {
        Self {
            id: String::new(),
            name: String::new(),
            color: "accent".into(),
            cwd: String::new(),
            pinned: Vec::new(),
        }
    }
}

fn default_profiles() -> Vec<Profile> {
    vec![
        Profile {
            id: "trabalho".into(),
            name: "Trabalho".into(),
            color: "green".into(),
            ..Default::default()
        },
        Profile {
            id: "pessoal".into(),
            name: "Pessoal".into(),
            color: "yellow".into(),
            ..Default::default()
        },
    ]
}

/// Tons do tema aceitos como cor de perfil (mesma lista de PROFILE_COLORS no front).
pub const PROFILE_TONES: [&str; 8] = [
    "green", "yellow", "accent", "magenta", "cyan", "red", "blue", "claude",
];

fn is_hex_color(c: &str) -> bool {
    c.len() == 7 && c.starts_with('#') && c[1..].chars().all(|c| c.is_ascii_hexdigit())
}

/// Até 9 perfis válidos e de id único; nome com 1 a 30 caracteres; lista vazia volta aos padrões.
fn sanitize_profiles(list: Vec<Profile>) -> Vec<Profile> {
    let mut out: Vec<Profile> = Vec::new();
    for p in list {
        let name = p.name.trim().to_string();
        // Cor fixa (`#rrggbb`, de uma versão anterior) vira tom do tema, para seguir o tema escolhido.
        let color = match p.color.trim().to_ascii_lowercase() {
            c if c == "#4fb38a" => "green".to_string(),
            c if c == "#d39a5c" => "yellow".to_string(),
            c if is_hex_color(&c) => "accent".to_string(),
            c => c,
        };
        if !is_valid_theme_id(&p.id)
            || out.iter().any(|o| o.id == p.id)
            || name.is_empty()
            || name.chars().count() > 30
            || !PROFILE_TONES.contains(&color.as_str())
        {
            continue;
        }
        let cwd = p.cwd.trim();
        let pinned = p
            .pinned
            .into_iter()
            .map(|d| d.trim().to_string())
            .filter(|d| !d.is_empty() && d.len() <= 1000)
            .take(MAX_PINNED)
            .collect();
        out.push(Profile {
            id: p.id,
            name,
            color,
            cwd: if cwd.len() <= 1000 {
                cwd.to_string()
            } else {
                String::new()
            },
            pinned,
        });
        if out.len() == MAX_PROFILES {
            break;
        }
    }
    if out.is_empty() {
        default_profiles()
    } else {
        out
    }
}

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase", default)]
pub struct LayoutSettings {
    pub sidebar: bool,
    pub status_bar: bool,
    pub diff_badge: bool,
}

impl Default for LayoutSettings {
    fn default() -> Self {
        Self {
            sidebar: true,
            status_bar: true,
            diff_badge: true,
        }
    }
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
            rules: vec![HighlightRule {
                pattern: r"\b(TODO|FIXME|HACK)\b".into(),
                color: "#e0af68".into(),
            }],
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
            .map(|r| HighlightRule {
                pattern: r.pattern.trim().to_string(),
                color: r.color.trim().to_ascii_lowercase(),
            })
            .filter(|r| {
                !r.pattern.is_empty() && r.pattern.len() <= MAX_PATTERN && is_hex_color(&r.color)
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
            font_family: "'JetBrains Mono', 'Cascadia Code', 'Fira Code', Consolas, monospace"
                .into(),
            font_size: 14,
            default_cwd: String::new(),
            shell_predictions: true,
            theme: "system".into(),
            highlights: HighlightSettings::default(),
            layout: LayoutSettings::default(),
            profiles: default_profiles(),
            link_target: "panel".into(),
            interface_size: "medium".into(),
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
    pub layout: Option<LayoutSettings>,
    /// Substitui a lista inteira de perfis (validada no apply).
    pub profiles: Option<Vec<Profile>>,
    pub link_target: Option<String>,
    pub interface_size: Option<String>,
}

/// Ids de tema: letras minúsculas, números e hífen, até 40 caracteres.
fn is_valid_theme_id(id: &str) -> bool {
    !id.is_empty()
        && id.len() <= 40
        && id
            .chars()
            .all(|c| c.is_ascii_lowercase() || c.is_ascii_digit() || c == '-')
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
        if let Some(v) = patch.layout {
            self.layout = v;
        }
        if let Some(v) = patch.profiles {
            self.profiles = sanitize_profiles(v);
        }
        if let Some(v) = patch.interface_size {
            if INTERFACE_SIZES.contains(&v.as_str()) {
                self.interface_size = v;
            }
        }
        if let Some(v) = patch.link_target {
            if v == "panel" || v == "browser" {
                self.link_target = v;
            }
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
                s.profiles = sanitize_profiles(std::mem::take(&mut s.profiles));
                if s.link_target != "panel" && s.link_target != "browser" {
                    s.link_target = "panel".into();
                }
                if !INTERFACE_SIZES.contains(&s.interface_size.as_str()) {
                    s.interface_size = "medium".into();
                }
                s
            })
            .unwrap_or_default();
        Self {
            path,
            current: Mutex::new(current),
        }
    }

    pub fn get(&self) -> Settings {
        self.current.lock().unwrap().clone()
    }

    pub fn update(&self, patch: SettingsPatch) -> Result<Settings, String> {
        let mut cur = self.current.lock().unwrap();
        let mut next = cur.clone();
        next.apply(patch);
        if next != *cur {
            write_atomic(
                &self.path,
                &serde_json::to_string_pretty(&next).map_err(|e| e.to_string())?,
            )
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
        s.apply(SettingsPatch {
            font_size: Some(1),
            ..Default::default()
        });
        assert_eq!(s.font_size, FONT_MIN);
        s.apply(SettingsPatch {
            font_size: Some(500),
            ..Default::default()
        });
        assert_eq!(s.font_size, FONT_MAX);
    }

    #[test]
    fn accepts_only_valid_theme_ids() {
        let mut s = Settings::default();
        s.apply(SettingsPatch {
            theme: Some("dracula".into()),
            ..Default::default()
        });
        assert_eq!(s.theme, "dracula");
        for bad in ["", "Dracula", "../x", "a b", &"x".repeat(41)] {
            s.apply(SettingsPatch {
                theme: Some(bad.to_string()),
                ..Default::default()
            });
            assert_eq!(s.theme, "dracula");
        }
    }

    #[test]
    fn sanitizes_highlight_rules() {
        let mut s = Settings::default();
        let mut rules = vec![
            HighlightRule {
                pattern: " ok ".into(),
                color: "#AABBCC".into(),
            },
            HighlightRule {
                pattern: "".into(),
                color: "#aabbcc".into(),
            },
            HighlightRule {
                pattern: "x".into(),
                color: "red".into(),
            },
            HighlightRule {
                pattern: "y".repeat(MAX_PATTERN + 1),
                color: "#aabbcc".into(),
            },
        ];
        rules.extend((0..30).map(|i| HighlightRule {
            pattern: format!("r{i}"),
            color: "#000000".into(),
        }));
        s.apply(SettingsPatch {
            highlights: Some(HighlightSettings {
                rules,
                severity: false,
                ..Default::default()
            }),
            ..Default::default()
        });
        assert!(!s.highlights.severity);
        assert_eq!(s.highlights.rules.len(), MAX_RULES);
        assert_eq!(
            s.highlights.rules[0],
            HighlightRule {
                pattern: "ok".into(),
                color: "#aabbcc".into()
            }
        );
    }

    #[test]
    fn old_settings_file_gets_default_highlights() {
        let s: Settings = serde_json::from_str(r#"{"theme":"dracula"}"#).unwrap();
        assert_eq!(s.highlights, HighlightSettings::default());
    }

    #[test]
    fn sanitizes_profiles() {
        let mut s = Settings::default();
        let ok = Profile {
            id: "a".into(),
            name: " A ".into(),
            color: "#AABBCC".into(),
            ..Default::default()
        };
        // A cor fixa antiga vira o acento do tema.
        let mut list = vec![
            ok.clone(),
            Profile {
                id: "a".into(),
                name: "dup".into(),
                ..ok.clone()
            },
            Profile {
                id: "B C".into(),
                name: "x".into(),
                ..ok.clone()
            },
            Profile {
                id: "c".into(),
                name: "".into(),
                ..ok.clone()
            },
            Profile {
                id: "d".into(),
                name: "d".into(),
                color: "rosa".into(),
                ..Default::default()
            },
            Profile {
                id: "t".into(),
                name: "t".into(),
                color: "Cyan".into(),
                ..Default::default()
            },
            Profile {
                id: "e".into(),
                name: "e".into(),
                pinned: vec!["".into(), " D:/x ".into()],
                ..ok.clone()
            },
        ];
        list.extend((0..20).map(|i| Profile {
            id: format!("p{i}"),
            name: format!("p{i}"),
            ..ok.clone()
        }));
        s.apply(SettingsPatch {
            profiles: Some(list),
            ..Default::default()
        });
        assert_eq!(s.profiles.len(), MAX_PROFILES);
        assert_eq!(
            (s.profiles[0].name.as_str(), s.profiles[0].color.as_str()),
            ("A", "accent")
        );
        assert_eq!(
            (s.profiles[1].id.as_str(), s.profiles[1].color.as_str()),
            ("t", "cyan")
        );
        assert_eq!(s.profiles[2].id, "e");
        assert_eq!(s.profiles[2].pinned, vec!["D:/x".to_string()]);
        s.apply(SettingsPatch {
            profiles: Some(vec![]),
            ..Default::default()
        });
        assert_eq!(s.profiles, default_profiles());
    }

    #[test]
    fn accepts_only_known_interface_sizes() {
        let mut s = Settings::default();
        assert_eq!(s.interface_size, "medium");
        s.apply(SettingsPatch {
            interface_size: Some("large".into()),
            ..Default::default()
        });
        assert_eq!(s.interface_size, "large");
        s.apply(SettingsPatch {
            interface_size: Some("huge".into()),
            ..Default::default()
        });
        assert_eq!(s.interface_size, "large");
        let old: Settings = serde_json::from_str(r#"{"theme":"dracula"}"#).unwrap();
        assert_eq!(old.interface_size, "medium");
    }

    #[test]
    fn accepts_only_known_link_targets() {
        let mut s = Settings::default();
        assert_eq!(s.link_target, "panel");
        s.apply(SettingsPatch {
            link_target: Some("browser".into()),
            ..Default::default()
        });
        assert_eq!(s.link_target, "browser");
        s.apply(SettingsPatch {
            link_target: Some("arc".into()),
            ..Default::default()
        });
        assert_eq!(s.link_target, "browser");
    }

    #[test]
    fn ignores_empty_font_family() {
        let mut s = Settings::default();
        let before = s.font_family.clone();
        s.apply(SettingsPatch {
            font_family: Some("   ".into()),
            ..Default::default()
        });
        assert_eq!(s.font_family, before);
    }

    #[test]
    fn persists_and_reloads() {
        let dir = std::env::temp_dir().join(format!("termo-test-{}", std::process::id()));
        let store = SettingsStore::load(&dir);
        store
            .update(SettingsPatch {
                start_with_claude: Some(true),
                font_size: Some(18),
                ..Default::default()
            })
            .unwrap();
        let again = SettingsStore::load(&dir);
        assert!(again.get().start_with_claude);
        assert_eq!(again.get().font_size, 18);
        let _ = fs::remove_dir_all(dir);
    }
}
