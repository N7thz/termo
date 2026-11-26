//! Cor de fundo da janela antes da interface carregar. A janela nasce com a cor fixa do tauri.conf.json;
//! aqui ela troca pela do último tema usado (guardada num arquivo pela interface), para não piscar
//! escuro num tema claro enquanto o WebView sobe.

use std::path::PathBuf;

use tauri::window::Color;
use tauri::{AppHandle, Manager, WebviewWindow};

const FILE: &str = "window-color";

/// Só `#rrggbb`: a cor vem da interface e vai para um arquivo e para a janela.
pub fn parse(hex: &str) -> Option<Color> {
    let h = hex.strip_prefix('#')?;
    if h.len() != 6 || !h.bytes().all(|b| b.is_ascii_hexdigit()) {
        return None;
    }
    let v = u32::from_str_radix(h, 16).ok()?;
    Some(Color((v >> 16) as u8, (v >> 8) as u8, v as u8, 255))
}

fn file(app: &AppHandle) -> Option<PathBuf> {
    app.path().app_config_dir().ok().map(|d| d.join(FILE))
}

/// A cor guardada, se houver uma válida.
pub fn saved(app: &AppHandle) -> Option<Color> {
    parse(std::fs::read_to_string(file(app)?).ok()?.trim())
}

/// Na subida: pinta a janela principal com a cor guardada.
pub fn apply_saved(app: &AppHandle) {
    if let (Some(color), Some(w)) = (saved(app), app.get_webview_window("main")) {
        if let Err(e) = w.set_background_color(Some(color)) {
            log::warn!("cor da janela: {e}");
        }
    }
}

/// Tema trocado: pinta a janela que pediu e guarda a cor para a próxima abertura.
#[tauri::command]
pub fn set_window_color(window: WebviewWindow, color: String) -> Result<(), String> {
    let c = parse(&color).ok_or("cor inválida")?;
    window.set_background_color(Some(c)).map_err(|e| e.to_string())?;
    let path = file(window.app_handle()).ok_or("pasta de configuração não encontrada")?;
    let current = std::fs::read_to_string(&path).unwrap_or_default();
    if current.trim() != color {
        std::fs::write(&path, &color).map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_only_hex_rgb() {
        assert_eq!(parse("#0f1117").map(|c| (c.0, c.1, c.2, c.3)), Some((0x0f, 0x11, 0x17, 255)));
        assert!(parse("0f1117").is_none());
        assert!(parse("#fff").is_none());
        assert!(parse("#0f1117ff").is_none());
        assert!(parse("#zzzzzz").is_none());
        assert!(parse("").is_none());
    }
}
