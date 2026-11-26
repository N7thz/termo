//! Controle do Termo aberto pela linha de comando (`termo open`, `termo run`, `termo tabs`...).
//!
//! O app escuta em 127.0.0.1 numa porta livre e grava a porta e um token em
//! `<config>/control.json`; o cliente `termo` (pasta `cli/` do repositório) lê esse arquivo, manda
//! uma linha JSON `{token, cwd, args}` e recebe outra `{ok, output, error}`. Os subcomandos são
//! interpretados aqui ([`parse`]) e executados pela interface: o pedido vai para a janela principal
//! pelo evento `cli-action` e a resposta volta pelo comando [`cli_reply`].
//!
//! Chamado direto como `Termo.exe run "bun dev"`, o argv chega pela instância única
//! ([`subcommand`]) e é executado do mesmo jeito, só que sem resposta para quem chamou.

use std::collections::hash_map::RandomState;
use std::collections::HashMap;
use std::hash::{BuildHasher, Hasher};
use std::io::{BufRead, BufReader, Write};
use std::net::{TcpListener, TcpStream};
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::mpsc::{channel, Sender};
use std::sync::{Arc, Mutex};
use std::time::Duration;

use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Emitter, Manager};

pub const EVENT: &str = "cli-action";
const FILE: &str = "control.json";
/// Tempo para a interface responder (abrir aba é rápido; a janela pode estar acordando da bandeja).
const REPLY_TIMEOUT: Duration = Duration::from_secs(10);
/// Maior pedido aceito: texto do `send` e um comando longo cabem com folga.
const MAX_REQUEST: u64 = 256 * 1024;

/// O que a interface faz. `cwd` já vem absoluto e conferido.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(tag = "type", rename_all = "camelCase")]
pub enum Action {
    /// Aba nova de shell na pasta (`shell`: perfil `pwsh`, `cmd`, `wsl:Ubuntu`...).
    Open { cwd: String, shell: Option<String>, split: bool },
    /// Aba nova que roda o comando no primeiro prompt.
    Run { cwd: String, command: String, split: bool },
    /// Aba nova do Claude Code; `prompt` é mandado quando ele ficar pronto.
    Claude { cwd: String, prompt: Option<String> },
    /// Lista as abas.
    Tabs { json: bool },
    /// Escreve na aba (sem `tab`, a ativa). `enter: false` só cola.
    Send { tab: Option<String>, text: String, enter: bool },
    /// Traz a janela para a frente e, com `tab`, ativa a aba.
    Focus { tab: Option<String> },
    /// Fecha a aba.
    Close { tab: String },
    /// Dá nome à aba (`label: None` volta ao título automático). Sem `tab`, vale a aba do PTY `pty`
    /// (a do processo que chamou, pela variável `TERMO_PTY`) ou a ativa.
    Title { tab: Option<String>, pty: Option<u32>, label: Option<String> },
    /// Nota da aba (mesma escolha de aba do `Title`). `text: None` sem `clear` mostra a nota atual;
    /// `append` junta uma linha no fim em vez de trocar tudo.
    Note { tab: Option<String>, pty: Option<u32>, text: Option<String>, append: bool, clear: bool },
    /// Exporta as configurações para `path` (`None`: devolve o JSON na saída). Feito aqui no Rust,
    /// sem passar pela interface.
    ConfigExport { path: Option<String>, force: bool },
    /// Importa um arquivo de configurações. O Rust lê o arquivo e preenche `file` antes de mandar à
    /// interface, que aplica as mesmas regras da tela (seções, mesclar listas, pastas que faltam).
    /// `sections` vazio = todas.
    #[serde(rename_all = "camelCase")]
    ConfigImport {
        path: String,
        sections: Vec<String>,
        keep_missing: bool,
        dry_run: bool,
        file: Option<crate::config_io::ImportFile>,
    },
}

impl Action {
    /// Pedidos que abrem ou mostram algo trazem a janela para a frente.
    fn shows_window(&self) -> bool {
        !matches!(
            self,
            Action::Tabs { .. }
                | Action::Send { .. }
                | Action::Title { .. }
                | Action::Note { .. }
                | Action::ConfigExport { .. }
                | Action::ConfigImport { .. }
        )
    }
}

/// Subcomandos que o argv do `Termo.exe` (instância única) reconhece.
const SUBCOMMANDS: &[&str] =
    &["open", "run", "claude", "split", "tabs", "send", "focus", "close", "title", "nota", "note", "config"];

