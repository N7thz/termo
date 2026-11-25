//! Abas do Claude pedidas pela linha de comando, inclusive por um segundo `termo.exe`.
//!
//! ```text
//! termo.exe --claude [--cwd <pasta>] [--title <nome>] [--prompt-file <arquivo>] [--close-on-exit] [-- <args do claude>]
//! ```
//!
//! Com o Termo já aberto, a instância única (tauri-plugin-single-instance) repassa o argv para ele, e a
//! aba abre ali, sem janela nova. É assim que o coord (`nova-sessao.ps1`) abre as sessões paralelas.
//! - `--prompt-file`: o primeiro pedido do Claude, lido do arquivo dentro do shell (aspas e quebras de
//!   linha não passam pela linha de comando);
//! - `--close-on-exit`: a aba fecha quando o claude termina (ou quando a sessão mata o próprio shell
//!   com `fechar-sessao.ps1`, que acha o processo pela variável `CLAUDE_JANELA_PID`);
//! - depois de `--`: argumentos repassados ao claude (`--model sonnet`, `--resume <id>`...), cada um
//!   entre aspas literais, então nada vira comando do shell.

use std::path::Path;

use serde::Serialize;

#[derive(Debug, Default, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ClaudeLaunch {
    pub cwd: Option<String>,
    pub title: Option<String>,
    pub prompt_file: Option<String>,
    pub close_on_exit: bool,
    pub args: Vec<String>,
}

/// A aba pedida no argv, ou `None` quando ele não pede uma aba específica (só `--claude`, ou nada).
pub fn parse_launch(argv: &[String]) -> Option<ClaudeLaunch> {
    let args: Vec<&str> = argv.iter().skip(1).map(String::as_str).collect();
    let (own, rest) = match args.iter().position(|a| *a == "--") {
        Some(i) => (&args[..i], args[i + 1..].iter().map(|s| s.to_string()).collect()),
        None => (&args[..], Vec::new()),
    };
    let value = |flag: &str| own.iter().position(|a| *a == flag).and_then(|i| own.get(i + 1)).map(|s| s.to_string());
    let launch = ClaudeLaunch {
        cwd: value("--cwd"),
        title: value("--title").filter(|t| !t.trim().is_empty()),
        prompt_file: value("--prompt-file"),
        close_on_exit: own.contains(&"--close-on-exit"),
        args: rest,
    };
    let specific = launch.title.is_some() || launch.prompt_file.is_some() || launch.close_on_exit || !launch.args.is_empty();
    (own.contains(&"--claude") && specific).then_some(launch)
}

/// Um segundo `termo.exe` pediu uma aba do Claude (`--claude`), com ou sem detalhes.
pub fn wants_claude(argv: &[String]) -> bool {
    argv.iter().skip(1).take_while(|a| *a != "--").any(|a| a == "--claude")
}

/// Pasta do argv repassado (`--cwd`, ou a primeira pasta existente), para `termo.exe --claude <pasta>`.
pub fn cwd_of(argv: &[String]) -> Option<String> {
    let own: Vec<&String> = argv.iter().skip(1).take_while(|a| *a != "--").collect();
    match own.iter().position(|a| *a == "--cwd") {
        Some(i) => own.get(i + 1).map(|s| s.to_string()),
        None => own.iter().find(|a| !a.starts_with('-') && Path::new(a.as_str()).is_dir()).map(|s| s.to_string()),
    }
}

/// Evento que a janela principal escuta para abrir a aba pedida por outro `termo.exe`.
pub const LAUNCH_EVENT: &str = "termo-launch";

/// Callback da instância única: traz a janela principal para a frente e, se o argv pede uma aba do
/// Claude, manda a janela abri-la. Pasta relativa vale a partir da pasta de quem chamou.
pub fn forward(app: &tauri::AppHandle, argv: Vec<String>, caller_cwd: String) {
    use tauri::Emitter;
    crate::tray::show_main(app);
    let launch = match parse_launch(&argv) {
        Some(l) => l,
        None if wants_claude(&argv) => ClaudeLaunch { cwd: cwd_of(&argv), ..Default::default() },
        None => return,
    };
    let cwd = launch.cwd.as_deref().map(|c| {
        let p = Path::new(c);
        if p.is_absolute() { c.to_string() } else { Path::new(&caller_cwd).join(p).to_string_lossy().into_owned() }
    });
    if let Err(e) = app.emit_to("main", LAUNCH_EVENT, ClaudeLaunch { cwd, ..launch }) {
        log::warn!("abrir aba pedida pela linha de comando: {e}");
    }
}

/// O que a aba recebe no `pty_create`: os argumentos extras do claude e se o shell sai junto com ele.
#[derive(Debug, Default, Clone, PartialEq, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TabLaunch {
    #[serde(default)]
    pub args: Vec<String>,
    pub prompt_file: Option<String>,
    #[serde(default)]
    pub close_on_exit: bool,
}

