//! Arquivo de configurações para levar a outra máquina (`termo-config.json`).
//!
//! Exportar grava as configurações atuais dentro de um envelope com o formato e a versão; importar lê um
//! arquivo escolhido no diálogo do sistema e devolve as configurações dele ao frontend, que mostra o que
//! vai mudar e aplica as seções escolhidas por `settings_set` (que valida tudo e registra atalho e
//! bandeja). Aqui só se confere o formato e o tamanho e se aponta as pastas e imagens que não existem
//! nesta máquina. Também aceita o `settings.json` cru da pasta de configuração.

use std::path::{Path, PathBuf};

use serde::Serialize;
use serde_json::{json, Value};
use tauri::AppHandle;
use tauri_plugin_dialog::DialogExt;

use crate::settings::Settings;

pub const FORMAT: &str = "termo-config";
pub const VERSION: u64 = 1;
/// Bem acima de 50 workflows, 20 layouts e 50 imagens de fundo com caminhos longos.
pub const MAX_BYTES: u64 = 1024 * 1024;
pub const DEFAULT_NAME: &str = "termo-config.json";

/// Chaves do `settings.json`; um objeto sem nenhuma delas não é configuração do Termo.
const KNOWN_KEYS: &[&str] = &[
    "theme",
    "fontFamily",
    "fontSize",
    "profiles",
    "workflows",
    "layouts",
    "highlights",
    "background",
    "defaultShell",
    "notifications",
    "tray",
];

#[derive(Clone, Debug, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct ImportFile {
    pub path: String,
    /// As configurações do arquivo como estão (só as chaves presentes); o frontend escolhe as seções.
    pub settings: Value,
    /// Versão do Termo que exportou; vazio no `settings.json` cru.
    pub app_version: String,
    /// Quando foi exportado (ISO 8601); vazio no `settings.json` cru.
    pub exported_at: String,
    /// Pastas e imagens citadas no arquivo que não existem nesta máquina.
    pub missing: Vec<String>,
}

/// O conteúdo do arquivo exportado.
pub fn envelope(settings: &Settings, exported_at: &str) -> Result<String, String> {
    let value = json!({
        "format": FORMAT,
        "version": VERSION,
        "appVersion": env!("CARGO_PKG_VERSION"),
        "exportedAt": exported_at,
        "settings": settings,
    });
    serde_json::to_string_pretty(&value).map_err(|e| e.to_string())
}

/// Lê o texto do arquivo: o envelope do Termo ou o `settings.json` cru. Devolve
/// `(configurações, versão do app, data)`.
pub fn parse(text: &str) -> Result<(Value, String, String), String> {
    let text = text.trim_start_matches('\u{feff}');
    let value: Value = serde_json::from_str(text).map_err(|_| "o arquivo não é um JSON válido".to_string())?;
    let Value::Object(obj) = value else { return Err("o arquivo não é uma configuração do Termo".into()) };
    if obj.get("format").and_then(Value::as_str) == Some(FORMAT) {
        let version = obj.get("version").and_then(Value::as_u64).unwrap_or(0);
        if version == 0 {
            return Err("o arquivo não diz a versão do formato".into());
        }
        if version > VERSION {
            return Err("o arquivo foi exportado por uma versão mais nova do Termo: atualize antes de importar".into());
        }
        let settings = match obj.get("settings") {
            Some(s @ Value::Object(_)) => s.clone(),
            _ => return Err("o arquivo não tem as configurações".into()),
        };
        let text_of = |k: &str| obj.get(k).and_then(Value::as_str).unwrap_or_default().chars().take(40).collect();
        return Ok((settings, text_of("appVersion"), text_of("exportedAt")));
    }
    if KNOWN_KEYS.iter().any(|k| obj.contains_key(*k)) {
        return Ok((Value::Object(obj), String::new(), String::new()));
    }
    Err("o arquivo não é uma configuração do Termo".into())
}

/// Caminho absoluto do Windows (`C:\...` ou `\\servidor\...`). Os outros (`/home/...` do WSL, `~`)
/// não dá para conferir daqui e ficam de fora.
fn is_windows_absolute(p: &str) -> bool {
    let b = p.as_bytes();
    p.starts_with(r"\\") || (b.len() >= 3 && b[0].is_ascii_alphabetic() && b[1] == b':' && (b[2] == b'\\' || b[2] == b'/'))
}

