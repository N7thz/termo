//! Arquivo de esquema de cores de outro terminal (Windows Terminal, iTerm2, Ghostty, Alacritty, kitty),
//! escolhido no diálogo do sistema. Aqui só se lê o texto com limite de tamanho; o formato é
//! reconhecido e convertido no frontend (src/features/theme/importScheme.ts), e o resultado é gravado
//! nas configurações (`custom_themes`), que validam as cores.

use std::path::Path;

use serde::Serialize;
use tauri::AppHandle;
use tauri_plugin_dialog::DialogExt;

/// Bem acima de um `settings.json` do Windows Terminal com dezenas de esquemas.
pub const MAX_BYTES: u64 = 1024 * 1024;

#[derive(Debug, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct SchemeFile {
    /// Nome do arquivo (sem a pasta): vira o nome do tema quando o formato não traz um.
    pub file_name: String,
    pub text: String,
}

pub fn read(path: &Path) -> Result<SchemeFile, String> {
    let meta = std::fs::metadata(path).map_err(|e| format!("não deu para abrir {}: {e}", path.display()))?;
    if meta.len() > MAX_BYTES {
        return Err("o arquivo é grande demais para ser um esquema de cores".into());
    }
    let bytes = std::fs::read(path).map_err(|e| format!("não deu para ler {}: {e}", path.display()))?;
    let text = String::from_utf8(bytes).map_err(|_| "o arquivo não é texto (UTF-8)".to_string())?;
    let file_name = path.file_name().map(|n| n.to_string_lossy().into_owned()).unwrap_or_default();
    Ok(SchemeFile { file_name, text })
}

/// Abre o diálogo e lê o arquivo escolhido. `None` se a pessoa cancelou.
pub fn pick_and_read(app: &AppHandle) -> Result<Option<SchemeFile>, String> {
    let picked = app
        .dialog()
        .file()
        .set_title("Importar esquema de cores")
        .add_filter("Esquemas de cores", &["json", "itermcolors", "toml", "conf", "yml", "yaml", "txt"])
        .add_filter("Todos os arquivos (Ghostty)", &["*"])
        .blocking_pick_file();
    let Some(picked) = picked else { return Ok(None) };
    let path = picked.into_path().map_err(|e| e.to_string())?;
    read(&path).map(Some)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn reads_text_and_refuses_big_or_binary_files() {
        let dir = std::env::temp_dir().join(format!("termo-theme-import-{}", std::process::id()));
        std::fs::create_dir_all(&dir).unwrap();
        let ok = dir.join("tema.toml");
        std::fs::write(&ok, "[colors.primary]\nbackground = '#000000'\n").unwrap();
        let got = read(&ok).unwrap();
        assert_eq!(got.file_name, "tema.toml");
        assert!(got.text.starts_with("[colors.primary]"));
        let big = dir.join("grande.json");
        std::fs::write(&big, vec![b' '; (MAX_BYTES + 1) as usize]).unwrap();
        assert!(read(&big).unwrap_err().contains("grande demais"));
        let bin = dir.join("x.itermcolors");
        std::fs::write(&bin, [0xff, 0xfe, 0x00, 0x80]).unwrap();
        assert!(read(&bin).unwrap_err().contains("UTF-8"));
        std::fs::remove_dir_all(&dir).ok();
    }
}
