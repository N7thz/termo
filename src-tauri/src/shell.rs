//! Escolha do shell, do executável do Claude Code, da pasta inicial e da linha de comando.

use std::path::{Path, PathBuf};
use std::sync::OnceLock;

/// PowerShell 7 se estiver instalado; senão o Windows PowerShell 5.1.
pub fn detect_shell() -> PathBuf {
    static SHELL: OnceLock<PathBuf> = OnceLock::new();
    SHELL
        .get_or_init(|| {
            if cfg!(windows) {
                which::which("pwsh")
                    .ok()
                    // Recém-instalado pelo winget: o PATH deste processo ainda não tem a pasta.
                    .or_else(|| {
                        std::env::var_os("ProgramFiles")
                            .map(|p| PathBuf::from(p).join(r"PowerShell\7\pwsh.exe"))
                            .filter(|p| p.is_file())
                    })
                    .or_else(|| which::which("powershell").ok())
                    .unwrap_or_else(|| "powershell.exe".into())
            } else {
                std::env::var_os("SHELL").map(PathBuf::from).unwrap_or_else(|| "/bin/bash".into())
            }
        })
        .clone()
}

pub fn shell_name(shell: &Path) -> String {
    shell.file_stem().map(|s| s.to_string_lossy().into_owned()).unwrap_or_else(|| "shell".into())
}

pub fn is_powershell(shell: &Path) -> bool {
    let n = shell_name(shell).to_lowercase();
    n == "pwsh" || n == "powershell"
}

/// Acha o Claude Code no PATH. O `which` segue o PATHEXT (.exe/.cmd antes de qualquer .ps1),
/// o que evita o `claude.ps1` que a ExecutionPolicy pode bloquear.
pub fn find_claude() -> Result<PathBuf, String> {
    which::which("claude").map_err(|_| {
        "Claude Code não encontrado no PATH. Instale com `npm i -g @anthropic-ai/claude-code` \
         ou pelo instalador oficial e abra a aba de novo."
            .to_string()
    })
}

/// Pasta válida ou a pasta do usuário, com o aviso do motivo quando cai no padrão.
pub fn resolve_cwd(requested: Option<&str>) -> (PathBuf, Option<String>) {
    let home = dirs::home_dir().unwrap_or_else(|| PathBuf::from("."));
    match requested.map(str::trim).filter(|s| !s.is_empty()) {
        None => (home, None),
        Some(p) if Path::new(p).is_dir() => (PathBuf::from(p), None),
        Some(p) => (home, Some(format!("A pasta \"{p}\" não existe; abrindo na pasta do usuário."))),
    }
}

/// Liga as previsões do PSReadLine (sugestões do histórico numa lista abaixo do cursor).
/// `HistoryAndPlugin` exige PowerShell 7.2+; no 5.1 com PSReadLine 2.2+ cai para `History`;
/// com PSReadLine antigo (2.0, o padrão do 5.1) não faz nada.
pub const PSREADLINE_PREDICTIONS: &str = "try { Set-PSReadLineOption -PredictionSource HistoryAndPlugin \
-PredictionViewStyle ListView -ErrorAction Stop } catch { try { Set-PSReadLineOption -PredictionSource History \
-PredictionViewStyle ListView -ErrorAction Stop } catch {} }";

/// Integração com o terminal: envolve o `prompt` (inclusive o de oh-my-posh/starship, que já
/// foi definido pelo $PROFILE) e emite, a cada prompt:
/// - `OSC 633;P;Cwd=<pasta>`: a pasta atual (formato do VS Code);
/// - `OSC 133;A` antes e `OSC 133;B` depois do texto do prompt: onde começa a linha digitada.
///
/// Usa `[char]27` em vez de `` `e `` para funcionar também no Windows PowerShell 5.1.
pub const PWSH_INTEGRATION: &str = "if (-not $global:__termoPrompt) { $global:__termoPrompt = $function:prompt; \
function global:prompt { $e = [char]27; $b = [char]7; \
$cwd = $executionContext.SessionState.Path.CurrentLocation.ProviderPath; \
$p = & $global:__termoPrompt; \"$e]633;P;Cwd=$cwd$b$e]133;A$b$p$e]133;B$b\" } }";