/// Seções do `termo config import --only`: o nome em português ou o id da interface (`configFile.ts`).
const CONFIG_SECTIONS: &[(&str, &str)] = &[
    ("aparencia", "appearance"),
    ("appearance", "appearance"),
    ("terminal", "terminal"),
    ("fundo", "background"),
    ("background", "background"),
    ("destaques", "highlights"),
    ("highlights", "highlights"),
    ("perfis", "profiles"),
    ("profiles", "profiles"),
    ("workflows", "workflows"),
    ("layouts", "layouts"),
    ("sistema", "system"),
    ("avisos", "system"),
    ("system", "system"),
    ("atalhos", "keybindings"),
    ("keybindings", "keybindings"),
];

const CONFIG_USAGE: &str = "uso: termo config export [arquivo|-] [--force] | termo config import <arquivo> [--only perfis,workflows] [--keep-missing] [--dry-run]";

fn parse_config(rest: &[String], cwd: &Path) -> Result<Action, String> {
    let Some((sub, rest)) = rest.split_first() else { return Err(CONFIG_USAGE.into()) };
    if sub != "export" && sub != "import" {
        return Err(CONFIG_USAGE.into());
    }
    let mut target: Option<&str> = None;
    let mut force = false;
    let mut keep_missing = false;
    let mut dry_run = false;
    let mut sections: Vec<String> = Vec::new();
    let mut it = rest.iter();
    while let Some(a) = it.next() {
        match a.as_str() {
            "--force" | "-f" if sub == "export" => force = true,
            "--keep-missing" if sub == "import" => keep_missing = true,
            "--dry-run" | "-n" if sub == "import" => dry_run = true,
            "--only" if sub == "import" => {
                let list = it.next().ok_or("--only precisa das seções (ex.: --only perfis,workflows)")?;
                for name in list.split(',').map(str::trim).filter(|n| !n.is_empty()) {
                    let key = name.to_lowercase().replace('ê', "e");
                    let id = CONFIG_SECTIONS.iter().find(|(n, _)| *n == key).map(|(_, id)| id.to_string()).ok_or_else(|| {
                        format!("seção desconhecida: {name} (use aparencia, terminal, fundo, destaques, perfis, workflows, layouts, sistema ou atalhos)")
                    })?;
                    if !sections.contains(&id) {
                        sections.push(id);
                    }
                }
            }
            "-" if sub == "export" && target.is_none() => target = Some("-"),
            s if s.starts_with('-') => return Err(format!("opção desconhecida: {s}")),
            s if target.is_none() => target = Some(s),
            s => return Err(format!("argumento a mais: {s}")),
        }
    }
    if sub == "export" {
        let path = match target {
            Some("-") => None,
            Some(t) => Some(strip_verbatim(&cwd.join(t))),
            None => Some(strip_verbatim(&cwd.join(crate::config_io::DEFAULT_NAME))),
        };
        return Ok(Action::ConfigExport { path, force });
    }
    let t = target.ok_or("faltou o arquivo: termo config import <arquivo>")?;
    Ok(Action::ConfigImport { path: strip_verbatim(&cwd.join(t)), sections, keep_missing, dry_run, file: None })
}

