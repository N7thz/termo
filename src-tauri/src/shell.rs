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

/// Liga as previsões do PSReadLine como sugestão em cinza na própria linha (InlineView; → aceita). A lista
/// (ListView) somava 10 linhas ao popup de pastas do Termo e enchia a tela.
/// `HistoryAndPlugin` exige PowerShell 7.2+; no 5.1 com PSReadLine 2.2+ cai para `History`;
/// com PSReadLine antigo (2.0, o padrão do 5.1) não faz nada.
pub const PSREADLINE_PREDICTIONS: &str = "try { Set-PSReadLineOption -PredictionSource HistoryAndPlugin \
-PredictionViewStyle InlineView -ErrorAction Stop } catch { try { Set-PSReadLineOption -PredictionSource History \
-PredictionViewStyle InlineView -ErrorAction Stop } catch {} }";

/// Cores da linha digitada no PSReadLine pelas cores ANSI (e não RGB fixo): como a paleta ANSI vem do
/// tema do Termo, o comando, as flags e as strings acompanham o tema escolhido. As chaves de previsão
/// só existem no PSReadLine 2.1+, então vão num `try` separado.
pub const PSREADLINE_COLORS: &str = r#"try { $e = [char]27; Set-PSReadLineOption -ErrorAction Stop -Colors @{ Command = "$e[92m"; Parameter = "$e[36m"; String = "$e[33m"; Variable = "$e[35m"; Number = "$e[95m"; Operator = "$e[90m"; Comment = "$e[3;90m"; Keyword = "$e[34m"; Type = "$e[96m"; Member = "$e[37m"; Default = "$e[39m"; Error = "$e[91m" }; try { Set-PSReadLineOption -ErrorAction Stop -Colors @{ InlinePrediction = "$e[90m"; ListPrediction = "$e[90m"; ListPredictionSelected = "$e[7m" } } catch {} } catch {}"#;

/// Integração com o terminal: envolve o `prompt` (inclusive o de oh-my-posh/starship, que já
/// foi definido pelo $PROFILE) e emite, a cada prompt:
/// - `OSC 633;P;Cwd=<pasta>`: a pasta atual (formato do VS Code);
/// - `OSC 133;D;<código>`: o comando anterior terminou. O início (`133;C`) vem de [`PWSH_COMMAND_MARKS`];
/// - `OSC 633;P;Node=<caminho>`: o `node` que o PATH do shell resolve (vazio sem node). Só é procurado de
///   novo quando o PATH muda; a versão o backend tira do caminho real (src-tauri/src/node.rs);
/// - `OSC 133;A` antes e `OSC 133;B` depois do texto do prompt: onde começa a linha digitada.
///
/// Usa `[char]27` em vez de `` `e `` para funcionar também no Windows PowerShell 5.1.
pub const PWSH_INTEGRATION: &str = "if (-not $global:__termoPrompt) { $global:__termoPrompt = $function:prompt; \
function global:prompt { $ok = $?; $code = if ($ok) { 0 } elseif ($LASTEXITCODE) { $LASTEXITCODE } else { 1 }; $e = [char]27; $b = [char]7; \
$cwd = $executionContext.SessionState.Path.CurrentLocation.ProviderPath; \
if ($env:PATH -cne $global:__termoPath) { $global:__termoPath = $env:PATH; \
$global:__termoNode = (Get-Command node -CommandType Application -ErrorAction Ignore | Select-Object -First 1).Source }; \
$p = & $global:__termoPrompt; \"$e]133;D;$code$b$e]633;P;Cwd=$cwd$b$e]633;P;Node=$global:__termoNode$b$e]133;A$b$p$e]133;B$b\" } }";

