//! Sugestões de pastas para o autocomplete: cada uma já vem com o comando `cd` pronto para executar.
//!
//! - texto sem barra (`pro`): pastas da pasta atual (`cd projeto`) e, depois, pastas vizinhas,
//!   fora da pasta atual (`cd ../projeto-x`);
//! - texto com barra (`../ap`, `src/fe`, `C:\Us`): pastas dentro do caminho digitado.

use std::fs;
use std::path::{Path, PathBuf};

use serde::Serialize;

/// Caminho de rede (UNC: `\\servidor\pasta`, `//servidor/pasta`, `\\?\UNC\...`), fora o WSL
/// (`\\wsl.localhost\...` e `\\wsl$\...`, que são locais).
///
/// A pasta atual da aba (`OSC 633;P;Cwd=`) e os caminhos citados na saída chegam de qualquer programa que
/// escreva no terminal (um `cat`, um servidor SSH, um log). Tocar num caminho de rede só para mostrar a
/// branch ou uma prévia abriria uma conexão SMB/WebDAV sozinha, e o Windows manda nela o hash NTLM da
/// pessoa; com o servidor fora do ar, cada chamada ainda espera o tempo limite da rede. Por isso esses
/// recursos automáticos ignoram caminhos de rede.
pub fn is_network_path(p: &str) -> bool {
    let s = p.trim().replace('/', "\\");
    let Some(rest) = s.strip_prefix(r"\\") else { return false };
    // Formato estendido: `\\?\C:\` e `\\.\C:\` são locais; `\\?\UNC\host\...` é rede; o resto (`\\.\pipe\`,
    // dispositivos) também fica de fora.
    if let Some(r) = rest.strip_prefix(r"?\").or_else(|| rest.strip_prefix(r".\")) {
        if r.get(..4).is_some_and(|h| h.eq_ignore_ascii_case(r"UNC\")) {
            return !is_wsl_host(&r[4..]);
        }
        let b = r.as_bytes();
        return !(b.len() >= 2 && b[0].is_ascii_alphabetic() && b[1] == b':');
    }
    !is_wsl_host(rest)
}

fn is_wsl_host(rest: &str) -> bool {
    let host = rest.split('\\').next().unwrap_or("");
    host.eq_ignore_ascii_case("wsl.localhost") || host.eq_ignore_ascii_case("wsl$")
}

/// Poucas por vez: a lista é um atalho e não pode cobrir o terminal.
pub const MAX_SUGGESTIONS: usize = 5;

#[derive(Debug, Clone, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct PathSuggestion {
    /// O que aparece na lista: `projeto`, `../projeto-x`.
    pub label: String,
    /// Comando completo a executar no clique.
    pub command: String,
    /// `child` (dentro da pasta atual), `parent` (vizinha, fora dela) ou `path` (caminho digitado).
    pub scope: &'static str,
}

/// Lista as subpastas de `dir` cujo nome combina com `prefix` (sem diferenciar maiúsculas).
/// Primeiro as que começam com o prefixo, depois as que só o contêm. Pastas ocultas (`.git`)
/// só entram se o prefixo começar com ponto.
fn matching_dirs(dir: &Path, prefix: &str, skip: Option<&str>) -> Vec<String> {
    let Ok(entries) = fs::read_dir(dir) else { return Vec::new() };
    let needle = prefix.to_lowercase();
    let mut starts = Vec::new();
    let mut contains = Vec::new();
    for entry in entries.flatten() {
        if !entry.file_type().map(|t| t.is_dir()).unwrap_or(false) {
            continue;
        }
        let name = entry.file_name().to_string_lossy().into_owned();
        if Some(name.as_str()) == skip || (name.starts_with('.') && !prefix.starts_with('.')) {
            continue;
        }
        let lower = name.to_lowercase();
        if lower.starts_with(&needle) {
            starts.push(name);
        } else if !needle.is_empty() && lower.contains(&needle) {
            contains.push(name);
        }
    }
    starts.sort_by_key(|n| n.to_lowercase());
    contains.sort_by_key(|n| n.to_lowercase());
    starts.extend(contains);
    starts
}

/// Aspas simples para o PowerShell: além do `'`, ele aceita as aspas tipográficas ‘ ’ ‚ ‛ como aspa simples.
/// Um nome de pasta com uma delas fecharia a string, e o resto do nome rodaria como comando.
const PS_SINGLE_QUOTES: [char; 5] = ['\'', '\u{2018}', '\u{2019}', '\u{201A}', '\u{201B}'];