/// Interpreta os argumentos do cliente (sem o nome do programa). `cwd` é a pasta de quem chamou.
pub fn parse(args: &[String], cwd: &Path) -> Result<Action, String> {
    let Some(first) = args.first() else {
        return Ok(Action::Open { cwd: dir(None, cwd)?, shell: None, split: false });
    };
    let rest = &args[1..];
    match first.as_str() {
        "open" | "split" => {
            let mut shell = None;
            let mut target = None;
            let mut it = rest.iter();
            while let Some(a) = it.next() {
                match a.as_str() {
                    "--shell" | "-s" => shell = Some(it.next().ok_or("--shell precisa de um perfil (pwsh, cmd, wsl:Ubuntu...)")?.clone()),
                    s if s.starts_with('-') => return Err(format!("opção desconhecida: {s}")),
                    s if target.is_none() => target = Some(s),
                    s => return Err(format!("argumento a mais: {s}")),
                }
            }
            Ok(Action::Open { cwd: dir(target, cwd)?, shell, split: first == "split" })
        }
        "run" => {
            let mut target = None;
            let mut split = false;
            let mut i = 0;
            while i < rest.len() {
                match rest[i].as_str() {
                    "--cwd" | "-C" => {
                        target = Some(rest.get(i + 1).ok_or("--cwd precisa de uma pasta")?.as_str());
                        i += 2;
                    }
                    "--split" => {
                        split = true;
                        i += 1;
                    }
                    "--" => {
                        i += 1;
                        break;
                    }
                    _ => break,
                }
            }
            let command = rest[i..].join(" ");
            if command.trim().is_empty() {
                return Err("faltou o comando: termo run <comando>".into());
            }
            Ok(Action::Run { cwd: dir(target, cwd)?, command, split })
        }
        "claude" => {
            // `termo claude [pasta] [texto...]`: o primeiro argumento é a pasta se for uma pasta que existe.
            let (target, words) = match rest.first() {
                Some(a) if a != "--" && cwd.join(a).is_dir() => (Some(a.as_str()), &rest[1..]),
                _ => (None, rest),
            };
            let words = match words.first() {
                Some(a) if a == "--" => &words[1..],
                _ => words,
            };
            let prompt = words.join(" ");
            Ok(Action::Claude { cwd: dir(target, cwd)?, prompt: (!prompt.trim().is_empty()).then_some(prompt) })
        }
        "tabs" | "ls" => match rest {
            [] => Ok(Action::Tabs { json: false }),
            [j] if j == "--json" => Ok(Action::Tabs { json: true }),
            _ => Err("uso: termo tabs [--json]".into()),
        },
        "send" => {
            let mut tab = None;
            let mut enter = true;
            let mut i = 0;
            while i < rest.len() {
                match rest[i].as_str() {
                    "--tab" | "-t" => {
                        tab = Some(tab_ref(rest.get(i + 1).map(String::as_str))?);
                        i += 2;
                    }
                    "--no-enter" | "-n" => {
                        enter = false;
                        i += 1;
                    }
                    "--" => {
                        i += 1;
                        break;
                    }
                    _ => break,
                }
            }
            let text = rest[i..].join(" ");
            if text.is_empty() {
                return Err("faltou o texto: termo send [--tab N] [--no-enter] <texto>".into());
            }
            Ok(Action::Send { tab, text, enter })
        }
        "focus" => match rest {
            [] => Ok(Action::Focus { tab: None }),
            [n] => Ok(Action::Focus { tab: Some(tab_ref(Some(n))?) }),
            _ => Err("uso: termo focus [aba]".into()),
        },
        "close" => match rest {
            [n] => Ok(Action::Close { tab: tab_ref(Some(n))? }),
            _ => Err("uso: termo close <aba>".into()),
        },
        "title" => {
            let mut tab = None;
            let mut pty = None;
            let mut clear = false;
            let mut i = 0;
            while i < rest.len() {
                match rest[i].as_str() {
                    "--tab" | "-t" => {
                        tab = Some(tab_ref(rest.get(i + 1).map(String::as_str))?);
                        i += 2;
                    }
                    "--pty" => {
                        let raw = rest.get(i + 1).ok_or("--pty precisa do número do terminal")?;
                        pty = Some(raw.parse().map_err(|_| format!("--pty inválido: {raw}"))?);
                        i += 2;
                    }
                    "--clear" | "-c" => {
                        clear = true;
                        i += 1;
                    }
                    "--" => {
                        i += 1;
                        break;
                    }
                    _ => break,
                }
            }
            let label = rest[i..].join(" ");
            let label = label.trim();
            match (clear, label.is_empty()) {
                (true, true) => Ok(Action::Title { tab, pty, label: None }),
                (false, false) => Ok(Action::Title { tab, pty, label: Some(label.to_string()) }),
                (true, false) => Err("use o título ou --clear, não os dois".into()),
                (false, true) => Err("faltou o título: termo title [--tab N] <texto> (ou --clear)".into()),
            }
        }
        "nota" | "note" => {
            let mut tab = None;
            let mut pty = None;
            let mut clear = false;
            let mut append = false;
            let mut i = 0;
            while i < rest.len() {
                match rest[i].as_str() {
                    "--tab" | "-t" => {
                        tab = Some(tab_ref(rest.get(i + 1).map(String::as_str))?);
                        i += 2;
                    }
                    "--pty" => {
                        let raw = rest.get(i + 1).ok_or("--pty precisa do número do terminal")?;
                        pty = Some(raw.parse().map_err(|_| format!("--pty inválido: {raw}"))?);
                        i += 2;
                    }
                    "--clear" | "-c" => {
                        clear = true;
                        i += 1;
                    }
                    "--add" | "-a" => {
                        append = true;
                        i += 1;
                    }
                    "--" => {
                        i += 1;
                        break;
                    }
                    _ => break,
                }
            }
            let text = rest[i..].join(" ");
            let text = text.trim();
            match (clear, append, text.is_empty()) {
                (true, false, true) => Ok(Action::Note { tab, pty, text: None, append: false, clear: true }),
                (false, false, true) => Ok(Action::Note { tab, pty, text: None, append: false, clear: false }),
                (false, _, false) => Ok(Action::Note { tab, pty, text: Some(text.to_string()), append, clear: false }),
                (false, true, true) => Err("faltou a linha: termo nota --add <texto>".into()),
                (true, _, _) => Err("--clear não leva texto nem --add".into()),
            }
        }
        "config" => parse_config(rest, cwd),
        // `termo .`, `termo D:\projeto`: abre aba na pasta, como o `code .`.
        a if !a.starts_with('-') && rest.is_empty() && cwd.join(a).is_dir() => {
            Ok(Action::Open { cwd: dir(Some(a), cwd)?, shell: None, split: false })
        }
        a => Err(format!("comando desconhecido: {a} (veja termo help)")),
    }
}

