//! Sessões de PTY (ConPTY no Windows) com saída em lotes e controle de vazão.
//!
//! Fluxo de uma sessão:
//! - leitor: lê o PTY e manda os pedaços num canal limitado (se encher, o leitor para e o
//!   processo filho fica bloqueado na escrita: é o backpressure);
//! - emissor: junta os pedaços por alguns ms, decodifica UTF-8 sem partir caracteres e envia
//!   ao frontend. Se o frontend tiver mais de `HIGH_WATERMARK` bytes sem confirmar (`ack`),
//!   o emissor espera;
//! - vigia: espera o processo terminar, guarda o código de saída e fecha o PTY, o que encerra
//!   o leitor e faz o emissor mandar o evento `exit`.

use std::collections::HashMap;
use std::io::{Read, Write};
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, AtomicU32, Ordering};
use std::sync::mpsc::{self, RecvTimeoutError};
use std::sync::{Arc, Condvar, Mutex};
use std::thread;
use std::time::{Duration, Instant};

use portable_pty::{native_pty_system, ChildKiller, CommandBuilder, MasterPty, PtySize};
use serde::Serialize;

use crate::agent_status::{self, AgentState};
use crate::shell::is_internal_env;

const READ_BUF: usize = 64 * 1024;
const BATCH_WINDOW: Duration = Duration::from_millis(6);
const BATCH_MAX: usize = 256 * 1024;
const HIGH_WATERMARK: usize = 1024 * 1024;
const LOW_WATERMARK: usize = 256 * 1024;
/// Se o frontend parar de confirmar (bug ou aba travada), não congela a saída para sempre.
const ACK_TIMEOUT: Duration = Duration::from_secs(2);

#[derive(Clone, Serialize)]
#[serde(tag = "kind", rename_all = "camelCase")]
pub enum PtyEvent {
    /// `bytes` é o valor que o frontend devolve no `ack` depois de desenhar.
    Data { data: String, bytes: usize },
    Exit { code: Option<u32> },
    /// Estado do Claude Code da aba, vindo dos hooks (ver `agent_status`).
    Agent { state: AgentState },
}

pub struct SpawnSpec<'a> {
    pub shell: &'a Path,
    pub args: Vec<String>,
    pub cwd: PathBuf,
    pub cols: u16,
    pub rows: u16,
}

struct Flow {
    unacked: Mutex<usize>,
    cv: Condvar,
    closed: AtomicBool,
}

impl Flow {
    fn wait_for_room(&self) {
        let guard = self.unacked.lock().unwrap();
        if *guard <= HIGH_WATERMARK {
            return;
        }
        let _ = self
            .cv
            .wait_timeout_while(guard, ACK_TIMEOUT, |n| *n > LOW_WATERMARK && !self.closed.load(Ordering::Relaxed));
    }

    fn add(&self, n: usize) {
        *self.unacked.lock().unwrap() += n;
    }

    fn ack(&self, n: usize) {
        let mut g = self.unacked.lock().unwrap();
        *g = g.saturating_sub(n);
        self.cv.notify_all();
    }

    fn close(&self) {
        self.closed.store(true, Ordering::Relaxed);
        self.cv.notify_all();
    }
}

struct Session {
    owner: String,
    master: Mutex<Box<dyn MasterPty + Send>>,
    writer: Mutex<Box<dyn Write + Send>>,
    killer: Mutex<Box<dyn ChildKiller + Send + Sync>>,
    flow: Arc<Flow>,
}

#[derive(Default)]
pub struct PtyManager {
    sessions: Mutex<HashMap<u32, Arc<Session>>>,
    next_id: AtomicU32,
}

