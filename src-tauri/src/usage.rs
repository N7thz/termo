//! Uso do plano do Claude (janela de 5 h e limite semanal), para a bateria da barra de título.
//!
//! O Claude Code manda ao comando do `statusLine` um JSON com `rate_limits` (`five_hour` e
//! `seven_day`, cada um com `used_percentage` e `resets_at`). As abas do Claude no Termo rodam com
//! `--settings <hooks.json>`, e esse arquivo traz um `statusLine` que só grava o JSON em
//! [`usage_file`]. Aqui lemos o último gravado. Nada sai da máquina.

use std::fs;
use std::path::PathBuf;
use std::time::UNIX_EPOCH;

use serde::Serialize;

/// Arquivo com o último JSON do `statusLine` (o mesmo para todas as janelas e abas).
pub fn usage_file() -> PathBuf {
    std::env::temp_dir().join("termo-agent").join("usage.json")
}

/// Comando do `statusLine`: grava o JSON e não imprime nada (a linha de status fica vazia).
///
/// Também grava uma cópia por aba em `$TERMO_AGENT_STATUS.line` (modelo, esforço, contexto e custo daquela
/// sessão, para a barra do Claude). Fora do Termo a variável não existe e só o arquivo geral é gravado.
pub fn statusline_command() -> String {
    let path = usage_file().to_string_lossy().replace('\\', "/");
    let env = crate::agent_status::ENV_VAR;
    format!(
        "t=$(cat); printf '%s' \"$t\" > \"{path}.tmp\" && mv -f \"{path}.tmp\" \"{path}\"; \
         [ -n \"${env}\" ] && printf '%s' \"$t\" > \"${env}.line\"; exit 0"
    )
}

/// Arquivo com a última linha de status da sessão `id` (veja [`statusline_command`]).
pub fn line_file(id: u32) -> std::path::PathBuf {
    let mut p = crate::agent_status::state_file(id).into_os_string();
    p.push(".line");
    p.into()
}

/// O que a barra do Claude mostra de uma aba, tirado da linha de status do Claude Code.
#[derive(Serialize, Debug, PartialEq, Default)]
#[serde(rename_all = "camelCase")]
pub struct ClaudeLine {
    pub model_id: Option<String>,
    pub model_name: Option<String>,
    pub effort: Option<String>,
    /// `default`, `acceptEdits`, `plan`... quando o Claude Code manda (nem toda versão manda).
    pub permission_mode: Option<String>,
    pub cwd: Option<String>,
    pub cost_usd: Option<f64>,
    pub duration_ms: Option<i64>,
    pub lines_added: Option<i64>,
    pub lines_removed: Option<i64>,
    /// Quanto do contexto já foi usado, de 0 a 100.
    pub context_pct: Option<f64>,
    pub context_size: Option<i64>,
    pub fast_mode: bool,
    /// Quando o Claude Code mandou esses dados (ms desde 1970).
    pub updated_at: i64,
}

/// Extrai a linha de status de uma aba. `None` se o JSON estiver pela metade.
pub fn parse_line(text: &str, updated_at: i64) -> Option<ClaudeLine> {
    let v: serde_json::Value = serde_json::from_str(text.trim()).ok()?;
    let s = |ptr: &str| v.pointer(ptr).and_then(|x| x.as_str()).map(str::to_string);
    let f = |ptr: &str| v.pointer(ptr).and_then(|x| x.as_f64());
    let i = |ptr: &str| v.pointer(ptr).and_then(|x| x.as_f64()).map(|n| n as i64);
    Some(ClaudeLine {
        model_id: s("/model/id"),
        model_name: s("/model/display_name"),
        effort: s("/effort/level"),
        permission_mode: s("/permission_mode"),
        cwd: s("/workspace/current_dir").or_else(|| s("/cwd")),
        cost_usd: f("/cost/total_cost_usd"),
        duration_ms: i("/cost/total_duration_ms"),
        lines_added: i("/cost/total_lines_added"),
        lines_removed: i("/cost/total_lines_removed"),
        context_pct: f("/context_window/used_percentage").map(|p| p.clamp(0.0, 100.0)),
        context_size: i("/context_window/context_window_size"),
        fast_mode: v.pointer("/fast_mode").and_then(|x| x.as_bool()).unwrap_or(false),
        updated_at,
    })
}