/// Aba pelo número (`3`, `#3`) ou pelo nome/título; quem resolve é a interface, que conhece as abas.
fn tab_ref(raw: Option<&str>) -> Result<String, String> {
    let raw = raw.map(str::trim).filter(|r| !r.is_empty()).ok_or("faltou a aba: o número ou o nome (veja termo tabs)")?;
    Ok(raw.to_string())
}

/// Pasta absoluta: relativa à de quem chamou; sem pasta, a própria.
fn dir(target: Option<&str>, cwd: &Path) -> Result<String, String> {
    let path = match target {
        Some(t) => cwd.join(t),
        None => cwd.to_path_buf(),
    };
    let path = std::fs::canonicalize(&path).map_err(|_| format!("pasta não encontrada: {}", path.display()))?;
    if !path.is_dir() {
        return Err(format!("não é uma pasta: {}", path.display()));
    }
    Ok(strip_verbatim(&path))
}

/// `canonicalize` no Windows devolve `\\?\D:\x`; o shell e a interface querem `D:\x`.
fn strip_verbatim(path: &Path) -> String {
    let s = path.to_string_lossy();
    if let Some(unc) = s.strip_prefix(r"\\?\UNC\") {
        return format!(r"\\{unc}");
    }
    s.strip_prefix(r"\\?\").unwrap_or(&s).to_string()
}

#[derive(Deserialize)]
struct Request {
    token: String,
    cwd: String,
    args: Vec<String>,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize, PartialEq, Eq)]
pub struct Reply {
    pub ok: bool,
    #[serde(default)]
    pub output: String,
    #[serde(default)]
    pub error: String,
}

impl Reply {
    fn err(error: impl Into<String>) -> Self {
        Reply { ok: false, output: String::new(), error: error.into() }
    }
}

#[derive(Serialize, Clone)]
struct Envelope<'a> {
    id: u64,
    #[serde(flatten)]
    action: &'a Action,
}

/// Pedidos esperando a resposta da interface.
#[derive(Default)]
pub struct Pending {
    next: AtomicU64,
    waiting: Mutex<HashMap<u64, Sender<Reply>>>,
}

/// Resposta da interface a um `cli-action`.
#[tauri::command]
pub fn cli_reply(pending: tauri::State<'_, Arc<Pending>>, id: u64, reply: Reply) {
    if let Some(tx) = pending.waiting.lock().unwrap().remove(&id) {
        let _ = tx.send(reply);
    }
}

/// Manda a ação para a janela principal e espera a resposta. O `config export` roda aqui mesmo e,
/// no import, o arquivo é lido antes de mandar.
fn dispatch(app: &AppHandle, action: &Action) -> Reply {
    match action {
        Action::ConfigExport { path, force } => return config_export(app, path.as_deref(), *force),
        Action::ConfigImport { path, sections, keep_missing, dry_run, file: None } => {
            return match crate::config_io::read_file(Path::new(path)) {
                Ok(file) => dispatch(
                    app,
                    &Action::ConfigImport {
                        path: path.clone(),
                        sections: sections.clone(),
                        keep_missing: *keep_missing,
                        dry_run: *dry_run,
                        file: Some(file),
                    },
                ),
                Err(e) => Reply::err(e),
            };
        }
        _ => {}
    }
    let Some(pending) = app.try_state::<Arc<Pending>>().map(|s| Arc::clone(&s)) else {
        return Reply::err("o Termo ainda está abrindo; tente de novo");
    };
    if action.shows_window() {
        crate::tray::show_main(app);
    }
    let id = pending.next.fetch_add(1, Ordering::Relaxed) + 1;
    let (tx, rx) = channel();
    pending.waiting.lock().unwrap().insert(id, tx);
    if let Err(e) = app.emit_to("main", EVENT, Envelope { id, action }) {
        pending.waiting.lock().unwrap().remove(&id);
        return Reply::err(format!("não foi possível falar com a janela: {e}"));
    }
    let reply = rx.recv_timeout(REPLY_TIMEOUT);
    pending.waiting.lock().unwrap().remove(&id);
    reply.unwrap_or_else(|_| Reply::err("a janela do Termo não respondeu"))
}