impl PtyManager {
    /// Abre o processo e começa a enviar eventos por `emit`. `emit` devolve `false` quando
    /// o destino sumiu (aba fechada), e aí a sessão é encerrada.
    pub fn spawn<F>(self: &Arc<Self>, owner: &str, spec: SpawnSpec, emit: F) -> Result<u32, String>
    where
        F: Fn(PtyEvent) -> bool + Send + Sync + 'static,
    {
        let emit = Arc::new(emit);
        let pair = native_pty_system()
            .openpty(PtySize { rows: spec.rows.max(1), cols: spec.cols.max(1), pixel_width: 0, pixel_height: 0 })
            .map_err(|e| format!("não foi possível abrir o pseudoterminal: {e}"))?;

        let mut cmd = CommandBuilder::new(spec.shell);
        cmd.args(&spec.args);
        cmd.cwd(&spec.cwd);
        for (key, _) in std::env::vars_os() {
            if is_internal_env(&key.to_string_lossy()) {
                cmd.env_remove(key);
            }
        }
        cmd.env("TERM", "xterm-256color");
        cmd.env("COLORTERM", "truecolor");
        cmd.env("TERM_PROGRAM", "termo");
        cmd.env("TERM_PROGRAM_VERSION", env!("CARGO_PKG_VERSION"));
        // O id sai antes do processo para os hooks do Claude saberem o arquivo de estado da aba.
        let id = self.next_id.fetch_add(1, Ordering::Relaxed) + 1;
        cmd.env(agent_status::ENV_VAR, agent_status::env_value(id));

        let mut child = pair
            .slave
            .spawn_command(cmd)
            .map_err(|e| format!("não foi possível iniciar {}: {e}", spec.shell.display()))?;
        drop(pair.slave);

        let mut reader = pair.master.try_clone_reader().map_err(|e| e.to_string())?;
        let writer = pair.master.take_writer().map_err(|e| e.to_string())?;
        let flow = Arc::new(Flow { unacked: Mutex::new(0), cv: Condvar::new(), closed: AtomicBool::new(false) });

        self.sessions.lock().unwrap().insert(
            id,
            Arc::new(Session {
                owner: owner.to_string(),
                master: Mutex::new(pair.master),
                writer: Mutex::new(writer),
                killer: Mutex::new(child.clone_killer()),
                flow: flow.clone(),
            }),
        );

        let (tx, rx) = mpsc::sync_channel::<Vec<u8>>(64);
        thread::Builder::new()
            .name(format!("pty-{id}-read"))
            .spawn(move || {
                let mut buf = vec![0u8; READ_BUF];
                loop {
                    match reader.read(&mut buf) {
                        Ok(0) | Err(_) => break,
                        Ok(n) => {
                            if tx.send(buf[..n].to_vec()).is_err() {
                                break;
                            }
                        }
                    }
                }
            })
            .map_err(|e| e.to_string())?;

        let (closed, agent_emit) = (flow.clone(), emit.clone());
        let watched = agent_status::watch(
            id,
            move || closed.closed.load(Ordering::Relaxed),
            move |state| {
                agent_emit(PtyEvent::Agent { state });
            },
        );
        if let Err(e) = watched {
            log::warn!("sem vigia de estado do Claude na sessão {id}: {e}");
        }

        let exit_code = Arc::new(Mutex::new(None::<u32>));

        let code_slot = exit_code.clone();
        let mgr = Arc::clone(self);
        thread::Builder::new()
            .name(format!("pty-{id}-wait"))
            .spawn(move || {
                let code = child.wait().ok().map(|s| s.exit_code());
                *code_slot.lock().unwrap() = code;
                // Fecha o pseudoconsole: no Windows o leitor só recebe EOF depois disso.
                mgr.remove(id);
            })
            .map_err(|e| e.to_string())?;

        let mgr = Arc::clone(self);
        thread::Builder::new()
            .name(format!("pty-{id}-emit"))
            .spawn(move || {
                let mut carry = Vec::new();
                'outer: while let Ok(first) = rx.recv() {
                    let mut batch = first;
                    let deadline = Instant::now() + BATCH_WINDOW;
                    while batch.len() < BATCH_MAX {
                        let left = deadline.saturating_duration_since(Instant::now());
                        match rx.recv_timeout(left) {
                            Ok(more) => batch.extend_from_slice(&more),
                            Err(RecvTimeoutError::Timeout) => break,
                            Err(RecvTimeoutError::Disconnected) => break,
                        }
                    }
                    carry.extend_from_slice(&batch);
                    let text = take_utf8(&mut carry, false);
                    if text.is_empty() {
                        continue;
                    }
                    flow.wait_for_room();
                    let bytes = text.len();
                    flow.add(bytes);
                    if !emit(PtyEvent::Data { data: text, bytes }) {
                        mgr.kill(id);
                        break 'outer;
                    }
                }
                let rest = take_utf8(&mut carry, true);
                if !rest.is_empty() {
                    let bytes = rest.len();
                    emit(PtyEvent::Data { data: rest, bytes });
                }
                // O vigia grava o código antes de fechar o PTY; espera um pouco por garantia.
                let started = Instant::now();
                let code = loop {
                    if let Some(c) = *exit_code.lock().unwrap() {
                        break Some(c);
                    }
                    if started.elapsed() > Duration::from_millis(500) {
                        break None;
                    }
                    thread::sleep(Duration::from_millis(10));
                };
                emit(PtyEvent::Exit { code });
            })
            .map_err(|e| e.to_string())?;

