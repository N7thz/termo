//! Log em arquivo e registro de pânicos.
//!
//! Em release o Termo não tem console (`windows_subsystem = "windows"`), então o que antes ia para o
//! `eprintln!` se perdia. Agora vai para `%LOCALAPPDATA%\dev.termo.app\logs\termo.log` (a pasta de
//! logs do app), que o usuário pode anexar a um relato de problema.

use tauri::plugin::TauriPlugin;
use tauri::Runtime;
use tauri_plugin_log::{RotationStrategy, Target, TargetKind, TimezoneStrategy};

/// 2 MB por arquivo; ao passar disso o atual vira o único arquivo antigo guardado.
const MAX_FILE_SIZE: u128 = 2_000_000;

pub fn plugin<R: Runtime>() -> TauriPlugin<R> {
    tauri_plugin_log::Builder::new()
        .clear_targets()
        .targets([
            Target::new(TargetKind::LogDir { file_name: Some("termo".into()) }),
            Target::new(TargetKind::Stdout),
        ])
        .level(log::LevelFilter::Info)
        .max_file_size(MAX_FILE_SIZE)
        .rotation_strategy(RotationStrategy::KeepOne)
        .timezone_strategy(TimezoneStrategy::UseLocal)
        .build()
}

/// Registra todo pânico (de qualquer thread) no log, com o backtrace, antes do comportamento padrão.
/// Um pânico antes do plugin de log subir só vai para o stderr, como antes.
pub fn install_panic_hook() {
    let default = std::panic::take_hook();
    std::panic::set_hook(Box::new(move |info| {
        let thread = std::thread::current();
        let name = thread.name().unwrap_or("sem nome");
        let backtrace = std::backtrace::Backtrace::force_capture();
        log::error!("pânico na thread '{name}': {info}\n{backtrace}");
        default(info);
    }));
}