/// Pastas e imagens citadas nas configurações: pasta inicial, pasta e pastas fixadas dos perfis,
/// imagens de fundo e pastas das abas dos layouts.
pub fn referenced_paths(settings: &Value) -> Vec<String> {
    let mut out: Vec<String> = Vec::new();
    let mut push = |v: Option<&Value>| {
        if let Some(s) = v.and_then(Value::as_str).map(str::trim) {
            if !s.is_empty() && is_windows_absolute(s) && !out.iter().any(|o| o == s) {
                out.push(s.to_string());
            }
        }
    };
    let list = |v: Option<&Value>| v.and_then(Value::as_array).cloned().unwrap_or_default();
    push(settings.get("defaultCwd"));
    for p in list(settings.get("profiles")) {
        push(p.get("cwd"));
        for pin in list(p.get("pinned")) {
            push(Some(&pin));
        }
    }
    for img in list(settings.get("background").and_then(|b| b.get("images"))) {
        push(Some(&img));
    }
    for l in list(settings.get("layouts")) {
        for t in list(l.get("tabs")) {
            push(t.get("cwd"));
        }
    }
    out
}

pub fn missing_paths(settings: &Value) -> Vec<String> {
    referenced_paths(settings).into_iter().filter(|p| !Path::new(p).exists()).collect()
}

/// Abre o "Salvar como" e grava o arquivo. `None` se a pessoa cancelou.
pub fn export(app: &AppHandle, settings: &Settings, exported_at: &str) -> Result<Option<String>, String> {
    let contents = envelope(settings, exported_at)?;
    let picked = app
        .dialog()
        .file()
        .set_title("Exportar as configurações do Termo")
        .set_file_name(DEFAULT_NAME)
        .add_filter("Configurações do Termo", &["json"])
        .blocking_save_file();
    let Some(picked) = picked else { return Ok(None) };
    let mut path: PathBuf = picked.into_path().map_err(|e| e.to_string())?;
    if path.extension().and_then(|e| e.to_str()).map(|e| e.eq_ignore_ascii_case("json")) != Some(true) {
        path.set_extension("json");
    }
    std::fs::write(&path, contents).map_err(|e| format!("não deu para gravar {}: {e}", path.display()))?;
    Ok(Some(path.to_string_lossy().into_owned()))
}

/// Agora em ISO 8601 (UTC), para o `exportedAt` do `termo config export` (o da tela vem do frontend).
pub fn now_iso() -> String {
    let secs = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0);
    iso_from_unix(secs)
}

fn iso_from_unix(secs: u64) -> String {
    let (days, rem) = (secs / 86_400, secs % 86_400);
    // Dias desde 1970-01-01 para data civil (algoritmo de Howard Hinnant).
    let z = days as i64 + 719_468;
    let era = z.div_euclid(146_097);
    let doe = z - era * 146_097;
    let yoe = (doe - doe / 1460 + doe / 36_524 - doe / 146_096) / 365;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
    let mp = (5 * doy + 2) / 153;
    let day = doy - (153 * mp + 2) / 5 + 1;
    let month = if mp < 10 { mp + 3 } else { mp - 9 };
    let year = yoe + era * 400 + i64::from(month <= 2);
    format!("{year:04}-{month:02}-{day:02}T{:02}:{:02}:{:02}.000Z", rem / 3600, rem % 3600 / 60, rem % 60)
}

/// `termo config export <arquivo>`: grava sem diálogo. Uma pasta recebe o `termo-config.json`;
/// arquivo que já existe só é trocado com `force`. Devolve o caminho gravado.
pub fn export_to(path: &Path, settings: &Settings, force: bool) -> Result<PathBuf, String> {
    let path = if path.is_dir() { path.join(DEFAULT_NAME) } else { path.to_path_buf() };
    if path.exists() && !force {
        return Err(format!("{} já existe (use --force para trocar)", path.display()));
    }
    let contents = envelope(settings, &now_iso())?;
    std::fs::write(&path, contents).map_err(|e| format!("não deu para gravar {}: {e}", path.display()))?;
    Ok(path)
}

/// Lê um arquivo já escolhido: tamanho, formato e pastas que faltam.
pub fn read_file(path: &Path) -> Result<ImportFile, String> {
    let meta = std::fs::metadata(path).map_err(|e| format!("não deu para abrir {}: {e}", path.display()))?;
    if meta.len() > MAX_BYTES {
        return Err("o arquivo é grande demais para ser uma configuração do Termo".into());
    }
    let text = std::fs::read_to_string(path).map_err(|e| format!("não deu para ler {}: {e}", path.display()))?;
    let (settings, app_version, exported_at) = parse(&text)?;
    let missing = missing_paths(&settings);
    Ok(ImportFile { path: path.to_string_lossy().into_owned(), settings, app_version, exported_at, missing })
}

