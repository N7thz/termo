mod agent_status;
mod ai;
mod browser;
mod coord;
mod editor;
mod files;
mod git;
mod images;
mod node;
mod paths;
mod pty;
mod recent;
mod review;
mod session;
mod settings;
mod shell;
mod usage;
mod window;

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
        args: shell::shell_args(
            &shell_path,
            claude.as_deref(),
            agent_status::settings_file().as_deref(),
            settings.get().shell_predictions,
        ),
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

/// Branch e alterações do git da pasta; `None` fora de repositório.
#[tauri::command]
async fn git_info(cwd: String) -> Option<git::GitInfo> {
    let dir = std::path::Path::new(&cwd);
    if !dir.is_dir() {
        return None;
    }
    git::git_info(dir)
}

/// Branches locais e remotas da pasta; `None` fora de repositório.
#[tauri::command]
async fn git_branches(cwd: String) -> Option<Vec<git::Branch>> {
    git::branches(std::path::Path::new(&cwd))
}

/// Troca de branch (`git switch`); devolve a mensagem do git se ele recusar.
#[tauri::command]
async fn git_switch(cwd: String, branch: String) -> Result<(), String> {
    git::switch_branch(std::path::Path::new(&cwd), &branch)
}

/// Cria a branch a partir do HEAD e troca para ela (`git switch -c`); devolve a mensagem do git se ele recusar.
#[tauri::command]
async fn git_create_branch(cwd: String, branch: String) -> Result<(), String> {
    git::create_branch(std::path::Path::new(&cwd), &branch)
}

/// Versão do node que o shell da aba resolve (`node` vem do prompt) e se a pasta é um projeto Node.
#[tauri::command]
async fn node_info(cache: State<'_, node::VersionCache>, node: Option<String>, cwd: Option<String>) -> Result<node::NodeInfo, String> {
    Ok(node::node_info(&cache, node.as_deref(), cwd.as_deref()))
}

/// Gerenciador de versões do Node encontrado (fnm, nvm-windows ou Volta) e as versões instaladas.
#[tauri::command]
async fn node_versions() -> node::NodeVersions {
    node::node_versions()
}

/// Dos nomes citados na saída de um comando, as imagens que existem (caminhos absolutos).
#[tauri::command]
async fn image_existing(cwd: Option<String>, candidates: Vec<String>) -> Vec<String> {
    images::existing(cwd.as_deref(), &candidates)
}

/// A imagem como `data:` para a prévia do bloco.
#[tauri::command]
async fn image_preview(path: String) -> Result<images::Preview, String> {
    images::preview(&path)
}

/// Abre a imagem no visualizador padrão do sistema (só arquivos de imagem).
#[tauri::command]
fn image_open(app: AppHandle, path: String) -> Result<(), String> {
    images::check_openable(&path)?;
    app.opener().open_path(path, None::<&str>).map_err(|e| e.to_string())
}

/// Arquivos da pasta que combinam com a busca (correspondência difusa), para a busca geral.
#[tauri::command]
async fn search_files(
    index: State<'_, files::FileIndex>,
    cwd: String,
    query: String,
    limit: Option<usize>,
) -> Result<Vec<files::FileHit>, String> {
    let dir = std::path::Path::new(&cwd);
    if !dir.is_dir() || query.len() > 200 {
        return Ok(Vec::new());
    }
    Ok(files::search(&index.files(dir), &query, limit.unwrap_or(30).min(100)))
}

/// Lista as pastas recentes (mais relevantes primeiro), para a busca geral.
#[tauri::command]
async fn recent_dirs(recent: State<'_, recent::RecentDirs>, limit: Option<usize>) -> Result<Vec<String>, String> {
    Ok(recent
        .ranked()
        .into_iter()
        .take(limit.unwrap_or(50).min(300))
        .map(|p| p.to_string_lossy().into_owned())
        .collect())
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
    // Sem VS Code: executável ou script abre a pasta (com o arquivo selecionado), nunca roda.
    if editor::runs_when_opened(&file) {
        return app.opener().reveal_item_in_dir(&file).map_err(|e| e.to_string());
    }
    app.opener().open_path(file.to_string_lossy(), None::<&str>).map_err(|e| e.to_string())
}