/// Início de cada comando para os blocos da interface: envolve o `PSConsoleHostReadLine` do PSReadLine (como faz o
/// VS Code) e, quando a linha é aceita, emite `OSC 633;E;<comando>` e `OSC 133;C`. O comando vai escapado
/// (`\` → `\\`, `;` → `\x3b`, quebras e caracteres de controle em `\xHH`). Sem PSReadLine não faz nada: os
/// blocos não aparecem, e o resto da integração segue igual.
pub const PWSH_COMMAND_MARKS: &str = r#"try { if ((Get-Command PSConsoleHostReadLine -ErrorAction Ignore) -and -not $global:__termoReadLine) { $global:__termoReadLine = $function:PSConsoleHostReadLine; function global:PSConsoleHostReadLine { $l = & $global:__termoReadLine; $c = "$l" -replace '\\','\\' -replace ';','\x3b' -replace '\n','\x0a' -replace '\r','\x0d' -replace '\x07','\x07' -replace '\x1b','\x1b'; [Console]::Write("$([char]27)]633;E;$c$([char]7)$([char]27)]133;C$([char]7)"); $l } } } catch {}"#;

/// Ativa o fnm na aba quando ele está instalado e o $PROFILE não fez isso: sem o `fnm env`, o `fnm use`
/// da barra de contexto não funciona. Procura também na pasta de atalhos do winget, que pode faltar no
/// PATH herdado quando o fnm foi instalado com o Termo aberto. Vem antes da integração para que o
/// prompt dela envolva o do fnm.
pub const FNM_ENV: &str = r#"try { if (-not $env:FNM_MULTISHELL_PATH) { $f = Get-Command fnm -CommandType Application -ErrorAction Ignore | Select-Object -First 1; if (-not $f -and $env:LOCALAPPDATA) { $l = Join-Path $env:LOCALAPPDATA 'Microsoft\WinGet\Links'; if (Test-Path (Join-Path $l 'fnm.exe')) { $env:PATH = "$l;$env:PATH"; $f = $true } }; if ($f) { fnm env --use-on-cd --shell powershell | Out-String | Invoke-Expression } } } catch {}"#;

/// Argumentos do shell. Na aba do Claude, roda o claude e mantém o shell aberto ao sair.
/// O `-Command` roda depois do $PROFILE, então a integração e as previsões valem mesmo com perfil próprio.
/// `hooks` é o arquivo passado ao `claude --settings` com os hooks de estado da aba.
pub fn shell_args(shell: &Path, claude: Option<&Path>, hooks: Option<&Path>, predictions: bool) -> Vec<String> {
    if is_powershell(shell) {
        let mut script = vec![
            FNM_ENV.to_string(),
            PWSH_INTEGRATION.to_string(),
            PWSH_COMMAND_MARKS.to_string(),
            PSREADLINE_COLORS.to_string(),
        ];
        if predictions {
            script.push(PSREADLINE_PREDICTIONS.to_string());
        }
        if let Some(c) = claude {
            let quote = |p: &Path| format!("'{}'", p.to_string_lossy().replace('\'', "''"));
            let settings = hooks.map(|h| format!(" --settings {}", quote(h))).unwrap_or_default();
            script.push(format!("& {}{settings}", quote(c)));
        }
        vec!["-NoLogo".into(), "-NoExit".into(), "-Command".into(), script.join("; ")]
    } else if let Some(c) = claude {
        let quote = |p: &Path| format!("'{}'", p.to_string_lossy().replace('\'', "'\\''"));
        let settings = hooks.map(|h| format!(" --settings {}", quote(h))).unwrap_or_default();
        vec!["-lc".into(), format!("{}{settings}; exec \"$SHELL\"", quote(c))]
    } else {
        Vec::new()
    }
}

/// Variáveis do processo do app que não devem vazar para o shell.
pub fn is_internal_env(key: &str) -> bool {
    let k = key.to_ascii_uppercase();
    // O multishell do fnm é de um shell só: herdado, o `fnm use` da aba trocaria o node de quem abriu o Termo.
    k == "FNM_MULTISHELL_PATH" || k.starts_with("TAURI_") || k.starts_with("WEBVIEW2_") || k.starts_with("ELECTRON_") || k == "CARGO" || k.starts_with("CARGO_")
}

#[derive(Debug, Default, PartialEq)]
pub struct CliArgs {
    pub claude: bool,
    pub cwd: Option<String>,
    /// Aba do Claude com título, pedido ou argumentos próprios (`termo.exe --claude --title ... -- ...`).
    pub launch: Option<crate::cli::ClaudeLaunch>,
}