/// Argv do `Termo.exe` repassado pela instância única. Devolve `false` se não é subcomando
/// (aí vale o tratamento normal de `--claude`/`--cwd`).
pub fn subcommand(app: &AppHandle, argv: &[String], cwd: &str) -> bool {
    let args = &argv[argv.len().min(1)..];
    if !args.first().is_some_and(|a| SUBCOMMANDS.contains(&a.as_str())) {
        return false;
    }
    match parse(args, Path::new(cwd)) {
        Ok(action) => {
            let app = app.clone();
            // A resposta não tem para onde ir; só não pode prender a thread da instância única.
            std::thread::spawn(move || {
                let reply = dispatch(&app, &action);
                if !reply.ok {
                    log::warn!("termo {}: {}", action_name(&action), reply.error);
                }
            });
        }
        Err(e) => log::warn!("linha de comando: {e}"),
    }
    true
}

fn config_export(app: &AppHandle, path: Option<&str>, force: bool) -> Reply {
    let Some(store) = app.try_state::<crate::settings::SettingsStore>() else {
        return Reply::err("o Termo ainda está abrindo; tente de novo");
    };
    let settings = store.get();
    let result = match path {
        None => crate::config_io::envelope(&settings, &crate::config_io::now_iso()),
        Some(p) => crate::config_io::export_to(Path::new(p), &settings, force)
            .map(|written| format!("exportado em {}", written.display())),
    };
    match result {
        Ok(output) => Reply { ok: true, output, error: String::new() },
        Err(e) => Reply::err(e),
    }
}

fn action_name(a: &Action) -> &'static str {
    match a {
        Action::Open { .. } => "open",
        Action::Run { .. } => "run",
        Action::Claude { .. } => "claude",
        Action::Tabs { .. } => "tabs",
        Action::Send { .. } => "send",
        Action::Focus { .. } => "focus",
        Action::Close { .. } => "close",
        Action::Title { .. } => "title",
        Action::Note { .. } => "note",
        Action::ConfigExport { .. } => "config export",
        Action::ConfigImport { .. } => "config import",
    }
}

/// Põe a pasta do `termo.exe` (`<instalação>\bin`) no PATH do usuário, como o "Add to PATH" do VS Code.
/// Devolve `true` se acrescentou e `false` se já estava. Terminais abertos antes não veem a mudança.
#[tauri::command]
pub async fn cli_install_path(app: AppHandle) -> Result<bool, String> {
    let dir = app.path().resource_dir().map_err(|e| e.to_string())?.join("bin");
    if !dir.join(if cfg!(windows) { "termo.exe" } else { "termo" }).is_file() {
        return Err(format!("o termo.exe não está em {}", dir.display()));
    }
    let dir = strip_verbatim(&dir);
    tauri::async_runtime::spawn_blocking(move || add_to_user_path(&dir)).await.map_err(|e| e.to_string())?
}

#[cfg(windows)]
fn add_to_user_path(dir: &str) -> Result<bool, String> {
    use std::os::windows::process::CommandExt;
    // SetEnvironmentVariable avisa o Windows (WM_SETTINGCHANGE), o que o `setx` também faz, mas sem cortar em 1024 caracteres.
    let script = format!(
        "$d='{}'; $p=[Environment]::GetEnvironmentVariable('Path','User'); \
         if ((\"$p\" -split ';') -contains $d) {{ 'present' }} else {{ \
         [Environment]::SetEnvironmentVariable('Path', ((@(\"$p\".TrimEnd(';')) + $d) | Where-Object {{ $_ }}) -join ';', 'User'); 'added' }}",
        dir.replace('\'', "''")
    );
    let out = std::process::Command::new("powershell.exe")
        .args(["-NoProfile", "-NonInteractive", "-Command", &script])
        .creation_flags(0x0800_0000) // CREATE_NO_WINDOW
        .output()
        .map_err(|e| e.to_string())?;
    let stdout = String::from_utf8_lossy(&out.stdout);
    match stdout.trim() {
        "added" => Ok(true),
        "present" => Ok(false),
        _ => Err(String::from_utf8_lossy(&out.stderr).trim().to_string()),
    }
}