        Ok(id)
    }

    fn get(&self, id: u32) -> Option<Arc<Session>> {
        self.sessions.lock().unwrap().get(&id).cloned()
    }

    fn remove(&self, id: u32) {
        if let Some(s) = self.sessions.lock().unwrap().remove(&id) {
            s.flow.close();
        }
    }

    pub fn write(&self, id: u32, data: &str) -> Result<(), String> {
        let s = self.get(id).ok_or("sessão encerrada")?;
        let mut w = s.writer.lock().unwrap();
        w.write_all(data.as_bytes()).and_then(|_| w.flush()).map_err(|e| e.to_string())
    }

    pub fn resize(&self, id: u32, cols: u16, rows: u16) -> Result<(), String> {
        if cols == 0 || rows == 0 {
            return Ok(());
        }
        let s = self.get(id).ok_or("sessão encerrada")?;
        let m = s.master.lock().unwrap();
        m.resize(PtySize { rows, cols, pixel_width: 0, pixel_height: 0 }).map_err(|e| e.to_string())
    }

    pub fn ack(&self, id: u32, bytes: usize) {
        if let Some(s) = self.get(id) {
            s.flow.ack(bytes);
        }
    }

    /// Mata o processo; o vigia remove a sessão quando ele terminar.
    pub fn kill(&self, id: u32) {
        if let Some(s) = self.get(id) {
            s.flow.close();
            let _ = s.killer.lock().unwrap().kill();
        }
    }

    /// Mata as sessões de uma janela (recarregou, travou ou fechou).
    pub fn kill_owner(&self, owner: &str) {
        let ids: Vec<u32> = self.sessions.lock().unwrap().iter().filter(|(_, s)| s.owner == owner).map(|(id, _)| *id).collect();
        for id in ids {
            self.kill(id);
        }
    }

    pub fn kill_all(&self) {
        let ids: Vec<u32> = self.sessions.lock().unwrap().keys().copied().collect();
        for id in ids {
            self.kill(id);
        }
    }
}

/// Tira de `buf` o maior trecho UTF-8 completo. Um caractere partido no fim do lote fica
/// guardado para o próximo; bytes inválidos viram U+FFFD. Com `flush`, esvazia tudo.
pub fn take_utf8(buf: &mut Vec<u8>, flush: bool) -> String {
    match std::str::from_utf8(buf) {
        Ok(s) => {
            let out = s.to_owned();
            buf.clear();
            out
        }
        Err(e) => {
            let cut = if e.error_len().is_none() && !flush { e.valid_up_to() } else { buf.len() };
            let out = String::from_utf8_lossy(&buf[..cut]).into_owned();
            buf.drain(..cut);
            out
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn keeps_split_char_for_next_batch() {
        let bytes = "ação".as_bytes();
        let mut buf = bytes[..2].to_vec(); // "a" + primeiro byte de "ç"
        assert_eq!(take_utf8(&mut buf, false), "a");
        assert_eq!(buf.len(), 1);
        buf.extend_from_slice(&bytes[2..]);
        assert_eq!(take_utf8(&mut buf, false), "ção");
        assert!(buf.is_empty());
    }

    #[test]
    fn replaces_invalid_bytes() {
        let mut buf = vec![b'a', 0xff, b'b'];
        assert_eq!(take_utf8(&mut buf, false), "a\u{fffd}b");
    }

    #[test]
    fn flush_drains_incomplete_tail() {
        let mut buf = vec![b'x', 0xc3];
        assert_eq!(take_utf8(&mut buf, true), "x\u{fffd}");
        assert!(buf.is_empty());
    }

    #[test]
    fn flow_ack_unblocks() {
        let flow = Arc::new(Flow { unacked: Mutex::new(0), cv: Condvar::new(), closed: AtomicBool::new(false) });
        flow.add(HIGH_WATERMARK + 10);
        let f = flow.clone();
        let t = thread::spawn(move || {
            thread::sleep(Duration::from_millis(50));
            f.ack(HIGH_WATERMARK);
        });
        let start = Instant::now();
        flow.wait_for_room();
        assert!(start.elapsed() < ACK_TIMEOUT);
        t.join().unwrap();
    }
}