/// `cd projeto` ou `cd '../minha pasta'` (aspas simples do PowerShell quando precisa).
pub fn cd_command(path: &str) -> String {
    let needs_quotes = path
        .chars()
        .any(|c| c.is_whitespace() || c.is_control() || PS_SINGLE_QUOTES.contains(&c) || "\"`$&;(){}[]@#,|<>".contains(c));
    if needs_quotes {
        // Dentro das aspas simples, cada aspa (de qualquer tipo) vale como literal se vier dobrada.
        let mut quoted = String::with_capacity(path.len() + 2);
        for c in path.chars() {
            if PS_SINGLE_QUOTES.contains(&c) {
                quoted.push(c);
            }
            quoted.push(c);
        }
        format!("cd '{quoted}'")
    } else {
        format!("cd {path}")
    }
}

/// O `cd` no formato do shell da aba, ou `None` quando o nome não dá para escrever com segurança nele
/// (a sugestão some). O clique executa o comando, então ele nunca pode sair da string.
pub fn cd_command_for(path: &str, family: &str) -> Option<String> {
    if path.chars().any(char::is_control) {
        return None;
    }
    match family {
        // cmd: aspas duplas não protegem `"`, e `%`/`!` expandem variáveis mesmo entre aspas.
        "cmd" => (!path.contains(['"', '%', '!'])).then(|| format!("cd /d \"{path}\"")),
        // bash (Git Bash e WSL): aspas simples, e a aspa simples vira '\''.
        "bash" | "wsl" => {
            let safe = path.chars().all(|c| c.is_alphanumeric() || "._-/~+".contains(c));
            Some(if safe { format!("cd {path}") } else { format!("cd '{}'", path.replace('\'', r"'\''")) })
        }
        _ => Some(cd_command(path)),
    }
}

/// [`suggest`] com o `cd` no formato do shell da aba (`pwsh`, `powershell`, `cmd`, `bash` ou `wsl`).
pub fn suggest_for(cwd: &Path, query: &str, recent: &[PathBuf], family: &str) -> Vec<PathSuggestion> {
    suggest(cwd, query, recent)
        .into_iter()
        .filter_map(|s| Some(PathSuggestion { command: cd_command_for(&s.label, family)?, ..s }))
        .collect()
}

/// Último nome digitado, para buscar nas pastas recentes: `../termo\` → `termo`.
fn last_name(query: &str) -> &str {
    query.split(['/', '\\']).rev().find(|s| !s.is_empty() && *s != "." && *s != "..").unwrap_or("")
}

fn same_dir(a: &Path, b: &Path) -> bool {
    let (a, b) = (a.to_string_lossy(), b.to_string_lossy());
    let (a, b) = (a.trim_end_matches(['\\', '/']), b.trim_end_matches(['\\', '/']));
    if cfg!(windows) {
        a.eq_ignore_ascii_case(b)
    } else {
        a == b
    }
}

/// Pastas recentes cujo nome combina com `needle` (começa com, depois contém), fora da pasta atual
/// e das já sugeridas. Vêm com o caminho completo: funcionam de qualquer lugar.
fn matching_recent(recent: &[PathBuf], needle: &str, cwd: &Path, skip: &[PathBuf]) -> Vec<PathSuggestion> {
    if needle.is_empty() {
        return Vec::new();
    }
    let needle = needle.to_lowercase();
    let mut starts = Vec::new();
    let mut contains = Vec::new();
    for dir in recent {
        // As de `skip` vêm canonizadas (nome longo); a recente pode ter sido gravada com nome curto (8.3).
        let canonical = dir.canonicalize().map(strip_verbatim).unwrap_or_else(|_| dir.clone());
        if same_dir(dir, cwd) || skip.iter().any(|s| same_dir(s, dir) || same_dir(s, &canonical)) {
            continue;
        }
        let Some(name) = dir.file_name().map(|n| n.to_string_lossy().to_lowercase()) else { continue };
        if name.starts_with(&needle) {
            starts.push(dir);
        } else if name.contains(&needle) {
            contains.push(dir);
        }
    }
    starts
        .into_iter()
        .chain(contains)
        .map(|dir| {
            let label = dir.to_string_lossy().into_owned();
            PathSuggestion { command: cd_command(&label), label, scope: "recent" }
        })
        .collect()
}