#[cfg(not(windows))]
fn add_to_user_path(dir: &str) -> Result<bool, String> {
    Err(format!("acrescente {dir} ao PATH no perfil do seu shell"))
}

#[derive(Serialize, Deserialize, Debug, PartialEq, Eq)]
struct ControlFile {
    port: u16,
    token: String,
    pid: u32,
}

/// Token de 128 bits com a semente aleatória do sistema (`RandomState`), sem dependência nova.
fn new_token() -> String {
    let part = || {
        let mut h = RandomState::new().build_hasher();
        h.write_u128(std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).map(|d| d.as_nanos()).unwrap_or(0));
        h.finish()
    };
    format!("{:016x}{:016x}", part(), part())
}

/// Sobe o servidor e grava `control.json`. Só a janela principal (primeira instância) chama.
pub fn serve(app: &AppHandle, config_dir: &Path) -> std::io::Result<()> {
    let listener = TcpListener::bind(("127.0.0.1", 0))?;
    let info = ControlFile { port: listener.local_addr()?.port(), token: new_token(), pid: std::process::id() };
    std::fs::create_dir_all(config_dir)?;
    let file = config_dir.join(FILE);
    write_atomic(&file, &serde_json::to_vec(&info).map_err(std::io::Error::other)?)?;
    app.manage(Arc::new(Pending::default()));
    let bin = app.path().resource_dir().ok().map(|d| d.join("bin")).filter(|d| d.is_dir());
    let _ = PTY_ENV.set(PtyEnv { control: file.clone(), bin });
    app.manage(ControlPath(file));
    let app = app.clone();
    std::thread::spawn(move || {
        for stream in listener.incoming().flatten() {
            let app = app.clone();
            let token = info.token.clone();
            std::thread::spawn(move || {
                if let Err(e) = handle(&app, stream, &token) {
                    log::debug!("controle: {e}");
                }
            });
        }
    });
    Ok(())
}

struct ControlPath(PathBuf);

/// O que os terminais do Termo herdam para o `termo` funcionar dentro deles.
struct PtyEnv {
    /// `control.json` desta instância (o Termo de teste usa outro identificador e outra pasta).
    control: PathBuf,
    /// Pasta do `termo.exe` que veio com o app, posta na frente do PATH.
    bin: Option<PathBuf>,
}

static PTY_ENV: std::sync::OnceLock<PtyEnv> = std::sync::OnceLock::new();

/// Variáveis do terminal `id`: `TERMO_PTY` (o `termo title` sem `--tab` nomeia a própria aba),
/// `TERMO_CONTROL` (fala com esta instância) e o PATH com o `termo` na frente.
pub fn pty_env(id: u32) -> Vec<(String, String)> {
    let mut vars = vec![("TERMO_PTY".to_string(), id.to_string())];
    let Some(env) = PTY_ENV.get() else { return vars };
    vars.push(("TERMO_CONTROL".into(), strip_verbatim(&env.control)));
    if let Some(bin) = &env.bin {
        let path = std::env::var("PATH").unwrap_or_default();
        vars.push(("PATH".into(), format!("{};{path}", strip_verbatim(bin))));
    }
    vars
}

/// Ao sair, apaga o `control.json` (se ainda for o deste processo), para o cliente não tentar a porta velha.
pub fn cleanup(app: &AppHandle) {
    let Some(path) = app.try_state::<ControlPath>() else { return };
    let mine = std::fs::read(&path.0)
        .ok()
        .and_then(|raw| serde_json::from_slice::<ControlFile>(&raw).ok())
        .is_some_and(|f| f.pid == std::process::id());
    if mine {
        let _ = std::fs::remove_file(&path.0);
    }
}

fn write_atomic(path: &Path, data: &[u8]) -> std::io::Result<()> {
    let tmp = path.with_extension("json.tmp");
    std::fs::write(&tmp, data)?;
    std::fs::rename(&tmp, path)
}

