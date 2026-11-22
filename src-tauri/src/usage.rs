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
pub fn statusline_command() -> String {
    let path = usage_file().to_string_lossy().replace('\\', "/");
    format!("cat > \"{path}.tmp\" && mv -f \"{path}.tmp\" \"{path}\"; exit 0")
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
        assert!(cmd.starts_with("cat > \""));
        assert!(cmd.ends_with("exit 0"));
        assert!(!cmd.contains('\\'));
    }
}
