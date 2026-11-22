//! IA do terminal pelo Claude Code instalado (`claude -p`), sem chave de API: usa a conta do usuário.
//!
//! Dois pedidos:
//! - **explicar erro**: comando, código de saída e o fim da saída → explicação curta e a correção;
//! - **comando**: pedido em linguagem natural → um comando do PowerShell (não é executado, vai para a caixa).
//!
//! O prompt vai pela entrada padrão (o `claude` pode ser um `.cmd`, e argumentos com quebra de linha não
//! passam bem pelo `cmd.exe`). Roda sem ferramentas (`--tools ""`), sem salvar sessão e sem as
//! configurações do usuário (`--setting-sources project,local`), para os hooks dele não dispararem.

use std::io::{Read, Write};
use std::path::Path;
use std::process::{Command, Stdio};
use std::time::{Duration, Instant};

const TIMEOUT: Duration = Duration::from_secs(120);
/// Saída máxima do comando que falhou mandada ao modelo (o fim é o que importa num erro).
const MAX_OUTPUT: usize = 8000;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Mode {
    Explain,
    Command,
}

impl Mode {
    pub fn parse(s: &str) -> Result<Self, String> {
        match s {
            "explain" => Ok(Mode::Explain),
            "command" => Ok(Mode::Command),
            _ => Err(format!("pedido de IA desconhecido: {s}")),
        }
    }
}

fn tail(s: &str, max: usize) -> &str {
    if s.len() <= max {
        return s;
    }
    let mut i = s.len() - max;
    while !s.is_char_boundary(i) {
        i += 1;
    }
    &s[i..]
}

/// Texto mandado ao modelo.
pub fn build_prompt(mode: Mode, input: &str, cwd: Option<&str>, shell: &str) -> String {
    let cwd = cwd.unwrap_or("(desconhecida)");
    match mode {
        Mode::Explain => format!(
            "Você é o assistente de um terminal no Windows ({shell}). Um comando falhou. Explique em português \
do Brasil, em no máximo 6 linhas, a causa provável e como corrigir. Se houver um comando de correção, ponha-o \
sozinho num bloco ```powershell```. Não use ferramentas.\n\nPasta atual: {cwd}\n\n{}",
            tail(input, MAX_OUTPUT)
        ),
        Mode::Command => format!(
            "Converta o pedido abaixo em UM comando do {shell} para Windows. Responda só com o comando, numa \
linha, sem explicação, sem crases e sem bloco de código. Se for preciso mais de um passo, junte com `;`. \
Não use ferramentas.\n\nPasta atual: {cwd}\nPedido: {}",
            input.trim()
        ),
    }
}

/// Limpa a resposta: no modo comando, tira crases, bloco de código e o prompt `PS>` que o modelo às vezes põe.
pub fn clean(mode: Mode, out: &str) -> String {
    let text = out.trim();
    if mode == Mode::Explain {
        return text.to_string();
    }
    let mut lines: Vec<&str> = text.lines().filter(|l| !l.trim_start().starts_with("```")).collect();
    lines.retain(|l| !l.trim().is_empty());
    let cmd = lines.join("; ");
    let cmd = cmd.trim().trim_matches('`').trim();
    cmd.strip_prefix("PS> ").or_else(|| cmd.strip_prefix("> ")).unwrap_or(cmd).trim().to_string()
}

/// Roda `claude -p` com o prompt na entrada padrão e devolve a resposta limpa.
pub fn ask(claude: &Path, mode: Mode, input: &str, cwd: Option<&str>, shell: &str) -> Result<String, String> {
    if input.trim().is_empty() {
        return Err("nada para perguntar".into());
    }
    let prompt = build_prompt(mode, input, cwd, shell);
    let mut cmd = Command::new(claude);
    cmd.args(["-p", "--model", "haiku", "--tools", "", "--no-session-persistence", "--setting-sources", "project,local"]);
    if let Some(dir) = cwd.filter(|d| Path::new(d).is_dir()) {
        cmd.current_dir(dir);
    }
    cmd.stdin(Stdio::piped()).stdout(Stdio::piped()).stderr(Stdio::piped());
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        cmd.creation_flags(0x0800_0000); // CREATE_NO_WINDOW
    }
    let mut child = cmd.spawn().map_err(|e| format!("não foi possível rodar o Claude Code: {e}"))?;
    if let Some(mut stdin) = child.stdin.take() {
        stdin.write_all(prompt.as_bytes()).map_err(|e| e.to_string())?;
    }
    let mut stdout = child.stdout.take().ok_or("sem saída do Claude Code")?;
    let mut stderr = child.stderr.take().ok_or("sem saída do Claude Code")?;
    let out_reader = std::thread::spawn(move || {
        let mut s = String::new();
        let _ = stdout.read_to_string(&mut s);
        s
    });
    let err_reader = std::thread::spawn(move || {
        let mut s = String::new();
        let _ = stderr.read_to_string(&mut s);
        s
    });
    let started = Instant::now();
    let status = loop {
        if let Some(status) = child.try_wait().map_err(|e| e.to_string())? {
            break status;
        }
        if started.elapsed() > TIMEOUT {
            let _ = child.kill();
            return Err("o Claude Code demorou demais para responder".into());
        }
        std::thread::sleep(Duration::from_millis(100));
    };
    let out = out_reader.join().unwrap_or_default();
    let err = err_reader.join().unwrap_or_default();
    if !status.success() {
        let msg = if err.trim().is_empty() { out.trim() } else { err.trim() };
        return Err(format!("o Claude Code falhou: {}", tail(msg, 500)));
    }
    let answer = clean(mode, &out);
    if answer.is_empty() {
        return Err("o Claude Code não respondeu nada".into());
    }
    Ok(answer)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn modes() {
        assert_eq!(Mode::parse("explain"), Ok(Mode::Explain));
        assert_eq!(Mode::parse("command"), Ok(Mode::Command));
        assert!(Mode::parse("rm").is_err());
    }

    #[test]
    fn cleans_commands() {
        assert_eq!(clean(Mode::Command, "```powershell\nGet-ChildItem -Recurse\n```\n"), "Get-ChildItem -Recurse");
        assert_eq!(clean(Mode::Command, "`ls`"), "ls");
        assert_eq!(clean(Mode::Command, "PS> git status"), "git status");
        assert_eq!(clean(Mode::Command, "cd x\nls"), "cd x; ls");
        assert_eq!(clean(Mode::Explain, "  texto\n"), "texto");
    }

    #[test]
    fn prompt_keeps_the_end_of_long_output() {
        let long = format!("{}FIM", "é".repeat(MAX_OUTPUT));
        let p = build_prompt(Mode::Explain, &long, Some("C:\\x"), "PowerShell");
        assert!(p.ends_with("FIM"));
        assert!(p.contains("C:\\x"));
        assert!(build_prompt(Mode::Command, " listar arquivos ", None, "PowerShell").ends_with("Pedido: listar arquivos"));
    }
}