/// Última linha de status da aba `id`; `None` antes da primeira resposta do Claude.
pub fn session_line(id: u32) -> Option<ClaudeLine> {
    let file = line_file(id);
    let updated_at = fs::metadata(&file)
        .and_then(|m| m.modified())
        .ok()
        .and_then(|t| t.duration_since(UNIX_EPOCH).ok())
        .map_or(0, |d| d.as_millis() as i64);
    parse_line(&fs::read_to_string(&file).ok()?, updated_at)
}

/// O usuário já tem `statusLine` próprio em `~/.claude/settings.json`? Nesse caso não o trocamos.
pub fn user_has_statusline() -> bool {
    let Some(home) = dirs::home_dir() else { return false };
    let Ok(text) = fs::read_to_string(home.join(".claude").join("settings.json")) else { return false };
    serde_json::from_str::<serde_json::Value>(&text)
        .ok()
        .is_some_and(|v| v.get("statusLine").is_some_and(|s| !s.is_null()))
}

#[derive(Serialize, Debug, PartialEq, Clone)]
#[serde(rename_all = "camelCase")]
pub struct Window {
    /// Quanto da janela já foi usado, de 0 a 100.
    pub used_pct: f64,
    /// Quando a janela recomeça, em milissegundos desde 1970.
    pub resets_at: Option<i64>,
}

#[derive(Serialize, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Usage {
    pub five_hour: Option<Window>,
    pub seven_day: Option<Window>,
    /// Quando o Claude Code mandou esses dados (ms desde 1970).
    pub updated_at: i64,
    /// `false` quando o Termo não pôs o `statusLine` (o usuário tem um próprio) e não há dados.
    pub tracking: bool,
}

/// `resets_at` vem em segundos (ou ms, ou texto ISO); devolve milissegundos.
fn reset_ms(v: &serde_json::Value) -> Option<i64> {
    if let Some(n) = v.as_f64() {
        let n = n as i64;
        return Some(if n < 100_000_000_000 { n * 1000 } else { n });
    }
    let s = v.as_str()?;
    if let Ok(n) = s.parse::<i64>() {
        return reset_ms(&serde_json::json!(n));
    }
    parse_iso(s)
}

/// `2026-11-22T18:30:00Z` (ou com `.123` e `+00:00`) em ms. Só UTC e deslocamentos fixos.
fn parse_iso(s: &str) -> Option<i64> {
    let (date, rest) = s.split_once('T')?;
    let mut d = date.split('-').map(|p| p.parse::<i64>().ok());
    let (y, m, day) = (d.next()??, d.next()??, d.next()??);
    let (time, offset_min) = if let Some(t) = rest.strip_suffix('Z') {
        (t, 0)
    } else if let Some(i) = rest.rfind(['+', '-']) {
        let (t, off) = rest.split_at(i);
        let sign = if off.starts_with('-') { -1 } else { 1 };
        let mut o = off[1..].split(':').map(|p| p.parse::<i64>().ok());
        (t, sign * (o.next()?? * 60 + o.next().flatten().unwrap_or(0)))
    } else {
        (rest, 0)
    };
    let mut t = time.split(':');
    let h: i64 = t.next()?.parse().ok()?;
    let mi: i64 = t.next()?.parse().ok()?;
    let sec: f64 = t.next().unwrap_or("0").parse().ok()?;
    // Dias desde 1970 (algoritmo de Howard Hinnant).
    let y2 = if m <= 2 { y - 1 } else { y };
    let era = y2.div_euclid(400);
    let yoe = y2 - era * 400;
    let mp = (m + 9) % 12;
    let doy = (153 * mp + 2) / 5 + day - 1;
    let doe = yoe * 365 + yoe / 4 - yoe / 100 + doy;
    let days = era * 146_097 + doe - 719_468;
    let secs = days * 86_400 + h * 3600 + mi * 60 - offset_min * 60;
    Some(secs * 1000 + (sec * 1000.0) as i64)
}

fn window(v: Option<&serde_json::Value>) -> Option<Window> {
    let v = v?;
    let pct = v.get("used_percentage").or_else(|| v.get("utilization")).and_then(|p| p.as_f64())?;
    Some(Window { used_pct: pct.clamp(0.0, 100.0), resets_at: v.get("resets_at").and_then(reset_ms) })
}