/// `recent`: pastas visitadas, da mais para a menos relevante (frecência).
pub fn suggest(cwd: &Path, query: &str, recent: &[PathBuf]) -> Vec<PathSuggestion> {
    let query = query.trim().trim_matches(|c| c == '\'' || c == '"');
    let make = |label: String, scope| PathSuggestion { command: cd_command(&label), label, scope };

    // Caminho digitado: completa o último pedaço dentro da pasta indicada. Se a pasta não
    // existe (ex.: `../termo\` no lugar errado), cai nas recentes com o mesmo nome.
    if let Some(cut) = query.rfind(['/', '\\']) {
        let (dir_part, prefix) = (&query[..=cut], &query[cut + 1..]);
        let base = cwd.join(dir_part);
        let local: Vec<PathSuggestion> = matching_dirs(&base, prefix, None)
            .into_iter()
            .take(MAX_SUGGESTIONS)
            .map(|name| make(format!("{dir_part}{name}"), "path"))
            .collect();
        if !local.is_empty() {
            return local;
        }
        return matching_recent(recent, last_name(query), cwd, &[]).into_iter().take(MAX_SUGGESTIONS).collect();
    }

    let mut out: Vec<PathSuggestion> =
        matching_dirs(cwd, query, None).into_iter().map(|name| make(name, "child")).collect();

    // Fora do escopo: pastas vizinhas, via `../`.
    if let Some(parent) = cwd.parent() {
        let own = cwd.file_name().map(|n| n.to_string_lossy().into_owned());
        if query.is_empty() {
            out.push(make("..".into(), "parent"));
        } else {
            out.extend(
                matching_dirs(parent, query, own.as_deref()).into_iter().map(|name| make(format!("../{name}"), "parent")),
            );
        }
    }

    // Recentes de qualquer lugar (sem repetir as que já aparecem como filha ou vizinha).
    let already: Vec<PathBuf> = out
        .iter()
        .map(|s| cwd.join(&s.label))
        .filter_map(|p| p.canonicalize().ok().or(Some(p)))
        .map(strip_verbatim)
        .collect();
    let recents = matching_recent(recent, query, cwd, &already);

    // Garante espaço para recentes e vizinhas mesmo quando a pasta atual tem muitas opções.
    let (children, parents): (Vec<_>, Vec<_>) = out.into_iter().partition(|s| s.scope == "child");
    // Uma vaga garantida para cada; as filhas ficam com pelo menos 3 das 5.
    let recent_slots = recents.len().min(1);
    let parent_slots = parents.len().min(1);
    let mut result: Vec<_> = children.into_iter().take(MAX_SUGGESTIONS - parent_slots - recent_slots).collect();
    let room = MAX_SUGGESTIONS - result.len() - parent_slots;
    result.extend(recents.into_iter().take(room));
    result.extend(parents.into_iter().take(MAX_SUGGESTIONS - result.len()));
    result
}

