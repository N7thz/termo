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
    /// Escreve na aba (`tab`: chave; sem ela, a ativa). `enter: false` só cola.
    Send { tab: Option<u32>, text: String, enter: bool },
    /// Traz a janela para a frente e, com `tab`, ativa a aba.
    Focus { tab: Option<u32> },
    /// Fecha a aba.
    Close { tab: u32 },
}

impl Action {
    /// Pedidos que abrem ou mostram algo trazem a janela para a frente.
    fn shows_window(&self) -> bool {
        !matches!(self, Action::Tabs { .. } | Action::Send { .. })
    }
}

/// Subcomandos que o argv do `Termo.exe` (instância única) reconhece.
const SUBCOMMANDS: &[&str] = &["open", "run", "claude", "split", "tabs", "send", "focus", "close"];

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
                        tab = Some(tab_key(rest.get(i + 1).map(String::as_str))?);
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
            [n] => Ok(Action::Focus { tab: Some(tab_key(Some(n))?) }),
            _ => Err("uso: termo focus [aba]".into()),
        },
        "close" => match rest {
            [n] => Ok(Action::Close { tab: tab_key(Some(n))? }),
            _ => Err("uso: termo close <aba>".into()),
        },
        // `termo .`, `termo D:\projeto`: abre aba na pasta, como o `code .`.
        a if !a.starts_with('-') && rest.is_empty() && cwd.join(a).is_dir() => {
            Ok(Action::Open { cwd: dir(Some(a), cwd)?, shell: None, split: false })
        }
        a => Err(format!("comando desconhecido: {a} (veja termo help)")),
    }
}

fn tab_key(raw: Option<&str>) -> Result<u32, String> {
    let raw = raw.ok_or("faltou o número da aba (veja termo tabs)")?;
    raw.trim_start_matches('#').parse().map_err(|_| format!("aba inválida: {raw} (veja termo tabs)"))
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

/// Manda a ação para a janela principal e espera a resposta.
fn dispatch(app: &AppHandle, action: &Action) -> Reply {
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

fn action_name(a: &Action) -> &'static str {
    match a {
        Action::Open { .. } => "open",
        Action::Run { .. } => "run",
        Action::Claude { .. } => "claude",
        Action::Tabs { .. } => "tabs",
        Action::Send { .. } => "send",
        Action::Focus { .. } => "focus",
        Action::Close { .. } => "close",
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
            Action::Send { tab: Some(3), text: "ls -la".into(), enter: false }
        );
        assert_eq!(parse(&args(&["tabs", "--json"]), &here()).unwrap(), Action::Tabs { json: true });
        assert_eq!(parse(&args(&["focus", "2"]), &here()).unwrap(), Action::Focus { tab: Some(2) });
        assert!(parse(&args(&["close"]), &here()).is_err());
        assert!(parse(&args(&["send"]), &here()).is_err());
        assert!(parse(&args(&["voar"]), &here()).unwrap_err().contains("desconhecido"));
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
