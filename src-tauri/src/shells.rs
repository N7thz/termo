//! Perfis de shell: detecção (pwsh, Windows PowerShell, cmd, Git Bash, distros do WSL) e o plano de abertura de cada um
//! (executável, argumentos e integração OSC 133/633).
//!
//! O perfil é o mesmo texto de `Settings.default_shell` (veja `settings::is_valid_shell`): `auto`, `pwsh`,
//! `powershell`, `cmd`, `bash` (Git Bash), `wsl` ou `wsl:<distro>`.

use std::path::{Path, PathBuf};

use serde::Serialize;

use crate::settings::is_valid_shell;
use crate::shell;

#[derive(Clone, Debug, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct ShellInfo {
    /// O valor de `defaultShell` que abre este shell.
    pub id: String,
    pub label: String,
    /// `pwsh`, `powershell`, `cmd`, `bash` ou `wsl`.
    pub family: &'static str,
}

/// Família de um perfil já validado (`pwsh`, `powershell`, `cmd`, `bash`, `wsl`), ou `None` para `auto`.
pub fn family_of(id: &str) -> Option<&'static str> {
    match id {
        "pwsh" => Some("pwsh"),
        "powershell" => Some("powershell"),
        "cmd" => Some("cmd"),
        "bash" => Some("bash"),
        _ if id == "wsl" || id.starts_with("wsl:") => Some("wsl"),
        _ => None,
    }
}

fn system32(exe: &str) -> Option<PathBuf> {
    std::env::var_os("SystemRoot").map(|r| PathBuf::from(r).join("System32").join(exe)).filter(|p| p.is_file())
}

pub fn find_pwsh() -> Option<PathBuf> {
    if !cfg!(windows) {
        return which::which("pwsh").ok();
    }
    which::which("pwsh").ok().or_else(|| {
        std::env::var_os("ProgramFiles")
            .map(|p| PathBuf::from(p).join(r"PowerShell\7\pwsh.exe"))
            .filter(|p| p.is_file())
    })
}

pub fn find_powershell() -> Option<PathBuf> {
    which::which("powershell").ok().or_else(|| system32(r"WindowsPowerShell\v1.0\powershell.exe"))
}

pub fn find_cmd() -> Option<PathBuf> {
    std::env::var_os("ComSpec")
        .map(PathBuf::from)
        .filter(|p| p.is_file())
        .or_else(|| system32("cmd.exe"))
        .or_else(|| which::which("cmd").ok())
}

/// `bin\bash.exe` de uma instalação do Git for Windows (a pasta tem também `usr\bin`).
fn git_bash_in(root: &Path) -> Option<PathBuf> {
    let bash = root.join("bin").join("bash.exe");
    (bash.is_file() && root.join("usr").join("bin").is_dir()).then_some(bash)
}

/// Git Bash: o `bin\bash.exe` do Git for Windows, que acerta PATH e MSYSTEM antes de abrir o bash. Procura nas
/// pastas de instalação comuns e, depois, subindo a partir do `git.exe` do PATH (`<Git>\cmd\git.exe` ou
/// `<Git>\mingw64\bin\git.exe`). Nunca usa o `bash` do PATH: no System32 ele é o lançador do WSL.
pub fn find_git_bash() -> Option<PathBuf> {
    if !cfg!(windows) {
        return None;
    }
    let installed = ["ProgramFiles", "ProgramW6432", "ProgramFiles(x86)"]
        .iter()
        .filter_map(|v| std::env::var_os(v).map(|p| PathBuf::from(p).join("Git")))
        .chain(std::env::var_os("LOCALAPPDATA").map(|p| PathBuf::from(p).join("Programs").join("Git")))
        .find_map(|root| git_bash_in(&root));
    installed.or_else(|| {
        let git = which::which("git").ok()?;
        git.ancestors().skip(1).take(3).find_map(git_bash_in)
    })
}