fn handle(app: &AppHandle, stream: TcpStream, token: &str) -> std::io::Result<()> {
    stream.set_read_timeout(Some(Duration::from_secs(5)))?;
    let mut line = String::new();
    BufReader::new((&stream).take_limited()).read_line(&mut line)?;
    let reply = match serde_json::from_str::<Request>(&line) {
        Err(_) => Reply::err("pedido inválido"),
        Ok(req) if !constant_eq(req.token.as_bytes(), token.as_bytes()) => Reply::err("token inválido"),
        Ok(req) => match parse(&req.args, Path::new(&req.cwd)) {
            Ok(action) => dispatch(app, &action),
            Err(e) => Reply::err(e),
        },
    };
    let mut out = serde_json::to_vec(&reply).map_err(std::io::Error::other)?;
    out.push(b'\n');
    (&stream).write_all(&out)
}

trait TakeLimited: Sized + std::io::Read {
    fn take_limited(self) -> std::io::Take<Self> {
        self.take(MAX_REQUEST)
    }
}
impl<R: std::io::Read> TakeLimited for R {}

fn constant_eq(a: &[u8], b: &[u8]) -> bool {
    a.len() == b.len() && a.iter().zip(b).fold(0u8, |acc, (x, y)| acc | (x ^ y)) == 0
}

#[cfg(test)]
mod tests {
    use super::*;

    fn args(s: &[&str]) -> Vec<String> {
        s.iter().map(|a| a.to_string()).collect()
    }

    fn here() -> PathBuf {
        std::env::current_dir().unwrap()
    }

    fn here_str() -> String {
        strip_verbatim(&std::fs::canonicalize(here()).unwrap())
    }

    #[test]
    fn empty_and_dot_open_here() {
        let open = Action::Open { cwd: here_str(), shell: None, split: false };
        assert_eq!(parse(&[], &here()).unwrap(), open);
        assert_eq!(parse(&args(&["."]), &here()).unwrap(), open);
        assert_eq!(parse(&args(&["open"]), &here()).unwrap(), open);
    }

    #[test]
    fn open_with_shell_and_split() {
        assert_eq!(
            parse(&args(&["split", "src", "--shell", "cmd"]), &here()).unwrap(),
            Action::Open { cwd: strip_verbatim(&std::fs::canonicalize("src").unwrap()), shell: Some("cmd".into()), split: true }
        );
        assert!(parse(&args(&["open", "nao-existe-xyz"]), &here()).unwrap_err().contains("não encontrada"));
        assert!(parse(&args(&["open", "--shell"]), &here()).is_err());
    }

    #[test]
    fn run_joins_command() {
        assert_eq!(
            parse(&args(&["run", "--split", "bun", "run", "dev"]), &here()).unwrap(),
            Action::Run { cwd: here_str(), command: "bun run dev".into(), split: true }
        );
        assert_eq!(
            parse(&args(&["run", "--", "--version"]), &here()).unwrap(),
            Action::Run { cwd: here_str(), command: "--version".into(), split: false }
        );
        assert!(parse(&args(&["run"]), &here()).is_err());
    }

    #[test]
    fn claude_folder_then_prompt() {
        assert_eq!(
            parse(&args(&["claude", "src", "explique", "isto"]), &here()).unwrap(),
            Action::Claude {
                cwd: strip_verbatim(&std::fs::canonicalize("src").unwrap()),
                prompt: Some("explique isto".into())
            }
        );
        assert_eq!(
            parse(&args(&["claude", "--", "src"]), &here()).unwrap(),
            Action::Claude { cwd: here_str(), prompt: Some("src".into()) }
        );
        assert_eq!(parse(&args(&["claude"]), &here()).unwrap(), Action::Claude { cwd: here_str(), prompt: None });
    }

    #[test]
    fn send_tabs_focus_close() {
        assert_eq!(
            parse(&args(&["send", "-t", "#3", "-n", "ls", "-la"]), &here()).unwrap(),
            Action::Send { tab: Some("#3".into()), text: "ls -la".into(), enter: false }
        );
        assert_eq!(parse(&args(&["tabs", "--json"]), &here()).unwrap(), Action::Tabs { json: true });
        assert_eq!(parse(&args(&["focus", "2"]), &here()).unwrap(), Action::Focus { tab: Some("2".into()) });
        assert_eq!(parse(&args(&["close", "api dev"]), &here()).unwrap(), Action::Close { tab: "api dev".into() });
        assert!(parse(&args(&["close"]), &here()).is_err());
        assert!(parse(&args(&["send"]), &here()).is_err());
        assert!(parse(&args(&["voar"]), &here()).unwrap_err().contains("desconhecido"));
    }

