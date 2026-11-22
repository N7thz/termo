//! Estado do Claude Code de cada aba (pensando, trabalhando, esperando, bloqueado, pronto).
//!
//! A aba do Claude roda o `claude` com `--settings <hooks.json>`. Esses hooks gravam o estado
//! num arquivo por sessão, cujo caminho vem na variável `TERMO_AGENT_STATUS` que o PTY define.
//! Um vigia por sessão olha a data do arquivo e manda o estado novo ao frontend.
//!
//! Os hooks rodam no Git Bash (é o que o Claude Code usa no Windows) e não escrevem nada na
//! saída padrão: no `UserPromptSubmit` a saída viraria contexto da conversa.

use std::fs;
use std::path::PathBuf;
use std::sync::OnceLock;
use std::thread;
use std::time::{Duration, SystemTime};

use serde::Serialize;

/// Variável que leva o caminho do arquivo de estado para o processo e seus hooks.
pub const ENV_VAR: &str = "TERMO_AGENT_STATUS";
const POLL: Duration = Duration::from_millis(250);

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum AgentState {
    /// O Claude abriu e espera o primeiro pedido.
    Idle,
    Thinking,
    Working,
    /// Terminou e espera a próxima mensagem (aviso de ociosidade do Claude Code).
    Waiting,
    /// Pede permissão para usar uma ferramenta.
    Blocked,
    Done,
    /// O Claude saiu; a aba volta a ser um shell comum.
    Off,
}

/// Pasta deste processo do Termo (duas janelas do app não misturam as sessões).
pub fn dir() -> PathBuf {
    std::env::temp_dir().join("termo-agent").join(std::process::id().to_string())
}

/// Arquivo de estado da sessão `id`.
pub fn state_file(id: u32) -> PathBuf {
    dir().join(format!("{id}.state"))
}

/// Valor de `TERMO_AGENT_STATUS` para a sessão `id`, com barras normais para o Git Bash.
pub fn env_value(id: u32) -> String {
    state_file(id).to_string_lossy().replace('\\', "/")
}

/// Escreve (uma vez por processo) o `hooks.json` passado ao `claude --settings`.
pub fn settings_file() -> Option<PathBuf> {
    static FILE: OnceLock<Option<PathBuf>> = OnceLock::new();
    FILE.get_or_init(|| {
        let path = dir().join("hooks.json");
        fs::create_dir_all(dir()).ok()?;
        fs::write(&path, hooks_json()).ok()?;
        Some(path)
    })
    .clone()
}

/// Comando de um hook: grava `state` no arquivo da sessão. Fora do Termo não faz nada.
fn write_cmd(state: &str) -> String {
    format!("[ -n \"${ENV_VAR}\" ] && printf {state} > \"${ENV_VAR}\"; exit 0")
}

/// Hooks do Claude Code. A notificação grava o JSON inteiro para dar para separar o pedido de
/// permissão do aviso de ociosidade.
pub fn hooks_json() -> String {
    let notify = format!("[ -n \"${ENV_VAR}\" ] && cat > \"${ENV_VAR}\"; exit 0");
    let events = [
        ("SessionStart", write_cmd("idle")),
        ("UserPromptSubmit", write_cmd("thinking")),
        ("PreToolUse", write_cmd("working")),
        ("PostToolUse", write_cmd("thinking")),
        ("PermissionRequest", write_cmd("blocked")),
        ("Notification", notify),
        ("Stop", write_cmd("done")),
        ("SessionEnd", write_cmd("off")),
    ];
    let hooks: serde_json::Map<String, serde_json::Value> = events
        .into_iter()
        .map(|(event, command)| {
            (event.to_string(), serde_json::json!([{ "hooks": [{ "type": "command", "command": command }] }]))
        })
        .collect();
    let mut settings = serde_json::json!({ "hooks": hooks });
    // A bateria de uso lê os limites que o Claude Code passa ao `statusLine` (veja usage.rs).
    // Quem já tem uma linha de status própria continua com ela.
    if !crate::usage::user_has_statusline() {
        settings["statusLine"] = serde_json::json!({ "type": "command", "command": crate::usage::statusline_command() });
    }
    settings.to_string()
}

/// Lê o conteúdo gravado por um hook. `None` quando não dá para entender (arquivo pela metade).
pub fn parse(content: &str) -> Option<AgentState> {
    let text = content.trim();
    if text.starts_with('{') {
        let v: serde_json::Value = serde_json::from_str(text).ok()?;
        let kind = v.get("notification_type").and_then(|k| k.as_str()).unwrap_or("");
        let message = v.get("message").and_then(|m| m.as_str()).unwrap_or("").to_lowercase();
        return Some(if kind == "permission_prompt" || message.contains("permission") {
            AgentState::Blocked
        } else {
            AgentState::Waiting
        });
    }
    Some(match text {
        "idle" => AgentState::Idle,
        "thinking" => AgentState::Thinking,
        "working" => AgentState::Working,
        "waiting" => AgentState::Waiting,
        "blocked" => AgentState::Blocked,
        "done" => AgentState::Done,
        "off" => AgentState::Off,
        _ => return None,
    })
}

