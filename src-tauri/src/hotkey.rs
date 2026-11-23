//! Atalho global (estilo Quake): de qualquer programa, mostra o Termo; com o Termo na frente, minimiza.

use tauri::{AppHandle, Manager, WebviewWindow};
use tauri_plugin_global_shortcut::{GlobalShortcutExt, Shortcut, ShortcutState};

/// Plugin com o tratador do atalho. O registro em si é feito por [`apply`], a partir da configuração.
pub fn plugin() -> tauri::plugin::TauriPlugin<tauri::Wry> {
    tauri_plugin_global_shortcut::Builder::new()
        .with_handler(|app, _shortcut, event| {
            if event.state == ShortcutState::Pressed {
                toggle(app);
            }
        })
        .build()
}

/// Troca o atalho registrado. Vazio desliga. Erro se a combinação for inválida ou outro programa já a usar;
/// nesse caso o atalho anterior continua valendo.
pub fn apply(app: &AppHandle, previous: &str, next: &str) -> Result<(), String> {
    let gs = app.global_shortcut();
    let parsed = if next.is_empty() {
        None
    } else {
        Some(next.parse::<Shortcut>().map_err(|e| format!("atalho inválido ({next}): {e}"))?)
    };
    if let Ok(old) = previous.parse::<Shortcut>() {
        let _ = gs.unregister(old);
    }
    let Some(shortcut) = parsed else { return Ok(()) };
    if let Err(e) = gs.register(shortcut) {
        // Volta ao anterior para não ficar sem nenhum.
        if let Ok(old) = previous.parse::<Shortcut>() {
            let _ = gs.register(old);
        }
        return Err(format!("não foi possível usar {next}: outro programa pode estar usando essa combinação ({e})"));
    }
    Ok(())
}

/// Janela alvo: a que teve o foco por último entre as do Termo (sem os painéis de navegador), senão a `main`.
fn target(app: &AppHandle) -> Option<WebviewWindow> {
    let windows = app.webview_windows();
    windows
        .values()
        .find(|w| w.is_focused().unwrap_or(false))
        .cloned()
        .or_else(|| windows.get("main").cloned())
        .or_else(|| windows.values().find(|w| w.label().starts_with("termo-")).cloned())
}

fn toggle(app: &AppHandle) {
    let Some(w) = target(app) else { return };
    let focused = w.is_focused().unwrap_or(false);
    let minimized = w.is_minimized().unwrap_or(false);
    let visible = w.is_visible().unwrap_or(true);
    if focused && !minimized && visible {
        let _ = w.minimize();
    } else {
        let _ = w.show();
        let _ = w.unminimize();
        let _ = w.set_focus();
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_common_combinations() {
        for ok in ["Alt+F12", "Ctrl+Shift+Space", "Ctrl+Alt+T", "Super+Backquote", "Alt+`"] {
            assert!(ok.parse::<Shortcut>().is_ok(), "{ok}");
        }
        assert!("Ctrl+Nada".parse::<Shortcut>().is_err());
    }
}