/// `canonicalize` no Windows devolve `\\?\D:\...`; tira o prefixo para comparar caminhos.
fn strip_verbatim(p: PathBuf) -> PathBuf {
    let s = p.to_string_lossy();
    match s.strip_prefix(r"\\?\") {
        Some(rest) => PathBuf::from(rest),
        None => p,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    /// raiz/
    ///   atual/ (pasta de trabalho) com projeto, Pro Max, .git, outro, arquivo.txt
    ///   projeto-vizinho/, docs/
    fn fixture(name: &str) -> (PathBuf, PathBuf) {
        let root = std::env::temp_dir().join(format!("termo-paths-{name}-{}", std::process::id()));
        let _ = fs::remove_dir_all(&root);
        let cwd = root.join("atual");
        for d in ["atual/projeto", "atual/Pro Max", "atual/.git", "atual/outro", "projeto-vizinho", "docs"] {
            fs::create_dir_all(root.join(d)).unwrap();
        }
        fs::write(cwd.join("arquivo.txt"), "x").unwrap();
        (root, cwd)
    }

    fn labels(v: &[PathSuggestion]) -> Vec<&str> {
        v.iter().map(|s| s.label.as_str()).collect()
    }

    #[test]
    fn children_then_siblings() {
        let (root, cwd) = fixture("a");
        let s = suggest(&cwd, "pro", &[]);
        assert_eq!(labels(&s), vec!["Pro Max", "projeto", "../projeto-vizinho"]);
        assert_eq!(s[0].command, "cd 'Pro Max'");
        assert_eq!(s[1].command, "cd projeto");
        assert_eq!(s[2].command, "cd ../projeto-vizinho");
        assert_eq!(s[2].scope, "parent");
        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn hides_dotdirs_files_and_own_folder() {
        let (root, cwd) = fixture("b");
        let s = suggest(&cwd, "", &[]);
        assert!(!labels(&s).contains(&".git"));
        assert!(!labels(&s).contains(&"arquivo.txt"));
        assert!(labels(&s).contains(&".."));
        assert!(!suggest(&cwd, "atu", &[]).iter().any(|x| x.label == "../atual"));
        assert_eq!(labels(&suggest(&cwd, ".g", &[])), vec![".git"]);
        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn typed_path_completes_inside_it() {
        let (root, cwd) = fixture("c");
        let s = suggest(&cwd, "../do", &[]);
        assert_eq!(labels(&s), vec!["../docs"]);
        assert_eq!(s[0].scope, "path");
        assert_eq!(labels(&suggest(&cwd, "../", &[])), vec!["../atual", "../docs", "../projeto-vizinho"]);
        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn substring_matches_come_after_prefix() {
        let (root, cwd) = fixture("d");
        assert_eq!(labels(&suggest(&cwd, "jet", &[])), vec!["projeto", "../projeto-vizinho"]);
        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn recent_folders_from_anywhere() {
        let (root, cwd) = fixture("e");
        let elsewhere = root.join("outro-lugar").join("termo");
        fs::create_dir_all(&elsewhere).unwrap();
        let recent = vec![elsewhere.clone(), cwd.clone(), root.join("projeto-vizinho")];

        // Nome solto: filhas, depois a recente de outro lugar (com caminho completo).
        let s = suggest(&cwd, "ter", &recent);
        assert_eq!(s.len(), 1);
        assert_eq!(s[0].scope, "recent");
        assert_eq!(s[0].label, elsewhere.to_string_lossy());

        // A pasta atual e as vizinhas já sugeridas não se repetem como recentes.
        let s = suggest(&cwd, "proj", &recent);
        assert_eq!(labels(&s), vec!["projeto", "../projeto-vizinho"]);

        // Caminho que não existe (`../termo\`): cai na recente com o mesmo nome.
        let s = suggest(&cwd, r"../termo\", &recent);
        assert_eq!(labels(&s), vec![elsewhere.to_string_lossy().as_ref()]);
        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn last_name_ignores_dots_and_separators() {
        assert_eq!(last_name(r"../termo\"), "termo");
        assert_eq!(last_name("./a/b"), "b");
        assert_eq!(last_name(".."), "");
    }

    #[test]
    fn quotes_only_when_needed() {
        assert_eq!(cd_command("src"), "cd src");
        assert_eq!(cd_command("../a b"), "cd '../a b'");
        assert_eq!(cd_command("it's"), "cd 'it''s'");
    }

    #[test]
    fn network_paths_are_recognized() {
        for p in [r"\\servidor\pasta", "//servidor/pasta", r"\\?\UNC\servidor\pasta", r"\\10.0.0.1\c$", r"\\.\pipe\x"] {
            assert!(is_network_path(p), "{p}");
        }
        for p in [
            r"C:\Users",
            "D:/estudos",
            r"\\wsl.localhost\Ubuntu\home",
            r"\\wsl$\Ubuntu",
            r"\\?\C:\x",
            r"\\?\UNC\wsl.localhost\Ubuntu",
            "src",
            "",
        ] {
            assert!(!is_network_path(p), "{p}");
        }
    }

    #[test]
    fn typographic_quotes_cannot_close_the_powershell_string() {
        // ‘ e ’ fecham uma string de aspas simples no PowerShell: precisam vir dobradas.
        assert_eq!(cd_command("a\u{2019};calc"), "cd 'a\u{2019}\u{2019};calc'");
        assert_eq!(cd_command("x\u{2018}y"), "cd 'x\u{2018}\u{2018}y'");
        assert_eq!(cd_command("\u{201A}\u{201B}"), "cd '\u{201A}\u{201A}\u{201B}\u{201B}'");
    }

    #[test]
    fn cd_follows_the_shell_family() {
        assert_eq!(cd_command_for("a b", "pwsh").as_deref(), Some("cd 'a b'"));
        assert_eq!(cd_command_for("a b&c", "cmd").as_deref(), Some("cd /d \"a b&c\""));
        assert_eq!(cd_command_for("50%", "cmd"), None);
        assert_eq!(cd_command_for("a\"b", "cmd"), None);
        assert_eq!(cd_command_for("src/app", "bash").as_deref(), Some("cd src/app"));
        assert_eq!(cd_command_for("it's;x", "wsl").as_deref(), Some(r"cd 'it'\''s;x'"));
        assert_eq!(cd_command_for("a\nb", "pwsh"), None);
    }
}