/// Vigia o arquivo de estado da sessão até `closed()` dar verdadeiro. Chama `emit` só quando o
/// estado muda e apaga o arquivo no fim.
pub fn watch<C, F>(id: u32, closed: C, emit: F) -> std::io::Result<()>
where
    C: Fn() -> bool + Send + 'static,
    F: Fn(AgentState) + Send + 'static,
{
    let file = state_file(id);
    let _ = fs::remove_file(&file);
    thread::Builder::new().name(format!("pty-{id}-agent")).spawn(move || {
        let mut seen: Option<SystemTime> = None;
        let mut last: Option<AgentState> = None;
        while !closed() {
            thread::sleep(POLL);
            let Ok(modified) = fs::metadata(&file).and_then(|m| m.modified()) else { continue };
            if seen == Some(modified) {
                continue;
            }
            // Sem entender (o hook ainda escrevia), tenta de novo na próxima volta.
            let Some(state) = fs::read_to_string(&file).ok().as_deref().and_then(parse) else { continue };
            seen = Some(modified);
            if last != Some(state) {
                last = Some(state);
                emit(state);
            }
        }
        let _ = fs::remove_file(&file);
    })?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::atomic::{AtomicBool, Ordering};
    use std::sync::Arc;

    #[test]
    fn parses_plain_states() {
        assert_eq!(parse("thinking\n"), Some(AgentState::Thinking));
        assert_eq!(parse("done"), Some(AgentState::Done));
        assert_eq!(parse("off"), Some(AgentState::Off));
        assert_eq!(parse(""), None);
        assert_eq!(parse("thin"), None);
    }

    #[test]
    fn notification_splits_permission_from_idle() {
        let perm = r#"{"hook_event_name":"Notification","message":"Claude needs your permission to use Bash","notification_type":"permission_prompt"}"#;
        let idle = r#"{"hook_event_name":"Notification","message":"Claude is waiting for your input","notification_type":"idle_prompt"}"#;
        let old = r#"{"hook_event_name":"Notification","message":"Claude needs your permission to use Edit"}"#;
        assert_eq!(parse(perm), Some(AgentState::Blocked));
        assert_eq!(parse(idle), Some(AgentState::Waiting));
        assert_eq!(parse(old), Some(AgentState::Blocked));
        assert_eq!(parse(r#"{"message":"#), None);
    }

    #[test]
    fn hooks_are_silent_and_guarded() {
        let v: serde_json::Value = serde_json::from_str(&hooks_json()).unwrap();
        let hooks = v["hooks"].as_object().unwrap();
        for event in ["UserPromptSubmit", "PreToolUse", "PostToolUse", "Notification", "Stop", "SessionEnd"] {
            let cmd = hooks[event][0]["hooks"][0]["command"].as_str().unwrap();
            assert!(cmd.starts_with("[ -n \"$TERMO_AGENT_STATUS\" ]"), "{event}: {cmd}");
            assert!(cmd.ends_with("exit 0"), "{event}: {cmd}");
            assert!(cmd.contains("> \"$TERMO_AGENT_STATUS\""), "{event}: {cmd}");
        }
    }

    #[test]
    fn watcher_reports_changes_once() {
        let id = 900_000 + std::process::id() % 1000;
        fs::create_dir_all(dir()).unwrap();
        let closed = Arc::new(AtomicBool::new(false));
        let (tx, rx) = std::sync::mpsc::channel();
        let flag = closed.clone();
        watch(id, move || flag.load(Ordering::Relaxed), move |s| tx.send(s).unwrap()).unwrap();
        fs::write(state_file(id), "working").unwrap();
        assert_eq!(rx.recv_timeout(Duration::from_secs(3)).unwrap(), AgentState::Working);
        thread::sleep(Duration::from_millis(50));
        fs::write(state_file(id), "done").unwrap();
        assert_eq!(rx.recv_timeout(Duration::from_secs(3)).unwrap(), AgentState::Done);
        closed.store(true, Ordering::Relaxed);
        thread::sleep(POLL * 2);
        assert!(!state_file(id).exists());
    }

    #[test]
    fn env_value_uses_forward_slashes() {
        assert!(!env_value(7).contains('\\'));
        assert!(env_value(7).ends_with("/7.state"));
    }
}
