//! Histórico de comandos do PSReadLine (`ConsoleHost_history.txt`) para a busca do Ctrl+R.
//!
//! O arquivo guarda um comando por linha; comandos de várias linhas terminam cada linha (menos a última)
//! com uma crase. Aqui eles são juntados com `\n`, sem repetição, do mais recente para o mais antigo.

use std::fs::File;
use std::io::{Read, Seek, SeekFrom};
use std::path::PathBuf;

/// Quantos comandos devolver, no máximo.
pub const MAX_ENTRIES: usize = 20_000;
pub const DEFAULT_ENTRIES: usize = 5_000;
/// Só o fim do arquivo é lido: um histórico enorme não pode travar o Ctrl+R.
const MAX_BYTES: u64 = 4 * 1024 * 1024;
/// Comandos maiores que isso (colagens de scripts) não servem para a busca.
const MAX_COMMAND_CHARS: usize = 2_000;

/// Onde o PSReadLine grava o histórico (`%APPDATA%\Microsoft\Windows\PowerShell\PSReadLine`).
fn history_path() -> Option<PathBuf> {
    let base = dirs::data_dir()?;
    Some(base.join(r"Microsoft\Windows\PowerShell\PSReadLine\ConsoleHost_history.txt"))
}

/// Transforma o texto do arquivo nos comandos: junta as continuações com crase, tira as repetições
/// (fica a ocorrência mais recente) e devolve os `limit` mais recentes primeiro.
pub fn parse_history(text: &str, limit: usize) -> Vec<String> {
    let mut commands: Vec<String> = Vec::new();
    let mut current: Option<String> = None;
    for raw in text.lines() {
        let line = raw.trim_end_matches('\r');
        match current.take() {
            Some(mut acc) => {
                acc.push('\n');
                acc.push_str(line.strip_suffix('`').unwrap_or(line));
                if line.ends_with('`') {
                    current = Some(acc);
                } else {
                    commands.push(acc);
                }
            }
            None => {
                if let Some(head) = line.strip_suffix('`') {
                    current = Some(head.to_string());
                } else {
                    commands.push(line.to_string());
                }
            }
        }
    }
    // Continuação que ficou aberta no fim (arquivo cortado): vale como está.
    if let Some(acc) = current {
        commands.push(acc);
    }

    let mut seen = std::collections::HashSet::new();
    let mut out = Vec::new();
    for cmd in commands.into_iter().rev() {
        let cmd = cmd.trim().to_string();
        if cmd.is_empty() || cmd.chars().count() > MAX_COMMAND_CHARS || !seen.insert(cmd.clone()) {
            continue;
        }
        out.push(cmd);
        if out.len() >= limit {
            break;
        }
    }
    out
}

/// Lê o fim do arquivo (até `MAX_BYTES`), sem a primeira linha quando ela pode ter sido cortada no meio.
fn read_tail(path: &std::path::Path) -> std::io::Result<String> {
    let mut file = File::open(path)?;
    let len = file.metadata()?.len();
    let cut = len > MAX_BYTES;
    if cut {
        file.seek(SeekFrom::Start(len - MAX_BYTES))?;
    }
    let mut bytes = Vec::new();
    file.read_to_end(&mut bytes)?;
    let text = String::from_utf8_lossy(&bytes).into_owned();
    if cut {
        // Descarta o pedaço de linha do começo.
        return Ok(text.split_once('\n').map(|(_, rest)| rest.to_string()).unwrap_or_default());
    }
    Ok(text)
}

/// Os últimos `limit` comandos distintos do histórico do PSReadLine, mais recentes primeiro.
/// Sem arquivo (PowerShell nunca usado) devolve lista vazia.
pub fn read(limit: Option<usize>) -> Vec<String> {
    let limit = limit.unwrap_or(DEFAULT_ENTRIES).clamp(1, MAX_ENTRIES);
    let Some(path) = history_path() else { return Vec::new() };
    match read_tail(&path) {
        Ok(text) => parse_history(&text, limit),
        Err(_) => Vec::new(),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn most_recent_first_without_repeats() {
        let text = "git status\nls\ngit status\ncd ..\n";
        assert_eq!(parse_history(text, 10), vec!["cd ..", "git status", "ls"]);
    }

    #[test]
    fn joins_lines_ending_with_backtick() {
        let text = "echo a\nGet-ChildItem `\n  -Recurse `\n  -Force\nls\n";
        assert_eq!(parse_history(text, 10), vec!["ls", "Get-ChildItem \n  -Recurse \n  -Force", "echo a"]);
    }

    #[test]
    fn handles_crlf_blank_lines_and_open_continuation() {
        let text = "a\r\n\r\n   \r\nb `\r\nc `\r\n";
        // A continuação aberta no fim vale como está.
        assert_eq!(parse_history(text, 10), vec!["b \nc", "a"]);
    }

    #[test]
    fn respects_the_limit_and_skips_huge_commands() {
        let big = "x".repeat(MAX_COMMAND_CHARS + 1);
        let text = format!("um\ndois\n{big}\ntres\n");
        assert_eq!(parse_history(&text, 2), vec!["tres", "dois"]);
    }

    #[test]
    fn empty_file_gives_empty_list() {
        assert!(parse_history("", 10).is_empty());
    }
}