pub fn find_wsl() -> Option<PathBuf> {
    which::which("wsl").ok().or_else(|| system32("wsl.exe"))
}

/// Decodifica a saída do `wsl.exe -l -q`: UTF-16LE (com ou sem BOM), cheia de NULs se lida como bytes.
/// Cai para UTF-8 quando não parece UTF-16 (versões novas do WSL com `WSL_UTF8=1`).
fn decode_wsl_output(bytes: &[u8]) -> String {
    let utf16 = bytes.len() >= 2 && (bytes[1] == 0 || bytes.starts_with(&[0xFF, 0xFE]));
    if utf16 {
        let units: Vec<u16> = bytes.chunks_exact(2).map(|c| u16::from_le_bytes([c[0], c[1]])).collect();
        String::from_utf16_lossy(&units)
    } else {
        String::from_utf8_lossy(bytes).into_owned()
    }
}

/// Nomes das distros na saída do `wsl.exe -l -q`. Descarta linhas vazias, o BOM, nomes que não
/// passam em `is_valid_shell` e as distros internas do Docker Desktop (sem shell interativo útil).
pub fn parse_wsl_list(bytes: &[u8]) -> Vec<String> {
    let text = decode_wsl_output(bytes);
    let mut out: Vec<String> = Vec::new();
    for line in text.lines() {
        let name = line.trim_matches(|c: char| c.is_whitespace() || c == '\u{feff}' || c == '\0');
        if name.is_empty() || name.starts_with("docker-desktop") || !is_valid_shell(&format!("wsl:{name}")) {
            continue;
        }
        if !out.iter().any(|n| n == name) {
            out.push(name.to_string());
        }
    }
    out
}

fn wsl_distros(wsl: &Path) -> Vec<String> {
    let mut cmd = std::process::Command::new(wsl);
    cmd.args(["-l", "-q"]);
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        cmd.creation_flags(0x0800_0000); // CREATE_NO_WINDOW
    }
    match cmd.output() {
        Ok(o) if o.status.success() => parse_wsl_list(&o.stdout),
        // Sem WSL instalado o wsl.exe sai com erro ou imprime a ajuda: sem distros, sem erro.
        _ => Vec::new(),
    }
}

/// Shells disponíveis nesta máquina, na ordem em que aparecem no menu.
pub fn detect() -> Vec<ShellInfo> {
    let mut list = Vec::new();
    if !cfg!(windows) {
        return list;
    }
    if find_pwsh().is_some() {
        list.push(ShellInfo { id: "pwsh".into(), label: "PowerShell 7".into(), family: "pwsh" });
    }
    if find_powershell().is_some() {
        list.push(ShellInfo { id: "powershell".into(), label: "Windows PowerShell".into(), family: "powershell" });
    }
    if find_cmd().is_some() {
        list.push(ShellInfo { id: "cmd".into(), label: "Prompt de Comando".into(), family: "cmd" });
    }
    if find_git_bash().is_some() {
        list.push(ShellInfo { id: "bash".into(), label: "Git Bash".into(), family: "bash" });
    }
    if let Some(wsl) = find_wsl() {
        for d in wsl_distros(&wsl) {
            list.push(ShellInfo { id: format!("wsl:{d}"), label: format!("{d} (WSL)"), family: "wsl" });
        }
    }
    list
}

/// Como abrir uma aba: executável, argumentos, pasta do processo e o perfil concreto usado.
pub struct Plan {
    pub program: PathBuf,
    pub args: Vec<String>,
    pub cwd: PathBuf,
    /// Perfil concreto (`pwsh`, `powershell`, `cmd`, `bash`, `wsl`, `wsl:<distro>`): é o que a aba guarda para a restauração.
    pub shell_id: String,
    pub warnings: Vec<String>,
}

