//! Painel de navegador ao lado do terminal: um webview filho nativo, sobreposto à área que a
//! interface reserva para ele. O React mede essa área e manda as coordenadas (em pixels lógicos).
//!
//! Segurança: a página é remota, e capabilities só valem para a origem local, então ela não
//! alcança nenhum comando do Termo. Além disso, só navega em http/https.

use serde::{Deserialize, Serialize};
use tauri::webview::{NewWindowResponse, PageLoadEvent, WebviewBuilder};
use tauri::{AppHandle, Emitter, LogicalPosition, LogicalSize, Manager, Rect, Url, WebviewUrl};

/// Cada janela do Termo tem o seu painel: o webview filho se chama `browser-<janela>`.
fn label(owner: &str) -> String {
    format!("browser-{owner}")
}

/// Área do painel, em pixels lógicos (os mesmos do CSS com zoom 100%).
#[derive(Clone, Copy, Debug, Deserialize)]
pub struct Bounds {
    pub x: f64,
    pub y: f64,
    pub width: f64,
    pub height: f64,
}

impl Bounds {
    fn rect(self) -> Rect {
        Rect {
            position: LogicalPosition::new(self.x.max(0.0), self.y.max(0.0)).into(),
            size: LogicalSize::new(self.width.max(1.0), self.height.max(1.0)).into(),
        }
    }
}

/// O que o painel avisa à interface: endereço atual, se está carregando e o título da página.
#[derive(Clone, Debug, Serialize)]
#[serde(tag = "type", rename_all = "camelCase")]
pub enum BrowserEvent {
    Nav { url: String, loading: bool },
    Title { title: String },
}

/// Aceita só endereços http/https, como o `open_url`.
pub fn parse_web_url(raw: &str) -> Result<Url, String> {
    let url = Url::parse(raw.trim()).map_err(|_| format!("endereço inválido: {raw}"))?;
    match url.scheme() {
        "http" | "https" => Ok(url),
        other => Err(format!("o painel só abre http/https, não {other}:")),
    }
}

fn emit(app: &AppHandle, owner: &str, ev: BrowserEvent) {
    let _ = app.emit_to(owner, "browser", ev);
}

/// Abre `url` no painel (cria o webview na primeira vez) e o posiciona em `bounds`.
pub fn open(app: &AppHandle, owner: &str, url: Url, bounds: Bounds) -> Result<(), String> {
    let me = label(owner);
    if let Some(view) = app.get_webview(&me) {
        view.navigate(url).map_err(|e| e.to_string())?;
        view.set_bounds(bounds.rect()).map_err(|e| e.to_string())?;
        return view.show().map_err(|e| e.to_string());
    }

    let window = app.get_window(owner).ok_or("janela não encontrada")?;
    let (on_load, on_title, on_popup) = (app.clone(), app.clone(), app.clone());
    let (load_owner, title_owner, popup_label) = (owner.to_string(), owner.to_string(), me.clone());
    let builder = WebviewBuilder::new(&me, WebviewUrl::External(url))
        .on_navigation(|url| matches!(url.scheme(), "http" | "https" | "about"))
        .on_page_load(move |_, payload| {
            let loading = matches!(payload.event(), PageLoadEvent::Started);
            emit(&on_load, &load_owner, BrowserEvent::Nav { url: payload.url().to_string(), loading });
        })
        .on_document_title_changed(move |_, title| emit(&on_title, &title_owner, BrowserEvent::Title { title }))
        // Links com target=_blank e window.open: abrem no próprio painel, sem janelas soltas.
        .on_new_window(move |url, _| {
            if matches!(url.scheme(), "http" | "https") {
                let app = on_popup.clone();
                let popup_label = popup_label.clone();
                tauri::async_runtime::spawn(async move {
                    if let Some(view) = app.get_webview(&popup_label) {
                        let _ = view.navigate(url);
                    }
                });
            }
            NewWindowResponse::Deny
        });
    let rect = bounds.rect();
    window.add_child(builder, rect.position, rect.size).map_err(|e| e.to_string())?;
    Ok(())
}

pub fn set_bounds(app: &AppHandle, owner: &str, bounds: Bounds) -> Result<(), String> {
    match app.get_webview(&label(owner)) {
        Some(view) => view.set_bounds(bounds.rect()).map_err(|e| e.to_string()),
        None => Ok(()),
    }
}

/// Esconde o painel por baixo de menus e diálogos da interface (o webview nativo fica por cima do HTML).
pub fn set_visible(app: &AppHandle, owner: &str, visible: bool) -> Result<(), String> {
    match app.get_webview(&label(owner)) {
        Some(view) if visible => view.show().map_err(|e| e.to_string()),
        Some(view) => view.hide().map_err(|e| e.to_string()),
        None => Ok(()),
    }
}

/// Voltar, avançar ou recarregar a página do painel.
pub fn go(app: &AppHandle, owner: &str, action: &str) -> Result<(), String> {
    let Some(view) = app.get_webview(&label(owner)) else { return Ok(()) };
    match action {
        "back" => view.eval("history.back()"),
        "forward" => view.eval("history.forward()"),
        "reload" => view.reload(),
        other => return Err(format!("ação desconhecida: {other}")),
    }
    .map_err(|e| e.to_string())
}

pub fn close(app: &AppHandle, owner: &str) -> Result<(), String> {
    match app.get_webview(&label(owner)) {
        Some(view) => view.close().map_err(|e| e.to_string()),
        None => Ok(()),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn accepts_only_web_urls() {
        assert!(parse_web_url("https://tauri.app/").is_ok());
        assert!(parse_web_url("  http://localhost:5173 ").is_ok());
        assert!(parse_web_url("file:///C:/Windows/win.ini").is_err());
        assert!(parse_web_url("javascript:alert(1)").is_err());
        assert!(parse_web_url("não é url").is_err());
    }

    #[test]
    fn one_panel_per_window() {
        assert_eq!(label("main"), "browser-main");
        assert_ne!(label("main"), label("termo-2"));
    }

    #[test]
    fn bounds_never_negative_or_empty() {
        let r = Bounds { x: -5.0, y: 10.0, width: 0.0, height: 300.0 }.rect();
        let pos: tauri::LogicalPosition<f64> = match r.position {
            tauri::Position::Logical(p) => p,
            _ => unreachable!(),
        };
        let size: tauri::LogicalSize<f64> = match r.size {
            tauri::Size::Logical(s) => s,
            _ => unreachable!(),
        };
        assert_eq!((pos.x, pos.y), (0.0, 10.0));
        assert_eq!((size.width, size.height), (1.0, 300.0));
    }
}