/// Argumentos do shell. Na aba do Claude, roda o claude e mantém o shell aberto ao sair.
/// O `-Command` roda depois do $PROFILE, então a integração e as previsões valem mesmo com perfil próprio.
pub fn shell_args(shell: &Path, claude: Option<&Path>, predictions: bool) -> Vec<String> {
    if is_powershell(shell) {
        let mut script = vec![PWSH_INTEGRATION.to_string()];
        if predictions {
            script.push(PSREADLINE_PREDICTIONS.to_string());
        }
        if let Some(c) = claude {
            script.push(format!("& '{}'", c.to_string_lossy().replace('\'', "''")));
        }
        vec!["-NoLogo".into(), "-NoExit".into(), "-Command".into(), script.join("; ")]
    } else if let Some(c) = claude {
        vec!["-lc".into(), format!("'{}'; exec \"$SHELL\"", c.to_string_lossy().replace('\'', "'\\''"))]
    } else {
        Vec::new()
    }
}

/// Variáveis do processo do app que não devem vazar para o shell.
pub fn is_internal_env(key: &str) -> bool {
    let k = key.to_ascii_uppercase();
    k.starts_with("TAURI_") || k.starts_with("WEBVIEW2_") || k.starts_with("ELECTRON_") || k == "CARGO" || k.starts_with("CARGO_")
}

#[derive(Debug, Default, PartialEq)]
pub struct CliArgs {
    pub claude: bool,
    pub cwd: Option<String>,
}

/// Lê `--claude` e `--cwd <pasta>` (ou uma pasta solta, como no "Abrir aqui").
pub fn parse_cli<I: IntoIterator<Item = String>>(args: I) -> CliArgs {
    let args: Vec<String> = args.into_iter().skip(1).collect();
    let mut out = CliArgs { claude: args.iter().any(|a| a == "--claude"), cwd: None };
    if let Some(i) = args.iter().position(|a| a == "--cwd") {
        out.cwd = args.get(i + 1).cloned();
    } else {
        out.cwd = args.iter().find(|a| !a.starts_with('-') && Path::new(a).is_dir()).cloned();
    }
    out
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn claude_args_quote_path() {
        let args = shell_args(Path::new("pwsh.exe"), Some(Path::new(r"C:\Program Files\it's\claude.exe")), false);
        assert_eq!(
            args,
            vec![
                "-NoLogo".to_string(),
                "-NoExit".into(),
                "-Command".into(),
                format!(r"{PWSH_INTEGRATION}; & 'C:\Program Files\it''s\claude.exe'")
            ]
        );
    }

    #[test]
    fn plain_shell_gets_integration_only() {
        assert_eq!(shell_args(Path::new("powershell.exe"), None, false), vec!["-NoLogo", "-NoExit", "-Command", PWSH_INTEGRATION]);
    }

    #[test]
    fn order_is_integration_predictions_claude() {
        let args = shell_args(Path::new("pwsh.exe"), Some(Path::new(r"C:\c\claude.exe")), true);
        assert_eq!(args[3], format!("{PWSH_INTEGRATION}; {PSREADLINE_PREDICTIONS}; & 'C:\\c\\claude.exe'"));
    }

    #[test]
    fn integration_emits_cwd_and_prompt_marks() {
        assert!(PWSH_INTEGRATION.contains("]633;P;Cwd="));
        assert!(PWSH_INTEGRATION.contains("]133;A"));
        assert!(PWSH_INTEGRATION.contains("]133;B"));
    }

    #[test]
    fn invalid_cwd_falls_back_with_warning() {
        let (dir, warn) = resolve_cwd(Some(r"Z:\nao\existe\mesmo"));
        assert_eq!(Some(dir), dirs::home_dir());
        assert!(warn.is_some());
    }

    #[test]
    fn parses_cli() {
        let a = parse_cli(["termo".into(), "--claude".into(), "--cwd".into(), "D:\\x".into()]);
        assert_eq!(a, CliArgs { claude: true, cwd: Some("D:\\x".into()) });
    }

    #[test]
    fn filters_internal_env() {
        assert!(is_internal_env("TAURI_ENV_DEBUG"));
        assert!(!is_internal_env("PATH"));
    }
}
