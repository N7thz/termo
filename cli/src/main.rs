//! `termo`: controla o Termo aberto pela linha de comando, como o `code` do VS Code.
//!
//! Lê a porta e o token em `%APPDATA%\dev.termo.app\control.json` (gravado pelo app ao abrir),
//! manda `{token, cwd, args}` numa linha JSON e mostra a resposta. Os subcomandos são
//! interpretados pelo app (`src-tauri/src/control.rs`); aqui só ficam a ajuda e a abertura do
//! Termo quando ele está fechado.

use std::io::{BufRead, BufReader, Write};
use std::net::{SocketAddr, TcpStream};
use std::path::{Path, PathBuf};
use std::process::{Command, ExitCode};
use std::time::{Duration, Instant};

use serde::{Deserialize, Serialize};

const IDENTIFIER: &str = "dev.termo.app";
const VERSION: &str = env!("CARGO_PKG_VERSION");
const STARTUP_TIMEOUT: Duration = Duration::from_secs(20);
const REPLY_TIMEOUT: Duration = Duration::from_secs(15);

const HELP: &str = "\
termo: controla o Termo aberto

Uso:
  termo [pasta]                 abre uma aba na pasta (padrão: a atual), como o `code .`
  termo open [pasta] [--shell <perfil>]
                                aba nova; perfil: pwsh, powershell, cmd, git-bash, wsl:Ubuntu...
  termo split [pasta] [--shell <perfil>]
                                aba nova em tela dividida com a ativa
  termo run [--cwd <pasta>] [--split] <comando...>
                                aba nova que roda o comando (ex.: termo run bun dev)
  termo claude [pasta] [texto...]
                                aba do Claude Code; o texto vai como primeira mensagem
  termo tabs [--json]           lista as abas (número, tipo, nome, pasta)
  termo title [--tab N] <texto> dá nome à aba (padrão: a deste terminal); --clear volta ao automático
  termo nota [--tab N] [--add] [texto...]
                                nota da aba (padrão: a deste terminal): troca o texto, --add junta
                                uma linha, --clear apaga; sem texto, mostra a nota
  termo send [--tab N] [--no-enter] <texto...>
                                escreve na aba (padrão: a ativa) e tecla Enter
  termo focus [N]               traz o Termo para a frente (e ativa a aba N)
  termo close <N>               fecha a aba N
                                N é o número (termo tabs) ou o nome da aba
  termo config export [arquivo|-] [--force]
                                grava as configurações (padrão: termo-config.json aqui; - mostra o JSON)
  termo config import <arquivo> [--only perfis,workflows] [--keep-missing] [--dry-run]
                                importa: listas se juntam às suas; pastas que não existem aqui ficam de
                                fora (--keep-missing mantém); --dry-run só mostra o que mudaria.
                                Seções: aparencia, terminal, fundo, destaques, perfis, workflows,
                                layouts, sistema
  termo --claude [--cwd <pasta>] [--title <nome>] [--prompt-file <arq>] [--close-on-exit] [-- <args>]
                                repassa as flags ao Termo.exe (aba do Claude no Termo aberto)
  termo help | --version

Se o Termo estiver fechado, ele é aberto antes.";

#[derive(Serialize)]
struct Request<'a> {
    token: &'a str,
    cwd: &'a str,
    args: &'a [String],
}

#[derive(Deserialize)]
struct Reply {
    ok: bool,
    #[serde(default)]
    output: String,
    #[serde(default)]
    error: String,
}

#[derive(Deserialize)]
struct ControlFile {
    port: u16,
    token: String,
}

fn main() -> ExitCode {
    let args: Vec<String> = std::env::args().skip(1).collect();
    match args.first().map(String::as_str) {
        Some("help" | "-h" | "--help" | "/?") => {
            println!("{HELP}");
            return ExitCode::SUCCESS;
        }
        Some("--version" | "-V") => {
            println!("termo {VERSION}");
            return ExitCode::SUCCESS;
        }
        _ => {}
    }
    match run(&args) {
        Ok(output) => {
            if !output.is_empty() {
                println!("{output}");
            }
            ExitCode::SUCCESS
        }
        Err(e) => {
            eprintln!("termo: {e}");
            ExitCode::FAILURE
        }
    }
}