/// Junta os argumentos extras à linha que [`crate::shell::shell_args`] montou para a aba do Claude.
/// PowerShell: `[-NoLogo, -NoExit, -Command, script]`, com o `& 'claude' ...` no fim do script.
/// bash: `[-lc, "'claude' ...; exec \"$SHELL\""]`.
pub fn apply(shell_args: &mut Vec<String>, powershell: bool, launch: &TabLaunch) -> Result<(), String> {
    if let Some(f) = &launch.prompt_file {
        if !Path::new(f).is_file() {
            return Err(format!("Arquivo do pedido não encontrado: {f}"));
        }
    }
    if powershell {
        let quote = |s: &str| format!("'{}'", s.replace('\'', "''"));
        let Some(script) = shell_args.last_mut() else { return Err("linha do shell vazia".into()) };
        for a in &launch.args {
            script.push(' ');
            script.push_str(&quote(a));
        }
        if let Some(f) = &launch.prompt_file {
            script.push_str(&format!(" (Get-Content -Raw -Encoding utf8 -LiteralPath {})", quote(f)));
        }
        if launch.close_on_exit {
            // Sem -NoExit o shell sai junto com o claude. O PID dele é o que o fechar-sessao.ps1 mata.
            *script = format!("$env:CLAUDE_JANELA_PID = $PID; {script}");
            shell_args.retain(|a| a != "-NoExit");
        }
    } else {
        let quote = |s: &str| format!("'{}'", s.replace('\'', "'\\''"));
        let Some(line) = shell_args.last_mut() else { return Err("linha do shell vazia".into()) };
        let tail = "; exec \"$SHELL\"";
        let mut cmd = line.strip_suffix(tail).unwrap_or(line).to_string();
        for a in &launch.args {
            cmd.push(' ');
            cmd.push_str(&quote(a));
        }
        if let Some(f) = &launch.prompt_file {
            cmd.push_str(&format!(" \"$(cat {})\"", quote(f)));
        }
        *line = if launch.close_on_exit { format!("export CLAUDE_JANELA_PID=$$; {cmd}") } else { format!("{cmd}{tail}") };
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn argv(s: &[&str]) -> Vec<String> {
        std::iter::once("termo.exe").chain(s.iter().copied()).map(String::from).collect()
    }

    #[test]
    fn parses_full_launch() {
        let l = parse_launch(&argv(&[
            "--claude", "--cwd", r"D:\p", "--title", "rotas", "--prompt-file", r"C:\t\p.txt", "--close-on-exit", "--", "--model",
            "sonnet", "-n", "rotas",
        ]))
        .unwrap();
        assert_eq!(l.cwd.as_deref(), Some(r"D:\p"));
        assert_eq!(l.title.as_deref(), Some("rotas"));
        assert_eq!(l.prompt_file.as_deref(), Some(r"C:\t\p.txt"));
        assert!(l.close_on_exit);
        assert_eq!(l.args, vec!["--model", "sonnet", "-n", "rotas"]);
    }

    #[test]
    fn plain_claude_is_not_a_specific_launch() {
        assert_eq!(parse_launch(&argv(&["--claude"])), None);
        assert_eq!(parse_launch(&argv(&["--title", "x"])), None);
        assert!(wants_claude(&argv(&["--claude"])));
        // `--claude` depois do `--` é argumento do claude, não do Termo.
        assert!(!wants_claude(&argv(&["--", "--claude"])));
    }

    #[test]
    fn powershell_quotes_args_and_reads_prompt_file() {
        let dir = std::env::temp_dir().join("termo-cli-test.txt");
        std::fs::write(&dir, "oi").unwrap();
        let f = dir.to_string_lossy().into_owned();
        let mut a = vec!["-NoLogo".into(), "-NoExit".into(), "-Command".into(), "x; & 'claude'".to_string()];
        let launch = TabLaunch { args: vec!["--model".into(), "it's; rm".into()], prompt_file: Some(f.clone()), close_on_exit: true };
        apply(&mut a, true, &launch).unwrap();
        assert_eq!(a.len(), 3, "sem -NoExit");
        assert_eq!(
            a[2],
            format!("$env:CLAUDE_JANELA_PID = $PID; x; & 'claude' '--model' 'it''s; rm' (Get-Content -Raw -Encoding utf8 -LiteralPath '{f}')")
        );
    }

    #[test]
    fn bash_keeps_shell_unless_close_on_exit() {
        let base = || vec!["-lc".to_string(), "'claude'; exec \"$SHELL\"".to_string()];
        let mut a = base();
        apply(&mut a, false, &TabLaunch { args: vec!["-r".into()], ..Default::default() }).unwrap();
        assert_eq!(a[1], "'claude' '-r'; exec \"$SHELL\"");
        let mut b = base();
        apply(&mut b, false, &TabLaunch { close_on_exit: true, ..Default::default() }).unwrap();
        assert_eq!(b[1], "export CLAUDE_JANELA_PID=$$; 'claude'");
    }

    #[test]
    fn missing_prompt_file_is_an_error() {
        let mut a = vec!["-Command".to_string(), "& 'claude'".to_string()];
        let launch = TabLaunch { prompt_file: Some(r"Z:\nao\existe.txt".into()), ..Default::default() };
        assert!(apply(&mut a, true, &launch).is_err());
    }
}
