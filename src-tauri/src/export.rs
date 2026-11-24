//! Salvar um bloco exportado (texto ou imagem PNG) onde a pessoa escolher, pelo diálogo do sistema.
//!
//! O frontend não tem permissão para gravar arquivos: manda os bytes e a extensão, e este módulo abre o
//! diálogo "Salvar como" e grava só no caminho escolhido ali.

use std::path::PathBuf;

use tauri::AppHandle;
use tauri_plugin_dialog::DialogExt;

/// Limite do arquivo exportado (uma imagem de bloco enorme ainda cabe com folga).
pub const MAX_BYTES: usize = 32 * 1024 * 1024;

/// Extensões aceitas e o nome do filtro no diálogo.
fn filter_name(ext: &str) -> Option<&'static str> {
    match ext {
        "txt" => Some("Texto"),
        "md" => Some("Markdown"),
        "png" => Some("Imagem PNG"),
        _ => None,
    }
}

/// Nome sugerido sem pastas nem caracteres proibidos no Windows, sempre com a extensão certa.
pub fn safe_name(name: &str, ext: &str) -> String {
    let cleaned: String = name
        .chars()
        .map(|c| if c.is_control() || r#"<>:"/\|?*"#.contains(c) { '-' } else { c })
        .collect();
    let stem = cleaned.trim().trim_matches('.');
    let stem = stem.strip_suffix(&format!(".{ext}")).unwrap_or(stem);
    let stem: String = stem.chars().take(80).collect();
    let stem = if stem.trim().is_empty() { "saida".to_string() } else { stem };
    format!("{stem}.{ext}")
}

pub fn check(ext: &str, len: usize) -> Result<&'static str, String> {
    let filter = filter_name(ext).ok_or_else(|| format!("extensão não suportada: {ext}"))?;
    if len > MAX_BYTES {
        return Err("arquivo grande demais para exportar".into());
    }
    Ok(filter)
}

/// Abre o "Salvar como" e grava os bytes. `None` se a pessoa cancelou.
pub fn save(app: &AppHandle, name: &str, ext: &str, data: &[u8]) -> Result<Option<String>, String> {
    let filter = check(ext, data.len())?;
    let picked = app
        .dialog()
        .file()
        .set_title("Exportar o bloco")
        .set_file_name(safe_name(name, ext))
        .add_filter(filter, &[ext])
        .blocking_save_file();
    let Some(picked) = picked else { return Ok(None) };
    let mut path: PathBuf = picked.into_path().map_err(|e| e.to_string())?;
    if path.extension().and_then(|e| e.to_str()).map(|e| e.eq_ignore_ascii_case(ext)) != Some(true) {
        path.set_extension(ext);
    }
    std::fs::write(&path, data).map_err(|e| format!("não deu para gravar {}: {e}", path.display()))?;
    Ok(Some(path.to_string_lossy().into_owned()))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn names_are_safe() {
        assert_eq!(safe_name("bun-test", "txt"), "bun-test.txt");
        assert_eq!(safe_name(r"a/b\c:d", "png"), "a-b-c-d.png");
        assert_eq!(safe_name("saida.png", "png"), "saida.png");
        assert_eq!(safe_name("  ", "md"), "saida.md");
        assert_eq!(safe_name("..", "txt"), "saida.txt");
    }

    #[test]
    fn only_known_extensions_and_sizes() {
        assert!(check("txt", 10).is_ok());
        assert!(check("exe", 10).is_err());
        assert!(check("png", MAX_BYTES + 1).is_err());
    }
}