fn run(args: &[String]) -> Result<String, String> {
    let cwd = std::env::current_dir().map_err(|e| format!("pasta atual: {e}"))?;
    let cwd = cwd.to_string_lossy();
    // Flags do app (`--claude --cwd x --title y -- <args do claude>`): repassa tudo ao Termo.exe,
    // e a instância única leva para a janela aberta.
    if args.first().is_some_and(|a| a.starts_with('-')) {
        let exe = app_exe().ok_or("não achei o Termo.exe (defina TERMO_APP)")?;
        Command::new(&exe)
            .args(args)
            .current_dir(cwd.as_ref())
            .spawn()
            .map_err(|e| format!("não foi possível abrir o Termo ({}): {e}", exe.display()))?;
        return Ok(String::new());
    }
    let args = &with_own_tab(args, std::env::var("TERMO_PTY").ok().as_deref());
    let file = control_file().ok_or("não achei a pasta de configuração do usuário")?;
    let reply = match send(&file, &cwd, args) {
        Ok(reply) => reply,
        Err(_) => {
            // Termo fechado. `termo` e `termo <pasta>` só abrem o app ali; o resto espera ele subir.
            let exe = app_exe().ok_or("o Termo não está aberto e não achei o Termo.exe (defina TERMO_APP)")?;
            if opens_folder_only(args, Path::new(cwd.as_ref())) {
                launch(&exe, args.first().map(String::as_str).unwrap_or("."), &cwd)?;
                return Ok(String::new());
            }
            let before = std::fs::metadata(&file).and_then(|m| m.modified()).ok();
            launch(&exe, ".", &cwd)?;
            wait_and_send(&file, &cwd, args, before)?
        }
    };
    if reply.ok {
        Ok(reply.output)
    } else {
        Err(if reply.error.is_empty() { "falhou".into() } else { reply.error })
    }
}

/// `termo`, `termo .`, `termo <pasta>`: com o app fechado, basta abri-lo na pasta.
fn opens_folder_only(args: &[String], cwd: &Path) -> bool {
    match args {
        [] => true,
        [a] => !a.starts_with('-') && cwd.join(a).is_dir() && !is_subcommand(a),
        _ => false,
    }
}

fn is_subcommand(a: &str) -> bool {
    matches!(a, "open" | "run" | "claude" | "split" | "tabs" | "ls" | "send" | "focus" | "close" | "title" | "nota" | "note" | "config")
}

/// `termo title`/`termo nota` rodados dentro de um terminal do Termo valem para a própria aba: o app põe o número do
/// terminal em `TERMO_PTY`. Com `--tab`/`--pty` explícito, ou fora do Termo, fica como veio.
fn with_own_tab(args: &[String], pty: Option<&str>) -> Vec<String> {
    let explicit = args.iter().any(|a| matches!(a.as_str(), "--tab" | "-t" | "--pty"));
    match (args.first().map(String::as_str), pty) {
        (Some(cmd @ ("title" | "nota" | "note")), Some(id)) if !explicit && !id.is_empty() => {
            let mut out = vec![cmd.to_string(), "--pty".into(), id.to_string()];
            out.extend_from_slice(&args[1..]);
            out
        }
        _ => args.to_vec(),
    }
}

/// `%APPDATA%\dev.termo.app\control.json` (o `app_config_dir` do Tauri). `TERMO_CONTROL` troca o caminho.
fn control_file() -> Option<PathBuf> {
    if let Some(p) = std::env::var_os("TERMO_CONTROL") {
        return Some(PathBuf::from(p));
    }
    let base = if cfg!(windows) {
        std::env::var_os("APPDATA").map(PathBuf::from)
    } else if cfg!(target_os = "macos") {
        std::env::var_os("HOME").map(|h| PathBuf::from(h).join("Library/Application Support"))
    } else {
        std::env::var_os("XDG_CONFIG_HOME")
            .map(PathBuf::from)
            .or_else(|| std::env::var_os("HOME").map(|h| PathBuf::from(h).join(".config")))
    }?;
    Some(base.join(IDENTIFIER).join("control.json"))
}