/// Lê `--claude` e `--cwd <pasta>` (ou uma pasta solta, como no "Abrir aqui").
pub fn parse_cli<I: IntoIterator<Item = String>>(args: I) -> CliArgs {
    let argv: Vec<String> = args.into_iter().collect();
    CliArgs { claude: crate::cli::wants_claude(&argv), cwd: crate::cli::cwd_of(&argv), launch: crate::cli::parse_launch(&argv) }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn claude_gets_hooks_settings() {
        let args = shell_args(Path::new("pwsh.exe"), Some(Path::new(r"C:\c\claude.exe")), Some(Path::new(r"C:	\hooks.json")), false);
        assert!(args[3].ends_with(r"& 'C:\c\claude.exe' --settings 'C:	\hooks.json'"), "{}", args[3]);
        let bash = shell_args(Path::new("/bin/bash"), Some(Path::new("/usr/bin/claude")), Some(Path::new("/tmp/h.json")), false);
        assert_eq!(bash[1], "'/usr/bin/claude' --settings '/tmp/h.json'; exec \"$SHELL\"");
    }

    #[test]
    fn claude_args_quote_path() {
        let args = shell_args(Path::new("pwsh.exe"), Some(Path::new(r"C:\Program Files\it's\claude.exe")), None, false);
        assert_eq!(
            args,
            vec![
                "-NoLogo".to_string(),
                "-NoExit".into(),
                "-Command".into(),
                format!(r"{FNM_ENV}; {PWSH_INTEGRATION}; {PWSH_COMMAND_MARKS}; {PSREADLINE_COLORS}; & 'C:\Program Files\it''s\claude.exe'")
            ]
        );
    }

    #[test]
    fn plain_shell_gets_integration_and_colors() {
        let script = format!("{FNM_ENV}; {PWSH_INTEGRATION}; {PWSH_COMMAND_MARKS}; {PSREADLINE_COLORS}");
        assert_eq!(shell_args(Path::new("powershell.exe"), None, None, false), vec!["-NoLogo", "-NoExit", "-Command", &script]);
    }

    #[test]
    fn colors_use_ansi_codes_not_rgb() {
        // ANSI (e não `38;2;r;g;b`) para seguir a paleta do tema.
        assert!(!PSREADLINE_COLORS.contains("38;2;"));
        assert!(PSREADLINE_COLORS.contains(r#"Command = "$e[92m""#));
    }

    #[test]
    fn order_is_integration_predictions_claude() {
        let args = shell_args(Path::new("pwsh.exe"), Some(Path::new(r"C:\c\claude.exe")), None, true);
        assert_eq!(args[3], format!("{FNM_ENV}; {PWSH_INTEGRATION}; {PWSH_COMMAND_MARKS}; {PSREADLINE_COLORS}; {PSREADLINE_PREDICTIONS}; & 'C:\\c\\claude.exe'"));
    }

    #[test]
    fn integration_emits_cwd_and_prompt_marks() {
        assert!(PWSH_INTEGRATION.contains("]633;P;Cwd="));
        assert!(PWSH_INTEGRATION.contains("]133;A"));
        assert!(PWSH_INTEGRATION.contains("]133;B"));
        assert!(PWSH_INTEGRATION.contains("]133;D;$code"));
        assert!(PWSH_COMMAND_MARKS.contains("]633;E;$c"));
        assert!(PWSH_COMMAND_MARKS.contains("]133;C"));
        assert!(PWSH_COMMAND_MARKS.starts_with("try {") && PWSH_COMMAND_MARKS.ends_with("catch {}"));
        assert!(PWSH_INTEGRATION.contains("]633;P;Node="));
        // O código de saída precisa ser lido antes de qualquer outro comando do prompt.
        assert!(PWSH_INTEGRATION.contains("{ $ok = $?;"));
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
        assert_eq!(a, CliArgs { claude: true, cwd: Some("D:\\x".into()), launch: None });
    }

    #[test]
    fn filters_internal_env() {
        assert!(is_internal_env("TAURI_ENV_DEBUG"));
        assert!(!is_internal_env("PATH"));
    }
}
