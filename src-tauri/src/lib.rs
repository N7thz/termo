mod agent_status;
mod agents;
mod ai;
mod browser;
mod cli;
mod config_io;
mod control;
mod coord;
mod editor;
mod files;
mod git;
mod hotkey;
mod history;
mod export;
mod images;
mod logging;
mod memory;
mod node;
mod notify;
mod paths;
mod pty;
mod recent;
mod review;
mod session;
mod settings;
mod shell;
mod tray;
mod shells;
mod ssh;
mod updater;
mod usage;
mod window;
mod worktree;

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
    /// Perfil de shell da aba (`pwsh`, `cmd`, `wsl:<distro>`...). Sem ele, vale `defaultShell`.
    shell: Option<String>,
    /// Aba do Claude aberta pela linha de comando: argumentos extras, pedido inicial e se fecha ao sair.
    launch: Option<cli::TabLaunch>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct CreateSessionResult {
    id: u32,
    /// Avisos para mostrar no terminal (pasta inválida, Claude ausente...).
    warnings: Vec<String>,
    /// Pode diferir do pedido: sem Claude instalado, a aba vira shell.
    kind: &'static str,
    /// Perfil concreto aberto (`pwsh`, `powershell`, `cmd`, `wsl`, `wsl:<distro>`): a aba guarda para reabrir igual.
    shell: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct LaunchInfo {
    open_claude_first: bool,
    cwd: Option<String>,
    shell_name: String,
    /// Aba do Claude pedida na linha de comando (`--title`, `--prompt-file`, `-- <args>`).
    launch: Option<cli::ClaudeLaunch>,
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
        launch: cli.launch.clone(),
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

    let current = settings.get();
    let requested = opts.shell.as_deref().unwrap_or(&current.default_shell);
    let mut plan = shells::plan(
        requested,
        cwd,
        claude.as_deref(),
        agent_status::settings_file().as_deref(),
        current.shell_predictions,
    );
    warnings.extend(std::mem::take(&mut plan.warnings));
    if let (Some(_), Some(launch)) = (&claude, &opts.launch) {
        let powershell = shell::is_powershell(&plan.program);
        if let Err(e) = cli::apply(&mut plan.args, powershell, launch) {
            warnings.push(e);
        }
    }
    let spec = SpawnSpec { shell: &plan.program, args: plan.args, cwd: plan.cwd, cols: opts.cols, rows: opts.rows };
    let id = ptys.spawn(webview.label(), spec, move |ev| on_event.send(ev).is_ok())?;
    Ok(CreateSessionResult {
        id,
        warnings,
        kind: if claude.is_some() { "claude" } else { "shell" },
        shell: plan.shell_id,
    })
}

/// Shells instalados (pwsh, Windows PowerShell, cmd e as distros do WSL). `async`: o `wsl.exe -l -q` pode demorar.
#[tauri::command]
async fn shell_list() -> Vec<shells::ShellInfo> {
    shells::detect()
}

/// Hosts do `~/.ssh/config` (sem curingas) para o menu das abas SSH.
#[tauri::command]
async fn ssh_hosts() -> Vec<String> {
    ssh::hosts()
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

/// Uso de memória do Termo e de tudo que ele abriu (WebView2, shells, Claude).
#[tauri::command]
async fn memory_usage() -> memory::MemoryUsage {
    memory::usage()
}

/// Janela entrou ou saiu do segundo plano. Com o modo leve ligado, em segundo plano o WebView2 vai para
/// o modo de pouca memória e a memória ociosa volta ao Windows; ao voltar, o WebView2 volta ao normal.
/// Devolve o uso depois (em segundo plano, já com a memória devolvida).
#[tauri::command]
async fn memory_background(window: tauri::WebviewWindow, settings: State<'_, SettingsStore>, hidden: bool) -> Result<memory::MemoryUsage, ()> {
    let light = settings.get().tray.light_background;
    memory::set_webview_low(&window, hidden && light);
    Ok(if hidden && light { memory::trim() } else { memory::usage() })
}

/// Agentes (`.claude/agents`) do projeto da pasta e do usuário, para abrir o Claude com um papel.
#[tauri::command]
async fn claude_agents(cwd: Option<String>) -> Vec<agents::AgentDef> {
    let cwd = cwd.map(std::path::PathBuf::from).filter(|p| p.is_dir());
    agents::list(cwd.as_deref(), dirs::home_dir().as_deref())
}

/// Cópias (`git worktree`) do repositório da pasta.
#[tauri::command]
async fn worktree_list(cwd: String) -> Result<worktree::WorktreeList, String> {
    worktree::list(std::path::Path::new(&cwd))
}

/// Cria a cópia `<nome>` na branch `termo/<nome>`, ao lado do repositório.
#[tauri::command]
async fn worktree_create(cwd: String, name: String) -> Result<worktree::Worktree, String> {
    worktree::create(std::path::Path::new(&cwd), &name)
}

/// Junta a cópia na branch da pasta principal e a remove; devolve quantos commits entraram.
#[tauri::command]
async fn worktree_merge(cwd: String, path: String) -> Result<u32, String> {
    worktree::merge(std::path::Path::new(&cwd), &path)
}

/// Apaga a cópia, os commits e as alterações dela.
#[tauri::command]
async fn worktree_discard(cwd: String, path: String) -> Result<(), String> {
    worktree::discard(std::path::Path::new(&cwd), &path)
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

/// Salva um bloco exportado (`txt`, `md` ou `png`) no caminho escolhido no "Salvar como". `None`: cancelou.
#[tauri::command]
async fn export_save(app: AppHandle, name: String, ext: String, data: Vec<u8>) -> Result<Option<String>, String> {
    export::check(&ext, data.len())?;
    tauri::async_runtime::spawn_blocking(move || export::save(&app, &name, &ext, &data))
        .await
        .map_err(|e| e.to_string())?
}

/// Imagem da área de transferência (print, imagem copiada) gravada como PNG numa pasta temporária,
/// para entrar como caminho na linha do shell. `None` se não houver imagem.
#[tauri::command]
async fn clipboard_save_image(app: AppHandle) -> Result<Option<String>, String> {
    let Ok(img) = app.clipboard().read_image() else { return Ok(None) };
    let (rgba, w, h) = (img.rgba().to_vec(), img.width(), img.height());
    tauri::async_runtime::spawn_blocking(move || images::save_png(&images::paste_dir(), &rgba, w, h))
        .await
        .map_err(|e| e.to_string())?
        .map(|p| Some(p.to_string_lossy().into_owned()))
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

/// Histórico do PSReadLine para a busca do Ctrl+R (mais recentes primeiro, sem repetição).
#[tauri::command]
async fn history_read(limit: Option<usize>) -> Vec<String> {
    history::read(limit)
}

#[tauri::command]
fn settings_get(settings: State<SettingsStore>) -> Settings {
    settings.get()
}

#[tauri::command]
fn settings_set(app: AppHandle, settings: State<SettingsStore>, patch: SettingsPatch) -> Result<Settings, String> {
    // O atalho global é registrado antes de salvar: se outro programa já o usa, nada muda e o erro volta.
    if let Some(next) = patch.global_hotkey.as_deref() {
        let previous = settings.get().global_hotkey;
        let next = next.trim();
        if next != previous && settings::is_valid_hotkey(next) {
            hotkey::apply(&app, &previous, next)?;
        }
    }
    // Iniciar com o Windows também vem antes: sem permissão no registro, nada é salvo.
    let tray_patch = patch.tray.clone();
    if let Some(t) = &tray_patch {
        if t.launch_at_login != settings.get().tray.launch_at_login {
            tray::apply_autostart(&app, t.launch_at_login)?;
        }
    }
    let saved = settings.update(patch)?;
    if tray_patch.is_some() {
        tray::apply(&app, &saved.tray);
    }
    Ok(saved)
}

/// Exporta as configurações atuais para um arquivo escolhido no "Salvar como". `None`: cancelou.
#[tauri::command]
async fn config_export(app: AppHandle, exported_at: String) -> Result<Option<String>, String> {
    let current = app.state::<SettingsStore>().get();
    tauri::async_runtime::spawn_blocking(move || config_io::export(&app, &current, &exported_at))
        .await
        .map_err(|e| e.to_string())?
}

/// Escolhe e lê um arquivo de configurações para importar (nada é aplicado aqui). `None`: cancelou.
#[tauri::command]
async fn config_import_read(app: AppHandle) -> Result<Option<config_io::ImportFile>, String> {
    tauri::async_runtime::spawn_blocking(move || config_io::pick_and_read(&app))
        .await
        .map_err(|e| e.to_string())?
}

/// Aviso do Windows (Claude esperando, comando longo). Respeita a configuração.
#[tauri::command]
fn notify(app: AppHandle, window: tauri::WebviewWindow, settings: State<SettingsStore>, title: String, body: String) -> Result<(), String> {
    notify::show(&app, &window, &settings, &title, &body)
}

#[tauri::command]
async fn update_check(app: AppHandle) -> Result<Option<updater::UpdateInfo>, String> {
    updater::check(&app).await
}

#[tauri::command]
async fn update_install(app: AppHandle) -> Result<(), String> {
    updater::install(&app).await
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

#[tauri::command]
async fn scrollback_load(store: State<'_, session::ScrollbackStore>, id: String) -> Result<Option<String>, String> {
    Ok(store.load(&id))
}

#[tauri::command]
async fn scrollback_save(store: State<'_, session::ScrollbackStore>, id: String, text: String) -> Result<(), String> {
    store.save(&id, &text)
}

/// Apaga a saída guardada das abas que não estão em `keep`.
#[tauri::command]
async fn scrollback_prune(store: State<'_, session::ScrollbackStore>, keep: Vec<String>) -> Result<usize, String> {
    Ok(store.prune(&keep))
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

/// Prepara (`staged: true`) ou tira do stage todas as alterações do repositório.
#[tauri::command]
async fn review_stage_all(cwd: String, staged: bool) -> Result<(), String> {
    review::stage_all(std::path::Path::new(&cwd), staged)
}

/// Commita o que está no stage com a mensagem dada; devolve o hash curto.
#[tauri::command]
async fn review_commit(cwd: String, message: String) -> Result<String, String> {
    tauri::async_runtime::spawn_blocking(move || review::commit(std::path::Path::new(&cwd), &message))
        .await
        .map_err(|e| e.to_string())?
}

/// Mensagem de commit escrita pelo Claude Code (`claude -p`, sem ferramentas) a partir do diff do stage.
#[tauri::command]
async fn review_commit_message(cwd: String) -> Result<String, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let context = review::commit_context(std::path::Path::new(&cwd))?;
        let claude = shell::find_claude()?;
        let shell_name = shell::shell_name(&shell::detect_shell());
        ai::ask(&claude, ai::Mode::CommitMessage, &context, Some(&cwd), &shell_name)
    })
    .await
    .map_err(|e| e.to_string())?
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
    let background = std::env::args().any(|a| a == tray::BACKGROUND_ARG);

    logging::install_panic_hook();

    let app = tauri::Builder::default()
        // Antes de tudo: um segundo termo.exe só repassa o argv para este e sai.
        .plugin(tauri_plugin_single_instance::init(|app, argv, cwd| {
            // `Termo.exe run ...`, `Termo.exe tabs`...: subcomandos da CLI; o resto (--claude, --cwd) é do cli.rs.
            if !control::subcommand(app, &argv, &cwd) {
                cli::forward(app, argv, cwd)
            }
        }))
        // Primeiro, para registrar também o que os outros plugins logam ao subir.
        .plugin(logging::plugin())
        .plugin(tauri_plugin_clipboard_manager::init())
        .plugin(tauri_plugin_opener::init())
        // Só o seletor de pasta ("Escolher pasta…" da linha de contexto); nada de ler ou gravar arquivos.
        .plugin(tauri_plugin_dialog::init())
        // Avisos e atualização só por comandos próprios (notify, update_*): o frontend não recebe permissão dos plugins.
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(hotkey::plugin())
        .plugin(tray::autostart_plugin())
        .setup(move |app| {
            let dir = app.path().app_config_dir()?;
            let store = SettingsStore::load(&dir);
            let initial = store.get();
            app.manage(store);
            app.manage(updater::PendingUpdate::default());
            if let Err(e) = hotkey::apply(app.handle(), "", &initial.global_hotkey) {
                log::warn!("atalho global: {e}");
            }
            if initial.auto_update {
                updater::check_on_startup(app.handle().clone());
            }
            if let Err(e) = tray::build(app.handle(), &initial.tray) {
                log::warn!("bandeja: {e}");
            }
            // O registro pode ter sido mudado por fora (Gerenciador de Tarefas): vale o que está salvo.
            if let Err(e) = tray::apply_autostart(app.handle(), initial.tray.launch_at_login) {
                log::warn!("início com o Windows: {e}");
            }
            // Aberto pelo Windows no login, com "ficar só na bandeja": a janela principal nem aparece.
            if background && initial.tray.starts_hidden() {
                if let Some(w) = app.get_webview_window("main") {
                    let _ = w.hide();
                }
            }
            app.manage(session::SessionStore::new(&dir));
            app.manage(session::ScrollbackStore::new(&dir));
            app.manage(recent::RecentDirs::load(&dir, dirs::home_dir().as_deref()));
            app.manage(files::FileIndex::default());
            app.manage(node::VersionCache::default());
            app.manage::<Ptys>(Arc::new(PtyManager::default()));
            app.manage(cli);
            // `termo open/run/tabs/send...` (cliente em cli/) fala com esta instância por 127.0.0.1.
            if let Err(e) = control::serve(app.handle(), &dir) {
                log::warn!("controle pela linha de comando: {e}");
            }
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
            // Modo bandeja: fechar/minimizar a janela principal só a esconde.
            if let WindowEvent::CloseRequested { api, .. } = event {
                if tray::on_close_requested(window) {
                    api.prevent_close();
                }
            }
            if let WindowEvent::Resized(_) = event {
                tray::on_resized(window);
            }
            if let WindowEvent::Destroyed = event {
                if let Some(ptys) = window.try_state::<Ptys>() {
                    ptys.kill_owner(window.label());
                }
            }
        })
        .invoke_handler(tauri::generate_handler![
            launch_info,
            pty_create,
            shell_list,
            ssh_hosts,
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
            worktree_list,
            memory_usage,
            memory_background,
            claude_agents,
            worktree_create,
            worktree_merge,
            worktree_discard,
            node_info,
            node_versions,
            image_existing,
            image_preview,
            image_open,
            export_save,
            clipboard_save_image,
            search_files,
            history_read,
            settings_get,
            settings_set,
            config_export,
            config_import_read,
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
            scrollback_load,
            scrollback_save,
            scrollback_prune,
            coord_agents,
            coord_state,
            control::cli_reply,
            control::cli_install_path,
            coord_act,
            claude_usage,
            claude_line,
            ai_ask,
            review_status,
            review_diff,
            review_stage,
            review_discard,
            review_stage_all,
            review_commit,
            review_commit_message,
            new_window,
            notify,
            update_check,
            update_install,
        ])
        .build(tauri::generate_context!())
        .expect("falha ao iniciar o Termo");

    app.run(|handle, event| {
        if let RunEvent::Exit = event {
            control::cleanup(handle);
            if let Some(ptys) = handle.try_state::<Ptys>() {
                ptys.kill_all();
            }
        }
    });
}