/// `C:\Users\x` vira `/mnt/c/Users/x`. `None` para caminhos que não são de unidade (UNC etc.).
pub fn to_wsl_path(p: &str) -> Option<String> {
    let b = p.as_bytes();
    if b.len() >= 2 && b[0].is_ascii_alphabetic() && b[1] == b':' && (b.len() == 2 || b[2] == b'\\' || b[2] == b'/') {
        let rest = p[2..].replace('\\', "/");
        Some(format!("/mnt/{}{}", (b[0] as char).to_ascii_lowercase(), rest.trim_end_matches('/')))
    } else {
        None
    }
}

/// Começo do `--rcfile` do bash do WSL: carrega o `~/.bashrc` do usuário (que não é alterado). A pasta vira
/// caminho do Windows: `/mnt/c/x` → `C:\x`, o resto `\\wsl.localhost\<distro>\...`. Sem `633;P;Node=`: o node do
/// Windows não é o do WSL, então a linha de contexto não mostra versão.
const WSL_BASH_HEAD: &str = r##"# Integração do Termo (gerada pelo app; não edite).
[ -f ~/.bashrc ] && . ~/.bashrc
__termo_cwd() {
  local d p
  case "$PWD" in
    /mnt/[a-z]) d="${PWD:5:1}"; printf '%s:\\' "${d^^}" ;;
    /mnt/[a-z]/*) d="${PWD:5:1}"; p="${PWD:7}"; printf '%s:\\%s' "${d^^}" "${p//\//\\}" ;;
    *) p="${PWD//\//\\}"; printf '\\\\wsl.localhost\\%s%s' "${WSL_DISTRO_NAME:-wsl}" "$p" ;;
  esac
}
"##;

/// Começo do `--rcfile` do Git Bash. O bash abre sem `--login` (um shell de login ignora o `--rcfile`), então
/// faz o que o login faria: `/etc/profile` (PATH, prompt com a branch, `/etc/bash.bashrc`) e o primeiro de
/// `~/.bash_profile`, `~/.bash_login` ou `~/.profile`; sem nenhum deles, o `~/.bashrc`. Nada é escrito.
/// A pasta sai do `pwd -W` (`D:/x` → `D:\x`).
const GIT_BASH_HEAD: &str = r##"# Integração do Termo (gerada pelo app; não edite).
[ -f /etc/profile ] && . /etc/profile
if [ -f ~/.bash_profile ]; then . ~/.bash_profile
elif [ -f ~/.bash_login ]; then . ~/.bash_login
elif [ -f ~/.profile ]; then . ~/.profile
elif [ -f ~/.bashrc ]; then . ~/.bashrc
fi
__termo_cwd() {
  local p
  p="$(pwd -W 2>/dev/null)" || p="$PWD"
  printf '%s' "${p//\//\\}"
}
"##;

/// Marcas OSC 133/633 comuns aos dois bashes, depois da configuração do usuário:
/// - `133;A`/`133;B` em volta do PS1 (início do prompt e da linha digitada);
/// - `133;D;<código>` e `633;P;Cwd=` no PROMPT_COMMAND;
/// - `633;E;<comando>` + `133;C` num `trap DEBUG`, uma vez por linha, com o comando escapado como no PowerShell.
const BASH_MARKS: &str = r##"__termo_esc() {
  local c="$1"
  c="${c//\\/\\\\}"; c="${c//;/\\x3b}"; c="${c//$'\n'/\\x0a}"; c="${c//$'\r'/\\x0d}"
  c="${c//$'\a'/\\x07}"; c="${c//$'\e'/\\x1b}"
  printf '%s' "$c"
}
__termo_prompt() {
  local code=$?
  __termo_busy=1
  printf '\e]133;D;%s\a\e]633;P;Cwd=%s\a' "$code" "$(__termo_cwd)"
  return $code
}
__termo_debug() {
  [ -n "$__termo_busy" ] && return
  [ -n "$COMP_LINE" ] && return
  [ -n "$__termo_ran" ] && return
  __termo_ran=1
  local c
  c="$(HISTTIMEFORMAT= history 1)"
  [[ $c =~ ^[[:space:]]*[0-9]+[[:space:]]+(.*)$ ]] && c="${BASH_REMATCH[1]}"
  printf '\e]633;E;%s\a\e]133;C\a' "$(__termo_esc "$c")"
}
__termo_end() { local code=$?; __termo_busy=; __termo_ran=; return $code; }
PROMPT_COMMAND="__termo_prompt${PROMPT_COMMAND:+;$PROMPT_COMMAND};__termo_end"
PS1="\[\e]133;A\a\]${PS1}\[\e]133;B\a\]"
__termo_ran=1
trap '__termo_debug' DEBUG
"##;

/// `--rcfile` completo: o do WSL ou o do Git Bash.
pub fn bash_integration(git_bash: bool) -> String {
    let head = if git_bash { GIT_BASH_HEAD } else { WSL_BASH_HEAD };
    format!("{head}{BASH_MARKS}")
}

/// Prompt do cmd com as marcas do Termo. O cmd não tem como expor o código de saída nem o texto do comando
/// no prompt, então só há pasta (`633;P;Cwd=`) e início/fim do prompt (`133;A`/`133;B`); sem blocos por comando.
pub const CMD_PROMPT: &str = r"$e]133;D$e\$e]633;P;Cwd=$P$e\$e]133;A$e\$P$G$e]133;B$e\";

/// Grava o `--rcfile` do bash numa pasta temporária (só reescreve quando o conteúdo mudou).
fn write_rcfile(git_bash: bool) -> Option<PathBuf> {
    let dir = std::env::temp_dir().join("termo");
    std::fs::create_dir_all(&dir).ok()?;
    let path = dir.join(if git_bash { "git-bash-integration.bashrc" } else { "wsl-integration.bashrc" });
    let content = bash_integration(git_bash);
    if std::fs::read_to_string(&path).ok().as_deref() != Some(content.as_str()) {
        std::fs::write(&path, content).ok()?;
    }
    Some(path)
}

/// Argumentos do `wsl.exe` para abrir o bash numa distro (ou na padrão) na pasta do Windows `cwd`. Cada pedaço
/// é um argumento separado: o nome da distro nunca passa por uma string de shell.
pub fn wsl_args(distro: Option<&str>, cwd: &str, rc_wsl_path: Option<&str>) -> Vec<String> {
    let mut args = vec!["--cd".to_string(), cwd.to_string()];
    if let Some(d) = distro {
        args.push("-d".into());
        args.push(d.into());
    }
    args.push("--".into());
    args.push("bash".into());
    if let Some(rc) = rc_wsl_path {
        args.push("--rcfile".into());
        args.push(rc.into());
    }
    args.push("-i".into());
    args
}

/// Argumentos do Git Bash: interativo, com o `--rcfile` da integração quando ele existe. Sem `--login`, que
/// faria o bash ignorar o `--rcfile` (o rcfile carrega o `/etc/profile` no lugar dele).
pub fn git_bash_args(rc: Option<&str>) -> Vec<String> {
    let mut args = Vec::new();
    if let Some(rc) = rc {
        args.push("--rcfile".into());
        args.push(rc.into());
    }
    args.push("-i".into());
    args
}

/// Resolve o perfil pedido e monta a abertura. Perfil indisponível (pwsh sem instalar, WSL ausente...) cai no
/// `auto` com um aviso. `claude` presente: a aba do Claude Code sempre roda no PowerShell.
pub fn plan(requested: &str, cwd: PathBuf, claude: Option<&Path>, hooks: Option<&Path>, predictions: bool) -> Plan {
    let mut warnings = Vec::new();
    let mut wanted = if is_valid_shell(requested) { requested.to_string() } else { "auto".to_string() };
    if claude.is_some() {
        wanted = "auto".into();
    }

    let fallback = |warnings: &mut Vec<String>, why: String| {
        warnings.push(format!("{why}; abrindo o shell padrão."));
        let program = shell::detect_shell();
        let id = if shell::shell_name(&program).eq_ignore_ascii_case("pwsh") { "pwsh" } else { "powershell" };
        (program, id.to_string())
    };

    let (program, id) = match wanted.as_str() {
        "auto" => {
            let p = shell::detect_shell();
            let id = if shell::shell_name(&p).eq_ignore_ascii_case("pwsh") { "pwsh" } else { "powershell" };
            (p, id.to_string())
        }
        "pwsh" => match find_pwsh() {
            Some(p) => (p, "pwsh".into()),
            None => fallback(&mut warnings, "PowerShell 7 não encontrado".into()),
        },
        "powershell" => match find_powershell() {
            Some(p) => (p, "powershell".into()),
            None => fallback(&mut warnings, "Windows PowerShell não encontrado".into()),
        },
        "cmd" => match find_cmd() {
            Some(p) => (p, "cmd".into()),
            None => fallback(&mut warnings, "cmd.exe não encontrado".into()),
        },
        "bash" => match find_git_bash() {
            Some(p) => (p, "bash".into()),
            None => fallback(&mut warnings, "Git Bash não encontrado (instale o Git for Windows)".into()),
        },
        w => match find_wsl() {
            Some(p) => (p, w.to_string()),
            None => fallback(&mut warnings, "WSL não está instalado".into()),
        },
    };

    let family = family_of(&id).unwrap_or("powershell");
    match family {
        "cmd" => Plan {
            program,
            args: vec!["/k".into(), "prompt".into(), CMD_PROMPT.into()],
            cwd,
            shell_id: id,
            warnings,
        },
        "bash" => {
            // O bash do MSYS aceita o caminho do Windows com `/`.
            let rc = write_rcfile(true).map(|p| p.to_string_lossy().replace('\\', "/"));
            if rc.is_none() {
                warnings.push("Não foi possível preparar a integração do bash; os blocos ficam desligados.".into());
            }
            Plan { program, args: git_bash_args(rc.as_deref()), cwd, shell_id: id, warnings }
        }
        "wsl" => {
            // Revalida o nome da distro aqui, no ponto de uso (veja `is_valid_shell`).
            let distro = id.strip_prefix("wsl:").filter(|d| is_valid_shell(&format!("wsl:{d}")));
            let cwd_str = cwd.to_string_lossy().into_owned();
            let rc = write_rcfile(false).and_then(|p| to_wsl_path(&p.to_string_lossy()));
            if rc.is_none() {
                warnings.push("Não foi possível preparar a integração do bash; os blocos ficam desligados.".into());
            }
            // O processo do wsl.exe não abre com uma pasta UNC; a pasta do bash vem do `--cd`.
            let proc_cwd = if cwd_str.starts_with(r"\\") { dirs::home_dir().unwrap_or_else(|| ".".into()) } else { cwd.clone() };
            Plan {
                program,
                args: wsl_args(distro, &cwd_str, rc.as_deref()),
                cwd: proc_cwd,
                shell_id: id,
                warnings,
            }
        }
        _ => {
            let args = shell::shell_args(&program, claude, hooks, predictions);
            Plan { program, args, cwd, shell_id: id, warnings }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn utf16le(s: &str, bom: bool) -> Vec<u8> {
        let mut v: Vec<u8> = if bom { vec![0xFF, 0xFE] } else { Vec::new() };
        for u in s.encode_utf16() {
            v.extend_from_slice(&u.to_le_bytes());
        }
        v
    }

    #[test]
    fn parses_utf16_wsl_list() {
        let out = utf16le("Ubuntu-22.04\r\ndocker-desktop\r\ndocker-desktop-data\r\nDebian\r\n\r\n", false);
        assert_eq!(parse_wsl_list(&out), vec!["Ubuntu-22.04", "Debian"]);
        let with_bom = utf16le("Ubuntu\r\n", true);
        assert_eq!(parse_wsl_list(&with_bom), vec!["Ubuntu"]);
    }

    #[test]
    fn wsl_list_ignores_junk_and_help_text() {
        assert!(parse_wsl_list(&[]).is_empty());
        // Sem WSL, o wsl.exe imprime a ajuda (nomes com espaço ou símbolos não são distros).
        assert!(parse_wsl_list(b"Instalar o WSL: https://aka.ms/wsl\r\n").is_empty());
        // UTF-8 puro também funciona (WSL_UTF8=1).
        assert_eq!(parse_wsl_list(b"Ubuntu\nDebian\n"), vec!["Ubuntu", "Debian"]);
        // Nome com `;` ou espaço é descartado.
        assert!(parse_wsl_list(&utf16le("a; rm\r\n", false)).is_empty());
    }

    #[test]
    fn converts_windows_path_to_wsl() {
        assert_eq!(to_wsl_path(r"C:\Users\Ana\x").as_deref(), Some("/mnt/c/Users/Ana/x"));
        assert_eq!(to_wsl_path(r"d:\").as_deref(), Some("/mnt/d"));
        assert_eq!(to_wsl_path(r"\\wsl.localhost\Ubuntu\home"), None);
    }

    #[test]
    fn wsl_args_keep_distro_separate() {
        let a = wsl_args(Some("Ubuntu-22.04"), r"C:\p", Some("/mnt/c/t/rc"));
        assert_eq!(a, vec!["--cd", r"C:\p", "-d", "Ubuntu-22.04", "--", "bash", "--rcfile", "/mnt/c/t/rc", "-i"]);
        let b = wsl_args(None, r"C:\p", None);
        assert_eq!(b, vec!["--cd", r"C:\p", "--", "bash", "-i"]);
    }

    #[test]
    fn bash_integration_has_all_marks() {
        for git_bash in [false, true] {
            let rc = bash_integration(git_bash);
            for m in ["]133;A", "]133;B", "]133;C", "]133;D;", "]633;E;", "]633;P;Cwd=", "trap '__termo_debug' DEBUG"] {
                assert!(rc.contains(m), "falta {m}");
            }
            // A configuração do usuário é carregada antes das marcas e nunca escrita.
            assert!(rc.contains(". ~/.bashrc"));
            assert!(rc.find(". ~/.bashrc") < rc.find("__termo_prompt()"));
            assert!(!rc.contains(">> ~"));
        }
        let git = bash_integration(true);
        assert!(git.contains(". /etc/profile") && git.contains("pwd -W"));
        assert!(!bash_integration(false).contains("/etc/profile"));
    }

    #[test]
    fn git_bash_args_skip_login() {
        assert_eq!(git_bash_args(Some("C:/t/rc")), vec!["--rcfile", "C:/t/rc", "-i"]);
        assert_eq!(git_bash_args(None), vec!["-i"]);
    }

    #[test]
    fn cmd_prompt_has_cwd_and_prompt_marks() {
        assert!(CMD_PROMPT.contains("633;P;Cwd=$P"));
        assert!(CMD_PROMPT.contains("133;A") && CMD_PROMPT.contains("133;B"));
        assert!(!CMD_PROMPT.contains(' '));
    }

    #[test]
    fn invalid_profile_falls_back_to_auto() {
        let p = plan("wsl:a; rm", PathBuf::from("."), None, None, false);
        assert!(matches!(p.shell_id.as_str(), "pwsh" | "powershell"));
    }

    #[test]
    fn claude_always_runs_in_powershell() {
        let p = plan("cmd", PathBuf::from("."), Some(Path::new(r"C:\c\claude.exe")), None, false);
        assert!(matches!(p.shell_id.as_str(), "pwsh" | "powershell"));
    }

    #[test]
    fn families() {
        assert_eq!(family_of("wsl"), Some("wsl"));
        assert_eq!(family_of("wsl:Ubuntu"), Some("wsl"));
        assert_eq!(family_of("bash"), Some("bash"));
        assert_eq!(family_of("auto"), None);
    }
}
