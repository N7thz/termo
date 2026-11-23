//! Avisos do Windows (central de notificações) e o piscar da barra de tarefas.
//!
//! O frontend decide quando avisar (Claude esperando você, comando longo que terminou com a janela
//! sem foco); aqui só se limita o texto e se confere a configuração, para o aviso nunca sair com
//! as notificações desligadas.

use tauri::{AppHandle, UserAttentionType, WebviewWindow};
use tauri_plugin_notification::NotificationExt;

use crate::settings::SettingsStore;

const MAX_TITLE: usize = 80;
const MAX_BODY: usize = 240;

/// Corta em `max` caracteres (não bytes), com reticências, e troca quebras de linha por espaço.
pub fn clip(text: &str, max: usize) -> String {
    let flat: String = text.split_whitespace().collect::<Vec<_>>().join(" ");
    if flat.chars().count() <= max {
        return flat;
    }
    let mut out: String = flat.chars().take(max.saturating_sub(1)).collect();
    out.push('…');
    out
}

pub fn show(app: &AppHandle, window: &WebviewWindow, settings: &SettingsStore, title: &str, body: &str) -> Result<(), String> {
    if !settings.get().notifications.enabled {
        return Ok(());
    }
    // Pisca o ícone na barra de tarefas até a janela receber o foco.
    let _ = window.request_user_attention(Some(UserAttentionType::Informational));
    app.notification()
        .builder()
        .title(clip(title, MAX_TITLE))
        .body(clip(body, MAX_BODY))
        .show()
        .map_err(|e| e.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn clips_by_chars_and_flattens_lines() {
        assert_eq!(clip("a\n b\tc", 10), "a b c");
        assert_eq!(clip("ééééé", 3), "éé…");
        assert_eq!(clip("abc", 3), "abc");
    }
}
