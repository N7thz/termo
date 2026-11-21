mod editor;
mod paths;
mod pty;
mod recent;
mod settings;
mod shell;

use std::sync::Arc;

use serde::{Deserialize, Serialize};
use tauri::ipc::Channel;
use tauri::webview::PageLoadEvent;
use tauri::{AppHandle, Manager, RunEvent, State, Webview, WindowEvent};
use tauri_plugin_clipboard_manager::ClipboardExt;
use tauri_plugin_opener::OpenerExt;

use crate::pty::{PtyEvent, PtyManager, SpawnSpec};
use crate::settings::{Settings, SettingsPatch, SettingsStore};
use crate::shell::CliArgs;

type Ptys = Arc<PtyManager>;

#[derive(Deserialize, Clone, Copy, PartialEq)]
#[serde(rename_all = "camelCase")]
enum SessionKind {
    Shell,
    Claude,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct CreateSessionOptions {
    kind: SessionKind,
    cols: u16,
    rows: u16,
    cwd: Option<String>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct CreateSessionResult {
    id: u32,
    /// Avisos para mostrar no terminal (pasta inválida, Claude ausente...).
    warnings: Vec<String>,
    /// Pode diferir do pedido: sem Claude instalado, a aba vira shell.
    kind: &'static str,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct LaunchInfo {
    open_claude_first: bool,
    cwd: Option<String>,
    shell_name: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct ClipboardContent {
    text: Option<String>,
    has_image: bool,
}

#[tauri::command]
fn launch_info(cli: State<CliArgs>, settings: State<SettingsStore>) -> LaunchInfo {
    let s = settings.get();
    LaunchInfo {
        open_claude_first: cli.claude || s.start_with_claude,
        cwd: cli.cwd.clone().or_else(|| Some(s.default_cwd).filter(|c| !c.is_empty())),
        shell_name: shell::shell_name(&shell::detect_shell()),
    }
}

#[tauri::command]
fn pty_create(
    webview: Webview,
    ptys: State<Ptys>,
    settings: State<SettingsStore>,
    opts: CreateSessionOptions,
    on_event: Channel<PtyEvent>,
) -> Result<CreateSessionResult, String> {
    let mut warnings = Vec::new();
    let (cwd, cwd_warning) = shell::resolve_cwd(opts.cwd.as_deref());
    warnings.extend(cwd_warning);

    let claude = match opts.kind {
        SessionKind::Claude => match shell::find_claude() {
            Ok(path) => Some(path),
            Err(msg) => {
                warnings.push(msg);
                None
            }
        },
        SessionKind::Shell => None,
    };

    let shell_path = shell::detect_shell();
    let spec = SpawnSpec {
        shell: &shell_path,
        args: shell::shell_args(&shell_path, claude.as_deref(), settings.get().shell_predictions),
        cwd,
        cols: opts.cols,
        rows: opts.rows,
    };
    let id = ptys.spawn(webview.label(), spec, move |ev| on_event.send(ev).is_ok())?;
    Ok(CreateSessionResult { id, warnings, kind: if claude.is_some() { "claude" } else { "shell" } })
}

#[tauri::command]
fn pty_write(ptys: State<Ptys>, id: u32, data: String) -> Result<(), String> {
    ptys.write(id, &data)
}

#[tauri::command]
fn pty_resize(ptys: State<Ptys>, id: u32, cols: u16, rows: u16) -> Result<(), String> {
    ptys.resize(id, cols, rows)
}

#[tauri::command]
fn pty_ack(ptys: State<Ptys>, id: u32, bytes: usize) {
    ptys.ack(id, bytes)
}

#[tauri::command]
fn pty_kill(ptys: State<Ptys>, id: u32) {
    ptys.kill(id)
}

/// Pastas que combinam com o que foi digitado, cada uma com o `cd` pronto.
/// `async` para rodar fora da thread principal (disco lento ou pasta de rede).
#[tauri::command]
async fn suggest_paths(
    recent: State<'_, recent::RecentDirs>,
    cwd: String,
    query: String,
) -> Result<Vec<paths::PathSuggestion>, String> {
    let dir = std::path::Path::new(&cwd);
    if !dir.is_dir() || query.len() > 512 {
        return Ok(Vec::new());
    }
    Ok(paths::suggest(dir, &query, &recent.ranked()))
}

/// Registra a pasta atual de uma aba (a cada prompt) no histórico de pastas recentes.
#[tauri::command]
async fn record_dir(recent: State<'_, recent::RecentDirs>, path: String) -> Result<(), String> {
    recent.record(&path);
    Ok(())
}

#[tauri::command]
fn settings_get(settings: State<SettingsStore>) -> Settings {
    settings.get()
}

#[tauri::command]
fn settings_set(settings: State<SettingsStore>, patch: SettingsPatch) -> Result<Settings, String> {
    settings.update(patch)
}

#[tauri::command]
fn clipboard_read(app: AppHandle) -> ClipboardContent {
    let clip = app.clipboard();
    ClipboardContent {
        text: clip.read_text().ok().filter(|t| !t.is_empty()),
        has_image: clip.read_image().is_ok(),
    }
}

#[tauri::command]
fn clipboard_write(app: AppHandle, text: String) -> Result<(), String> {
    app.clipboard().write_text(text).map_err(|e| e.to_string())
}

/// Abre um arquivo citado na saída: VS Code na linha/coluna; sem VS Code, o app padrão do arquivo.
#[tauri::command]
async fn open_in_editor(
    app: AppHandle,
    path: String,
    line: Option<u32>,
    column: Option<u32>,
    cwd: Option<String>,
) -> Result<(), String> {
    let file = editor::resolve_file(&path, cwd.as_deref())?;
    if editor::open_in_vscode(&file, line, column) {
        return Ok(());
    }
    app.opener().open_path(file.to_string_lossy(), None::<&str>).map_err(|e| e.to_string())
}

#[tauri::command]
fn open_url(app: AppHandle, url: String) -> Result<(), String> {
    if !(url.starts_with("http://") || url.starts_with("https://")) {
        return Err("só links http(s) podem ser abertos".into());
    }
    app.opener().open_url(url, None::<&str>).map_err(|e| e.to_string())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let cli = shell::parse_cli(std::env::args());

    let app = tauri::Builder::default()
        .plugin(tauri_plugin_clipboard_manager::init())
        .plugin(tauri_plugin_opener::init())
        .setup(move |app| {
            let dir = app.path().app_config_dir()?;
            app.manage(SettingsStore::load(&dir));
            app.manage(recent::RecentDirs::load(&dir, dirs::home_dir().as_deref()));
            app.manage::<Ptys>(Arc::new(PtyManager::default()));
            app.manage(cli);
            Ok(())
        })
        // Recarregar a página (Ctrl+R, HMR, travamento) não pode deixar shells órfãos.
        .on_page_load(|webview, payload| {
            if payload.event() == PageLoadEvent::Started {
                if let Some(ptys) = webview.try_state::<Ptys>() {
                    ptys.kill_owner(webview.label());
                }
            }
        })
        .on_window_event(|window, event| {
            if let WindowEvent::Destroyed = event {
                if let Some(ptys) = window.try_state::<Ptys>() {
                    ptys.kill_owner(window.label());
                }
            }
        })
        .invoke_handler(tauri::generate_handler![
            launch_info,
            pty_create,
            pty_write,
            pty_resize,
            pty_ack,
            pty_kill,
            suggest_paths,
            record_dir,
            settings_get,
            settings_set,
            clipboard_read,
            clipboard_write,
            open_in_editor,
            open_url,
        ])
        .build(tauri::generate_context!())
        .expect("falha ao iniciar o Termo");

    app.run(|handle, event| {
        if let RunEvent::Exit = event {
            if let Some(ptys) = handle.try_state::<Ptys>() {
                ptys.kill_all();
            }
        }
    });
}