/// Extrai os limites do JSON do `statusLine`. `None` se o JSON estiver pela metade.
pub fn parse(text: &str, updated_at: i64) -> Option<Usage> {
    let v: serde_json::Value = serde_json::from_str(text.trim()).ok()?;
    let limits = v.get("rate_limits");
    Some(Usage {
        five_hour: window(limits.and_then(|l| l.get("five_hour"))),
        seven_day: window(limits.and_then(|l| l.get("seven_day"))),
        updated_at,
        tracking: true,
    })
}

/// Último uso gravado; sem arquivo, um `Usage` vazio.
pub fn read() -> Usage {
    let file = usage_file();
    let updated_at = fs::metadata(&file)
        .and_then(|m| m.modified())
        .ok()
        .and_then(|t| t.duration_since(UNIX_EPOCH).ok())
        .map_or(0, |d| d.as_millis() as i64);
    fs::read_to_string(&file).ok().and_then(|t| parse(&t, updated_at)).unwrap_or(Usage {
        five_hour: None,
        seven_day: None,
        updated_at: 0,
        tracking: !user_has_statusline(),
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_rate_limits() {
        let json = r#"{"model":{"id":"x"},"rate_limits":{"five_hour":{"used_percentage":23.5,"resets_at":1795000000},"seven_day":{"used_percentage":120,"resets_at":"2026-11-27T12:00:00Z"}}}"#;
        let u = parse(json, 5).unwrap();
        assert_eq!(u.five_hour, Some(Window { used_pct: 23.5, resets_at: Some(1_795_000_000_000) }));
        let week = u.seven_day.unwrap();
        assert_eq!(week.used_pct, 100.0);
        assert_eq!(week.resets_at, parse_iso("2026-11-27T12:00:00+00:00"));
        assert_eq!(u.updated_at, 5);
    }

    #[test]
    fn missing_limits_and_half_written_json() {
        let u = parse(r#"{"model":{"id":"x"}}"#, 1).unwrap();
        assert_eq!(u.five_hour, None);
        assert_eq!(u.seven_day, None);
        assert!(parse(r#"{"rate_limits":"#, 1).is_none());
    }

    #[test]
    fn iso_dates() {
        assert_eq!(parse_iso("1970-01-01T00:00:00Z"), Some(0));
        assert_eq!(parse_iso("2000-03-01T00:00:00Z"), Some(951_868_800_000));
        assert_eq!(parse_iso("1970-01-01T01:00:00+01:00"), Some(0));
        assert_eq!(parse_iso("1970-01-01T00:00:01.5Z"), Some(1500));
    }

    #[test]
    fn statusline_is_silent() {
        let cmd = statusline_command();
        assert!(cmd.starts_with("t=$(cat); "));
        assert!(cmd.ends_with("exit 0"));
        assert!(!cmd.contains('\\'));
        assert!(cmd.contains("> \"$TERMO_AGENT_STATUS.line\""));
        assert!(!cmd.contains("echo"), "a linha de status precisa ficar vazia");
    }

    #[test]
    fn parses_session_line() {
        let json = r#"{"model":{"id":"claude-opus-5-5","display_name":"Opus 5.5"},"workspace":{"current_dir":"D:/x"},"cost":{"total_cost_usd":1.25,"total_duration_ms":60000,"total_lines_added":10,"total_lines_removed":2},"context_window":{"used_percentage":42.5,"context_window_size":200000},"effort":{"level":"high"},"fast_mode":true}"#;
        let l = parse_line(json, 7).unwrap();
        assert_eq!(l.model_name.as_deref(), Some("Opus 5.5"));
        assert_eq!(l.effort.as_deref(), Some("high"));
        assert_eq!(l.cwd.as_deref(), Some("D:/x"));
        assert_eq!(l.context_pct, Some(42.5));
        assert_eq!(l.context_size, Some(200_000));
        assert_eq!((l.lines_added, l.lines_removed), (Some(10), Some(2)));
        assert!(l.fast_mode);
        assert_eq!(l.permission_mode, None);
        assert_eq!(l.updated_at, 7);
        assert!(parse_line("{\"model\":", 1).is_none());
    }

    #[test]
    fn line_file_sits_next_to_the_state_file() {
        assert!(line_file(5).to_string_lossy().ends_with("5.state.line"));
    }
}