fn send(file: &Path, cwd: &str, args: &[String]) -> Result<Reply, String> {
    let raw = std::fs::read(file).map_err(|e| e.to_string())?;
    let info: ControlFile = serde_json::from_slice(&raw).map_err(|e| e.to_string())?;
    let addr = SocketAddr::from(([127, 0, 0, 1], info.port));
    let stream = TcpStream::connect_timeout(&addr, Duration::from_millis(800)).map_err(|e| e.to_string())?;
    stream.set_read_timeout(Some(REPLY_TIMEOUT)).map_err(|e| e.to_string())?;
    let mut line = serde_json::to_vec(&Request { token: &info.token, cwd, args }).map_err(|e| e.to_string())?;
    line.push(b'\n');
    (&stream).write_all(&line).map_err(|e| e.to_string())?;
    let mut out = String::new();
    BufReader::new(&stream).read_line(&mut out).map_err(|e| format!("sem resposta do Termo: {e}"))?;
    serde_json::from_str(&out).map_err(|_| "resposta inválida do Termo".to_string())
}

/// Espera o app novo gravar o `control.json` e responder.
fn wait_and_send(file: &Path, cwd: &str, args: &[String], before: Option<std::time::SystemTime>) -> Result<Reply, String> {
    let start = Instant::now();
    loop {
        let fresh = std::fs::metadata(file).and_then(|m| m.modified()).ok().is_some_and(|t| Some(t) != before);
        if fresh {
            if let Ok(reply) = send(file, cwd, args) {
                return Ok(reply);
            }
        }
        if start.elapsed() > STARTUP_TIMEOUT {
            return Err("o Termo não abriu a tempo".into());
        }
        std::thread::sleep(Duration::from_millis(200));
    }
}

/// O executável do app: `TERMO_APP`; senão, ao lado ou uma pasta acima deste (`<instalação>\bin\termo.exe`).
fn app_exe() -> Option<PathBuf> {
    if let Some(p) = std::env::var_os("TERMO_APP") {
        return Some(PathBuf::from(p));
    }
    let me = std::env::current_exe().ok()?;
    let dir = me.parent()?;
    let names: &[&str] = if cfg!(windows) { &["Termo.exe"] } else { &["termo", "Termo"] };
    let found = [dir.parent(), Some(dir)]
        .into_iter()
        .flatten()
        .flat_map(|d| names.iter().map(move |n| d.join(n)))
        .find(|p| p.is_file() && !same_file(p, &me));
    found
}

fn same_file(a: &Path, b: &Path) -> bool {
    match (std::fs::canonicalize(a), std::fs::canonicalize(b)) {
        (Ok(a), Ok(b)) => a == b,
        _ => false,
    }
}

fn launch(exe: &Path, folder: &str, cwd: &str) -> Result<(), String> {
    Command::new(exe)
        .arg("--cwd")
        .arg(Path::new(cwd).join(folder))
        .current_dir(cwd)
        .spawn()
        .map(|_| ())
        .map_err(|e| format!("não foi possível abrir o Termo ({}): {e}", exe.display()))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn folder_only_when_no_subcommand() {
        let here = std::env::current_dir().unwrap();
        assert!(opens_folder_only(&[], &here));
        assert!(opens_folder_only(&[".".into()], &here));
        assert!(opens_folder_only(&["src".into()], &here));
        assert!(!opens_folder_only(&["tabs".into()], &here));
        assert!(!opens_folder_only(&["run".into(), "ls".into()], &here));
        assert!(!opens_folder_only(&["nao-existe-xyz".into()], &here));
    }

    #[test]
    fn title_targets_own_tab() {
        let v = |s: &[&str]| s.iter().map(|a| a.to_string()).collect::<Vec<_>>();
        assert_eq!(with_own_tab(&v(&["title", "testes"]), Some("4")), v(&["title", "--pty", "4", "testes"]));
        assert_eq!(with_own_tab(&v(&["title", "-t", "2", "x"]), Some("4")), v(&["title", "-t", "2", "x"]));
        assert_eq!(with_own_tab(&v(&["title", "x"]), None), v(&["title", "x"]));
        assert_eq!(with_own_tab(&v(&["tabs"]), Some("4")), v(&["tabs"]));
        assert_eq!(with_own_tab(&v(&["nota", "--add", "ok"]), Some("4")), v(&["nota", "--pty", "4", "--add", "ok"]));
    }

    #[test]
    fn control_file_override() {
        std::env::set_var("TERMO_CONTROL", "x.json");
        assert_eq!(control_file(), Some(PathBuf::from("x.json")));
        std::env::remove_var("TERMO_CONTROL");
        assert!(control_file().unwrap().ends_with("dev.termo.app/control.json"));
    }
}