    #[test]
    fn note_sets_adds_shows_and_clears() {
        assert_eq!(
            parse(&args(&["nota", "--pty", "3", "etapa", "2/5"]), &here()).unwrap(),
            Action::Note { tab: None, pty: Some(3), text: Some("etapa 2/5".into()), append: false, clear: false }
        );
        assert_eq!(
            parse(&args(&["note", "-t", "api", "--add", "testes ok"]), &here()).unwrap(),
            Action::Note { tab: Some("api".into()), pty: None, text: Some("testes ok".into()), append: true, clear: false }
        );
        assert_eq!(
            parse(&args(&["nota"]), &here()).unwrap(),
            Action::Note { tab: None, pty: None, text: None, append: false, clear: false }
        );
        assert_eq!(
            parse(&args(&["nota", "--clear"]), &here()).unwrap(),
            Action::Note { tab: None, pty: None, text: None, append: false, clear: true }
        );
        assert!(parse(&args(&["nota", "--add"]), &here()).is_err());
        assert!(parse(&args(&["nota", "--clear", "x"]), &here()).is_err());
    }

    #[test]
    fn title_sets_and_clears() {
        assert_eq!(
            parse(&args(&["title", "--pty", "7", "rodando", "testes"]), &here()).unwrap(),
            Action::Title { tab: None, pty: Some(7), label: Some("rodando testes".into()) }
        );
        assert_eq!(
            parse(&args(&["title", "-t", "api", "--clear"]), &here()).unwrap(),
            Action::Title { tab: Some("api".into()), pty: None, label: None }
        );
        assert!(parse(&args(&["title"]), &here()).is_err());
        assert!(parse(&args(&["title", "--clear", "x"]), &here()).is_err());
        assert!(parse(&args(&["title", "--pty", "x", "y"]), &here()).is_err());
    }

    #[test]
    fn config_export_and_import() {
        let at = |f: &str| strip_verbatim(&here().join(f));
        assert_eq!(
            parse(&args(&["config", "export"]), &here()).unwrap(),
            Action::ConfigExport { path: Some(at("termo-config.json")), force: false }
        );
        assert_eq!(
            parse(&args(&["config", "export", "-", "--force"]), &here()).unwrap(),
            Action::ConfigExport { path: None, force: true }
        );
        assert_eq!(
            parse(&args(&["config", "import", "x.json", "--only", "Perfis, workflows,perfis", "--dry-run"]), &here())
                .unwrap(),
            Action::ConfigImport {
                path: at("x.json"),
                sections: vec!["profiles".into(), "workflows".into()],
                keep_missing: false,
                dry_run: true,
                file: None
            }
        );
        assert!(parse(&args(&["config", "import"]), &here()).unwrap_err().contains("faltou o arquivo"));
        assert!(parse(&args(&["config", "import", "x", "--only", "abas"]), &here()).unwrap_err().contains("desconhecida"));
        assert!(parse(&args(&["config", "export", "--dry-run"]), &here()).is_err());
        assert!(parse(&args(&["config", "import", "x", "--force"]), &here()).is_err());
        assert!(parse(&args(&["config"]), &here()).unwrap_err().starts_with("uso:"));
        assert!(parse(&args(&["config", "sync"]), &here()).unwrap_err().starts_with("uso:"));
    }

    #[test]
    fn config_import_json_shape() {
        let a = Action::ConfigImport { path: "x".into(), sections: vec![], keep_missing: true, dry_run: false, file: None };
        let v = serde_json::to_value(Envelope { id: 1, action: &a }).unwrap();
        assert_eq!(
            v,
            serde_json::json!({
                "id": 1, "type": "configImport", "path": "x", "sections": [],
                "keepMissing": true, "dryRun": false, "file": null
            })
        );
    }

    #[test]
    fn strips_verbatim_prefix() {
        assert_eq!(strip_verbatim(Path::new(r"\\?\D:\x")), r"D:\x");
        assert_eq!(strip_verbatim(Path::new(r"\\?\UNC\srv\share")), r"\\srv\share");
    }

    #[test]
    fn action_json_shape() {
        let a = Action::Send { tab: None, text: "x".into(), enter: true };
        let v = serde_json::to_value(Envelope { id: 7, action: &a }).unwrap();
        assert_eq!(v, serde_json::json!({ "id": 7, "type": "send", "tab": null, "text": "x", "enter": true }));
    }

    #[test]
    fn tokens_differ() {
        assert_ne!(new_token(), new_token());
        assert_eq!(new_token().len(), 32);
        assert!(constant_eq(b"ab", b"ab") && !constant_eq(b"ab", b"ac") && !constant_eq(b"a", b"ab"));
    }
}