/// Abre o diálogo para escolher o arquivo e lê. `None` se a pessoa cancelou.
pub fn pick_and_read(app: &AppHandle) -> Result<Option<ImportFile>, String> {
    let picked = app
        .dialog()
        .file()
        .set_title("Importar configurações do Termo")
        .add_filter("Configurações do Termo", &["json"])
        .blocking_pick_file();
    let Some(picked) = picked else { return Ok(None) };
    let path = picked.into_path().map_err(|e| e.to_string())?;
    read_file(&path).map(Some)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn exported_file_reads_back() {
        let s = Settings { font_size: 17, theme: "dracula".into(), ..Default::default() };
        let text = envelope(&s, "2026-11-26T18:00:00.000Z").unwrap();
        let (settings, app_version, exported_at) = parse(&text).unwrap();
        assert_eq!(settings["fontSize"], 17);
        assert_eq!(settings["theme"], "dracula");
        assert_eq!(app_version, env!("CARGO_PKG_VERSION"));
        assert_eq!(exported_at, "2026-11-26T18:00:00.000Z");
        // O envelope tem tudo o que o Settings tem: ler de volta dá as mesmas configurações.
        let back: Settings = serde_json::from_value(settings).unwrap();
        assert_eq!(back, s);
    }

    #[test]
    fn accepts_raw_settings_json_and_bom() {
        let (settings, v, at) = parse("\u{feff}{\"fontSize\": 12, \"theme\": \"nord\"}").unwrap();
        assert_eq!(settings["theme"], "nord");
        assert!(v.is_empty() && at.is_empty());
    }

    #[test]
    fn rejects_other_files() {
        assert!(parse("não é json").is_err());
        assert!(parse("[1, 2]").is_err());
        assert!(parse(r#"{"name": "pacote", "version": "1.0.0"}"#).is_err());
        assert!(parse(r#"{"format": "termo-config", "settings": {}}"#).is_err(), "sem versão");
        assert!(parse(r#"{"format": "termo-config", "version": 1}"#).is_err(), "sem configurações");
        assert!(parse(r#"{"format": "termo-config", "version": 1, "settings": []}"#).is_err());
        let newer = parse(r#"{"format": "termo-config", "version": 99, "settings": {}}"#).unwrap_err();
        assert!(newer.contains("mais nova"));
    }

    #[test]
    fn lists_windows_paths_once() {
        let settings = json!({
            "defaultCwd": r"D:\estudos",
            "profiles": [
                { "id": "a", "cwd": r"D:\estudos", "pinned": [r"C:\x", "/home/eu"] },
                { "id": "b", "cwd": "" }
            ],
            "background": { "images": [r"\\nas\fotos\a.png", "~/b.png"] },
            "layouts": [{ "name": "L", "tabs": [{ "cwd": "C:/y" }, { "cwd": "/mnt/c" }] }]
        });
        assert_eq!(referenced_paths(&settings), vec![r"D:\estudos", r"C:\x", r"\\nas\fotos\a.png", "C:/y"]);
    }

    #[test]
    fn missing_paths_are_the_ones_not_on_disk() {
        let here = std::env::temp_dir();
        let here = here.to_string_lossy();
        let settings = json!({ "defaultCwd": here, "profiles": [{ "pinned": [r"Q:\nao\existe\termo"] }] });
        assert_eq!(missing_paths(&settings), vec![r"Q:\nao\existe\termo".to_string()]);
    }

    #[test]
    fn iso_dates() {
        assert_eq!(iso_from_unix(0), "1970-01-01T00:00:00.000Z");
        assert_eq!(iso_from_unix(951_782_400), "2000-02-29T00:00:00.000Z");
        assert_eq!(iso_from_unix(1_795_710_896), "2026-11-26T16:34:56.000Z");
    }

    #[test]
    fn export_to_refuses_to_overwrite_without_force() {
        let dir = std::env::temp_dir().join(format!("termo-config-export-{}", std::process::id()));
        std::fs::create_dir_all(&dir).unwrap();
        let s = Settings::default();
        let written = export_to(&dir, &s, false).unwrap();
        assert_eq!(written, dir.join(DEFAULT_NAME));
        assert!(export_to(&written, &s, false).unwrap_err().contains("--force"));
        assert!(export_to(&written, &s, true).is_ok());
        assert_eq!(read_file(&written).unwrap().settings["theme"], "system");
        std::fs::remove_dir_all(&dir).ok();
    }

    #[test]
    fn rejects_huge_files() {
        let dir = std::env::temp_dir().join(format!("termo-config-test-{}", std::process::id()));
        std::fs::create_dir_all(&dir).unwrap();
        let big = dir.join("grande.json");
        std::fs::write(&big, vec![b' '; (MAX_BYTES + 1) as usize]).unwrap();
        assert!(read_file(&big).unwrap_err().contains("grande demais"));
        let ok = dir.join("ok.json");
        std::fs::write(&ok, r#"{"theme": "nord"}"#).unwrap();
        assert_eq!(read_file(&ok).unwrap().settings["theme"], "nord");
        std::fs::remove_dir_all(&dir).ok();
    }
}