/// Abre uma pasta no Explorador de Arquivos.
#[tauri::command]
fn open_folder(app: AppHandle, path: String) -> Result<(), String> {
    if !std::path::Path::new(&path).is_dir() {
        return Err(format!("pasta não encontrada: {path}"));
    }
    app.opener().open_path(path, None::<&str>).map_err(|e| e.to_string())
}

#[tauri::command]
fn open_url(app: AppHandle, url: String) -> Result<(), String> {
    if !(url.starts_with("http://") || url.starts_with("https://")) {
        return Err("só links http(s) podem ser abertos".into());
    }
    app.opener().open_url(url, None::<&str>).map_err(|e| e.to_string())
}

/// Abas, grupos e divisões salvos na última vez (`null` se não houver).
#[tauri::command]
async fn session_load(store: State<'_, session::SessionStore>) -> Result<Option<serde_json::Value>, String> {
    Ok(store.load())
}

#[tauri::command]
async fn session_save(store: State<'_, session::SessionStore>, session: serde_json::Value) -> Result<(), String> {
    store.save(&session)
}

/// Abre `url` no painel de navegador ao lado do terminal, na área `bounds` (pixels lógicos).
#[tauri::command]
async fn browser_open(app: AppHandle, webview: Webview, url: String, bounds: browser::Bounds) -> Result<(), String> {
    browser::open(&app, webview.window().label(), browser::parse_web_url(&url)?, bounds)
}

/// Reposiciona o painel quando a área reservada para ele muda de tamanho.
#[tauri::command]
async fn browser_bounds(app: AppHandle, webview: Webview, bounds: browser::Bounds) -> Result<(), String> {
    browser::set_bounds(&app, webview.window().label(), bounds)
}

#[tauri::command]
async fn browser_visible(app: AppHandle, webview: Webview, visible: bool) -> Result<(), String> {
    browser::set_visible(&app, webview.window().label(), visible)
}

/// `back`, `forward` ou `reload`.
#[tauri::command]
async fn browser_go(app: AppHandle, webview: Webview, action: String) -> Result<(), String> {
    browser::go(&app, webview.window().label(), &action)
}

#[tauri::command]
async fn browser_close(app: AppHandle, webview: Webview) -> Result<(), String> {
    browser::close(&app, webview.window().label())
}

/// Sessões do Claude Code no painel do coord (`/agents`); inicia o painel se ele não estiver rodando.
#[tauri::command]
async fn coord_agents() -> Result<serde_json::Value, String> {
    tauri::async_runtime::spawn_blocking(|| coord::fetch("/agents")).await.map_err(|e| e.to_string())?
}

/// Abre outra janela do Termo; a primeira aba dela abre em `cwd` (a pasta da aba de onde veio o pedido).
#[tauri::command]
async fn new_window(app: AppHandle, cwd: Option<String>) -> Result<(), String> {
    window::open(&app, cwd.as_deref())
}

/// Code review: arquivos alterados do repositório da pasta (em relação ao HEAD); `None` fora de repositório.
#[tauri::command]
async fn review_status(cwd: String) -> Result<Option<review::ReviewStatus>, String> {
    review::status(std::path::Path::new(&cwd))
}

/// Diff unificado de um arquivo alterado (`path` relativo à raiz do repositório).
#[tauri::command]
async fn review_diff(cwd: String, path: String) -> Result<review::FileDiff, String> {
    review::diff(std::path::Path::new(&cwd), &path)
}

/// Prepara (`staged: true`) ou tira do stage um arquivo alterado.
#[tauri::command]
async fn review_stage(cwd: String, path: String, staged: bool) -> Result<(), String> {
    review::stage(std::path::Path::new(&cwd), &path, staged)
}

