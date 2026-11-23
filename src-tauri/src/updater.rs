//! Atualização automática pelas releases do GitHub (tauri-plugin-updater, assinatura minisign).
//!
//! Tudo passa por comandos próprios: o frontend não recebe permissão do plugin. Ao abrir, com
//! `auto_update` ligado, procura uma versão nova e avisa as janelas pelo evento `update-available`;
//! instalar é sempre um clique do usuário.

use std::sync::Mutex;

use serde::Serialize;
use tauri::{AppHandle, Emitter, Manager};
use tauri_plugin_updater::{Update, UpdaterExt};

#[derive(Default)]
pub struct PendingUpdate(Mutex<Option<Update>>);

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateInfo {
    pub version: String,
    pub current: String,
    /// Notas da release (texto livre do GitHub), se houver.
    pub notes: Option<String>,
}

/// Procura uma versão nova. `None` quando já está na mais recente.
pub async fn check(app: &AppHandle) -> Result<Option<UpdateInfo>, String> {
    let update = app.updater().map_err(|e| e.to_string())?.check().await.map_err(|e| e.to_string())?;
    let info = update.as_ref().map(|u| UpdateInfo {
        version: u.version.clone(),
        current: u.current_version.clone(),
        notes: u.body.clone().filter(|b| !b.trim().is_empty()),
    });
    *app.state::<PendingUpdate>().0.lock().unwrap() = update;
    Ok(info)
}

/// Verificação silenciosa ao abrir: erros (sem rede, sem release) não incomodam ninguém.
pub fn check_on_startup(app: AppHandle) {
    // Em desenvolvimento a versão local não corresponde a nenhuma release.
    if cfg!(debug_assertions) {
        return;
    }
    tauri::async_runtime::spawn(async move {
        if let Ok(Some(info)) = check(&app).await {
            let _ = app.emit("update-available", info);
        }
    });
}

/// Baixa, instala e reinicia. O instalador NSIS fecha o app sozinho no Windows.
pub async fn install(app: &AppHandle) -> Result<(), String> {
    let update = app.state::<PendingUpdate>().0.lock().unwrap().take();
    let update = match update {
        Some(u) => u,
        None => match app.updater().map_err(|e| e.to_string())?.check().await.map_err(|e| e.to_string())? {
            Some(u) => u,
            None => return Err("o Termo já está na versão mais recente".into()),
        },
    };
    update.download_and_install(|_, _| {}, || {}).await.map_err(|e| format!("falha ao atualizar: {e}"))?;
    app.restart();
}
