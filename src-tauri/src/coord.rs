//! Acompanhamento das sessões do Claude Code pelo painel do coord (`~/.claude/coord/coord.js serve 4747`).
//!
//! O painel já junta `claude agents --json --all` com o plano, o progresso e as reservas de cada sessão
//! (`/agents`) e guarda o histórico das que acabaram (`/state`). Aqui só lemos esses JSON por HTTP no
//! 127.0.0.1; se o painel não estiver rodando, ele é iniciado em segundo plano (como faz o
//! `abrir-painel.cmd`). Nada sai da máquina.

use std::io::{Read, Write};
use std::net::{SocketAddr, TcpStream};
use std::path::PathBuf;
use std::time::Duration;

pub const PORT: u16 = 4747;

/// Caminhos que o app pode pedir ao painel (só leitura).
const ALLOWED: [&str; 2] = ["/agents", "/state"];

fn addr() -> SocketAddr {
    SocketAddr::from(([127, 0, 0, 1], PORT))
}

fn coord_script() -> Option<PathBuf> {
    let p = dirs::home_dir()?.join(".claude").join("coord").join("coord.js");
    p.is_file().then_some(p)
}

/// Separa o corpo de uma resposta HTTP/1.0 e confere o status 200.
fn parse_response(raw: &[u8]) -> Result<&[u8], String> {
    let split = raw.windows(4).position(|w| w == b"\r\n\r\n").ok_or("resposta do painel incompleta")?;
    let head = std::str::from_utf8(&raw[..split]).map_err(|_| "cabeçalho inválido do painel")?;
    let status = head.split_whitespace().nth(1).unwrap_or("");
    if status != "200" {
        return Err(format!("o painel respondeu {status}"));
    }
    Ok(&raw[split + 4..])
}

fn get(path: &str, timeout: Duration) -> std::io::Result<Vec<u8>> {
    let mut stream = TcpStream::connect_timeout(&addr(), Duration::from_millis(600))?;
    stream.set_read_timeout(Some(timeout))?;
    stream.set_write_timeout(Some(Duration::from_secs(2)))?;
    write!(stream, "GET {path} HTTP/1.0\r\nHost: 127.0.0.1:{PORT}\r\nConnection: close\r\n\r\n")?;
    let mut buf = Vec::new();
    stream.read_to_end(&mut buf)?;
    Ok(buf)
}

/// Inicia `node coord.js serve 4747` sem janela e sem esperar.
fn start_panel() -> Result<(), String> {
    let script = coord_script().ok_or("o coord não está instalado em ~/.claude/coord")?;
    let mut cmd = std::process::Command::new("node");
    cmd.arg(script).args(["serve", &PORT.to_string()]);
    cmd.stdin(std::process::Stdio::null()).stdout(std::process::Stdio::null()).stderr(std::process::Stdio::null());
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        // CREATE_NO_WINDOW | DETACHED_PROCESS: sem console e independente do Termo.
        cmd.creation_flags(0x0800_0000 | 0x0000_0008);
    }
    cmd.spawn().map(|_| ()).map_err(|e| format!("não foi possível iniciar o painel (node): {e}"))
}

/// Lê um JSON do painel, iniciando-o se for preciso. `/agents` roda `claude agents` e pode levar alguns
/// segundos na primeira vez.
pub fn fetch(path: &str) -> Result<serde_json::Value, String> {
    if !ALLOWED.contains(&path) {
        return Err(format!("caminho não permitido: {path}"));
    }
    let timeout = Duration::from_secs(20);
    let raw = match get(path, timeout) {
        Ok(raw) => raw,
        Err(_) => {
            start_panel()?;
            let mut last = None;
            let mut got = None;
            for _ in 0..10 {
                std::thread::sleep(Duration::from_millis(300));
                match get(path, timeout) {
                    Ok(raw) => {
                        got = Some(raw);
                        break;
                    }
                    Err(e) => last = Some(e),
                }
            }
            got.ok_or_else(|| format!("o painel não respondeu: {}", last.map(|e| e.to_string()).unwrap_or_default()))?
        }
    };
    let body = parse_response(&raw)?;
    serde_json::from_slice(body).map_err(|e| format!("JSON inválido do painel: {e}"))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_ok_response() {
        let raw = b"HTTP/1.1 200 OK\r\ncontent-type: application/json\r\n\r\n{\"a\":1}";
        assert_eq!(parse_response(raw).unwrap(), b"{\"a\":1}");
    }

    #[test]
    fn rejects_error_status_and_garbage() {
        assert!(parse_response(b"HTTP/1.1 500 Internal\r\n\r\n{}").unwrap_err().contains("500"));
        assert!(parse_response(b"lixo").is_err());
    }

    #[test]
    fn only_known_paths() {
        assert!(fetch("/release?all=1").unwrap_err().contains("não permitido"));
    }
}
