//! Hosts do `~/.ssh/config` para as abas SSH: só os nomes (sem curingas), validados. O Termo nunca executa
//! nada além de `ssh <host>`; o nome do host passa por `is_valid_host` antes de virar argumento.

use std::path::{Path, PathBuf};

/// Máximo de hosts listados e tamanho do arquivo lido (um config gigante não pode travar o menu).
pub const MAX_HOSTS: usize = 100;
const MAX_CONFIG_BYTES: u64 = 1024 * 1024;

/// Nome de host aceito: letras, números, `.`, `_` e `-`, de 1 a 255 caracteres, sem começar por `-` (seria
/// uma opção do ssh) nem por `.`. Sem espaços, aspas, `;`, `@`, `:` ou qualquer caractere de shell.
pub fn is_valid_host(h: &str) -> bool {
    (1..=255).contains(&h.len())
        && !h.starts_with(['-', '.'])
        && h.chars().all(|c| c.is_ascii_alphanumeric() || "._-".contains(c))
}

/// Nomes das linhas `Host` do config, sem curingas (`*`, `?`), sem negações (`!`) e sem repetição.
/// Aceita `Host a b`, `host=a` e comentários no fim da linha. `Include` não é seguido.
pub fn parse_config(text: &str) -> Vec<String> {
    let mut out: Vec<String> = Vec::new();
    for line in text.lines() {
        let line = line.trim_start();
        let (key, rest) = match line.find(|c: char| c.is_whitespace() || c == '=') {
            Some(i) => (&line[..i], line[i..].trim_start_matches(|c: char| c.is_whitespace() || c == '=')),
            None => continue,
        };
        if !key.eq_ignore_ascii_case("host") {
            continue;
        }
        let rest = rest.split('#').next().unwrap_or("");
        for name in rest.split_whitespace() {
            if is_valid_host(name) && !out.iter().any(|h| h == name) {
                out.push(name.to_string());
                if out.len() >= MAX_HOSTS {
                    return out;
                }
            }
        }
    }
    out
}

fn config_path() -> Option<PathBuf> {
    dirs::home_dir().map(|h| h.join(".ssh").join("config"))
}

fn read_limited(path: &Path) -> Option<String> {
    let meta = std::fs::metadata(path).ok()?;
    if !meta.is_file() || meta.len() > MAX_CONFIG_BYTES {
        return None;
    }
    std::fs::read_to_string(path).ok()
}

/// Hosts do `~/.ssh/config` do usuário (vazio se o arquivo não existe ou não dá para ler).
pub fn hosts() -> Vec<String> {
    config_path().and_then(|p| read_limited(&p)).map(|t| parse_config(&t)).unwrap_or_default()
}

/// `ssh.exe` do PATH ou do OpenSSH que vem com o Windows.
pub fn find_ssh() -> Option<PathBuf> {
    which::which("ssh").ok().or_else(|| {
        std::env::var_os("SystemRoot")
            .map(|r| PathBuf::from(r).join("System32").join("OpenSSH").join("ssh.exe"))
            .filter(|p| p.is_file())
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn lists_hosts_without_wildcards() {
        let cfg = "# meus servidores\nHost *\n  ForwardAgent yes\nHost web prod-1.example.com\n  HostName 10.0.0.1\nhost=db # banco\n\nHost !bad *.local app? web\nMatch host x\n  User root\n";
        assert_eq!(parse_config(cfg), vec!["web", "prod-1.example.com", "db"]);
    }

    #[test]
    fn host_names_are_checked() {
        for ok in ["web", "prod-1.example.com", "a_b", "10.0.0.1"] {
            assert!(is_valid_host(ok), "{ok}");
        }
        for bad in ["", "-oProxyCommand=x", ".x", "a b", "a;b", "a$(b)", "a'b", "u@h", "h:22", "a*", "a\"b", "a\nb"] {
            assert!(!is_valid_host(bad), "{bad}");
        }
        assert!(!is_valid_host(&"a".repeat(256)));
    }

    #[test]
    fn ignores_hostname_lines_and_limits_count() {
        assert!(parse_config("HostName x\nHostKeyAlgorithms y").is_empty());
        let big: String = (0..300).map(|i| format!("Host h{i}\n")).collect();
        assert_eq!(parse_config(&big).len(), MAX_HOSTS);
    }
}
