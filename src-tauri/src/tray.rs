//! Modo bandeja: ícone na área de notificação do Windows, com menu, e a janela principal que some
//! na bandeja em vez de fechar ou minimizar (as abas continuam rodando).
//!
//! As ações de aba ("Nova aba", "Claude Code") vão para a janela principal pelo evento `tray-action`;
//! o frontend abre a aba como faria o atalho.

use tauri::menu::{Menu, MenuItem, PredefinedMenuItem};
use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};
use tauri::{AppHandle, Emitter, Manager, WebviewWindow, Window};
use tauri_plugin_autostart::ManagerExt;

use crate::settings::{SettingsStore, TraySettings};

const TRAY_ID: &str = "termo";
/// Argumento com que o Windows abre o Termo no login (ver `autostart_plugin`).
pub const BACKGROUND_ARG: &str = "--background";

/// Plugin de iniciar com o Windows. O Termo aberto no login recebe `--background`.
pub fn autostart_plugin() -> tauri::plugin::TauriPlugin<tauri::Wry> {
    tauri_plugin_autostart::init(tauri_plugin_autostart::MacosLauncher::LaunchAgent, Some(vec![BACKGROUND_ARG]))
}

/// Ações do menu que viram aba na janela principal.
#[derive(Clone, Copy, Debug, PartialEq, Eq, serde::Serialize)]
#[serde(rename_all = "kebab-case")]
pub enum TabAction {
    NewTab,
    NewClaude,
}

/// Id do item do menu → ação.
pub fn tab_action(id: &str) -> Option<TabAction> {
    match id {
        "new-tab" => Some(TabAction::NewTab),
        "new-claude" => Some(TabAction::NewClaude),
        _ => None,
    }
}

fn main_window(app: &AppHandle) -> Option<WebviewWindow> {
    app.get_webview_window("main")
}

/// Traz a janela principal de volta (da bandeja, minimizada ou atrás de outras).
pub fn show_main(app: &AppHandle) {
    if let Some(w) = main_window(app) {
        let _ = w.show();
        let _ = w.unminimize();
        let _ = w.set_focus();
    }
}

fn toggle_main(app: &AppHandle) {
    let Some(w) = main_window(app) else { return };
    let visible = w.is_visible().unwrap_or(false) && !w.is_minimized().unwrap_or(false);
    if visible && w.is_focused().unwrap_or(false) {
        let _ = w.hide();
    } else {
        show_main(app);
    }
}

/// Cria o ícone (escondido se a opção estiver desligada) com o menu.
pub fn build(app: &AppHandle, settings: &TraySettings) -> tauri::Result<()> {
    let show = MenuItem::with_id(app, "show", "Mostrar o Termo", true, None::<&str>)?;
    let new_tab = MenuItem::with_id(app, "new-tab", "Nova aba", true, None::<&str>)?;
    let new_claude = MenuItem::with_id(app, "new-claude", "Nova aba com Claude Code", true, None::<&str>)?;
    let new_window = MenuItem::with_id(app, "new-window", "Nova janela", true, None::<&str>)?;
    let quit = MenuItem::with_id(app, "quit", "Sair do Termo", true, None::<&str>)?;
    let sep = || PredefinedMenuItem::separator(app);
    let menu = Menu::with_items(app, &[&show, &sep()?, &new_tab, &new_claude, &new_window, &sep()?, &quit])?;

    let mut builder = TrayIconBuilder::with_id(TRAY_ID)
        .tooltip("Termo")
        .menu(&menu)
        .show_menu_on_left_click(false)
        .on_menu_event(|app, event| match event.id.as_ref() {
            "show" => show_main(app),
            "new-window" => {
                let _ = crate::window::open(app, None);
            }
            "quit" => app.exit(0),
            id => {
                if let Some(action) = tab_action(id) {
                    show_main(app);
                    if let Some(w) = main_window(app) {
                        let _ = w.emit("tray-action", action);
                    }
                }
            }
        })
        .on_tray_icon_event(|tray, event| {
            if let TrayIconEvent::Click { button: MouseButton::Left, button_state: MouseButtonState::Up, .. } = event {
                toggle_main(tray.app_handle());
            }
        });
    if let Some(icon) = app.default_window_icon() {
        builder = builder.icon(icon.clone());
    }
    let tray = builder.build(app)?;
    tray.set_visible(settings.enabled)?;
    Ok(())
}

/// Mostra ou esconde o ícone conforme a configuração. Sem ícone, a janela principal não pode
/// ficar escondida: volta à tela.
pub fn apply(app: &AppHandle, settings: &TraySettings) {
    if let Some(tray) = app.tray_by_id(TRAY_ID) {
        let _ = tray.set_visible(settings.enabled);
    }
    if !settings.enabled {
        if let Some(w) = main_window(app) {
            if !w.is_visible().unwrap_or(true) {
                show_main(app);
            }
        }
    }
}

/// Liga ou desliga o "iniciar com o Windows" (registro do usuário), só se mudou.
pub fn apply_autostart(app: &AppHandle, enabled: bool) -> Result<(), String> {
    let launcher = app.autolaunch();
    let now = launcher.is_enabled().unwrap_or(false);
    if now == enabled {
        return Ok(());
    }
    let result = if enabled { launcher.enable() } else { launcher.disable() };
    result.map_err(|e| format!("não foi possível {} o início com o Windows: {e}", if enabled { "ligar" } else { "desligar" }))
}

/// Fechar ou minimizar a janela principal com a bandeja ligada: esconde em vez de fechar/minimizar.
/// Devolve `true` quando escondeu (o fechamento deve ser cancelado).
pub fn on_close_requested(window: &Window) -> bool {
    if window.label() != "main" {
        return false;
    }
    let Some(store) = window.try_state::<SettingsStore>() else { return false };
    if store.get().tray.hides_on_close() {
        let _ = window.hide();
        return true;
    }
    false
}

pub fn on_resized(window: &Window) {
    if window.label() != "main" || !window.is_minimized().unwrap_or(false) {
        return;
    }
    let Some(store) = window.try_state::<SettingsStore>() else { return };
    if store.get().tray.hides_on_minimize() {
        // Some da barra de tarefas; `show_main` desfaz o minimizar ao trazer de volta.
        let _ = window.hide();
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn menu_ids_map_to_tab_actions() {
        assert_eq!(tab_action("new-tab"), Some(TabAction::NewTab));
        assert_eq!(tab_action("new-claude"), Some(TabAction::NewClaude));
        assert_eq!(tab_action("quit"), None);
        assert_eq!(serde_json::to_string(&TabAction::NewClaude).unwrap(), "\"new-claude\"");
    }
}
