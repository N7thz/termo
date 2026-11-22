//! Várias janelas: cada uma é uma cópia da janela principal (mesma configuração do tauri.conf.json) com
//! um rótulo `termo-<n>`. Abas, painel de navegador e processos são de cada janela; só a `main` salva e
//! reabre a sessão.

use std::sync::atomic::{AtomicU32, Ordering};

use tauri::{AppHandle, WebviewUrl, WebviewWindowBuilder};

static NEXT: AtomicU32 = AtomicU32::new(2);

/// Rótulo da próxima janela (precisa casar com `termo-*` em capabilities/default.json).
pub fn next_label() -> String {
    format!("termo-{}", NEXT.fetch_add(1, Ordering::Relaxed))
}

/// Endereço da interface; `cwd` vai na query para a primeira aba abrir na mesma pasta.
pub fn url_for(cwd: Option<&str>) -> String {
    match cwd.filter(|c| !c.is_empty()) {
        Some(c) => format!("index.html?cwd={}", urlencoding(c)),
        None => "index.html".into(),
    }
}

fn urlencoding(s: &str) -> String {
    s.bytes()
        .map(|b| match b {
            b'A'..=b'Z' | b'a'..=b'z' | b'0'..=b'9' | b'-' | b'_' | b'.' | b'~' => (b as char).to_string(),
            _ => format!("%{b:02X}"),
        })
        .collect()
}

/// Abre uma janela nova, com a configuração da principal.
pub fn open(app: &AppHandle, cwd: Option<&str>) -> Result<(), String> {
    let mut cfg = app.config().app.windows.first().cloned().ok_or("configuração da janela não encontrada")?;
    let label = next_label();
    cfg.label = label.clone();
    cfg.url = WebviewUrl::App(url_for(cwd).into());
    WebviewWindowBuilder::from_config(app, &cfg)
        .map_err(|e| e.to_string())?
        .build()
        .map(|_| ())
        .map_err(|e| format!("não foi possível abrir a janela: {e}"))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn labels_are_unique() {
        let (a, b) = (next_label(), next_label());
        assert!(a.starts_with("termo-") && b.starts_with("termo-"));
        assert_ne!(a, b);
    }

    #[test]
    fn cwd_goes_encoded_in_the_query() {
        assert_eq!(url_for(None), "index.html");
        assert_eq!(url_for(Some("")), "index.html");
        assert_eq!(url_for(Some(r"D:\estudos\meu app")), "index.html?cwd=D%3A%5Cestudos%5Cmeu%20app");
        assert_eq!(url_for(Some("ç")), "index.html?cwd=%C3%A7");
    }
}