/// Descarta as alterações de um arquivo (volta ao HEAD; arquivo novo é apagado).
#[tauri::command]
async fn review_discard(cwd: String, path: String) -> Result<(), String> {
    review::discard(std::path::Path::new(&cwd), &path)
}

/// IA pelo Claude Code (`claude -p`): `mode` é `explain` (explicar um erro) ou `command` (linguagem natural
/// vira um comando do PowerShell, que volta para a caixa sem ser executado).
#[tauri::command]
async fn ai_ask(mode: String, input: String, cwd: Option<String>) -> Result<String, String> {
    let mode = ai::Mode::parse(&mode)?;
    if input.len() > 64 * 1024 {
        return Err("pedido grande demais".into());
    }
    tauri::async_runtime::spawn_blocking(move || {
        let claude = shell::find_claude()?;
        let shell_name = shell::shell_name(&shell::detect_shell());
        ai::ask(&claude, mode, &input, cwd.as_deref(), &shell_name)
    })
    .await
    .map_err(|e| e.to_string())?
}

/// Linha de status do Claude Code da aba `id` (modelo, esforço, contexto, custo); `None` antes da primeira resposta.
#[tauri::command]
async fn claude_line(id: u32) -> Option<usage::ClaudeLine> {
    usage::session_line(id)
}

/// Uso do plano do Claude (5 h e semana), do último `statusLine` das abas do Claude.
#[tauri::command]
async fn claude_usage() -> usage::Usage {
    usage::read()
}

/// Ação no painel do coord sobre um arquivo: `release-claim` libera a reserva, `release` esquece o registro
/// de edição. Devolve o `/state` atualizado.
#[tauri::command]
async fn coord_act(action: String, file: String) -> Result<serde_json::Value, String> {
    let action = match action.as_str() {
        "release-claim" => "/release-claim",
        "release" => "/release",
        other => return Err(format!("ação desconhecida: {other}")),
    };
    tauri::async_runtime::spawn_blocking(move || coord::act(action, &file)).await.map_err(|e| e.to_string())?
}

/// Histórico do coord (`/state`): sessões que já terminaram, com o plano de cada uma.
#[tauri::command]
async fn coord_state() -> Result<serde_json::Value, String> {
    tauri::async_runtime::spawn_blocking(|| coord::fetch("/state")).await.map_err(|e| e.to_string())?
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let cli = shell::parse_cli(std::env::args());

    let app = tauri::Builder::default()
        .plugin(tauri_plugin_clipboard_manager::init())
        .plugin(tauri_plugin_opener::init())
        // Só o seletor de pasta ("Escolher pasta…" da linha de contexto); nada de ler ou gravar arquivos.
        .plugin(tauri_plugin_dialog::init())
        .setup(move |app| {
            let dir = app.path().app_config_dir()?;
            app.manage(SettingsStore::load(&dir));
            app.manage(session::SessionStore::new(&dir));
            app.manage(recent::RecentDirs::load(&dir, dirs::home_dir().as_deref()));
            app.manage(files::FileIndex::default());
            app.manage(node::VersionCache::default());
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
                // A interface recarregou e perdeu o estado do painel: fecha a página que ficou aberta.
                if !webview.label().starts_with("browser-") {
                    let _ = browser::close(webview.app_handle(), webview.label());
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
            recent_dirs,
            git_info,
            git_branches,
            git_switch,
            git_create_branch,
            node_info,
            node_versions,
            image_existing,
            image_preview,
            image_open,
            search_files,
            settings_get,
            settings_set,
            clipboard_read,
            clipboard_write,
            open_in_editor,
            open_folder,
            open_url,
            browser_open,
            browser_bounds,
            browser_visible,
            browser_go,
            browser_close,
            session_load,
            session_save,
            coord_agents,
            coord_state,
            coord_act,
            claude_usage,
            claude_line,
            ai_ask,
            review_status,
            review_diff,
            review_stage,
            review_discard,
            new_window,
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
