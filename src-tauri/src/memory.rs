//! Modo leve em segundo plano: com a janela minimizada ou na bandeja, o Termo pede ao WebView2 o
//! modo de pouca memória e devolve ao Windows a memória ociosa (working set) dele, do WebView2 e dos
//! processos das abas (shells, Claude). Nada é encerrado: as páginas voltam conforme forem usadas.

use serde::Serialize;

#[derive(Debug, Clone, Copy, Default, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MemoryUsage {
    /// Memória física em uso agora (working set), em bytes, somando todos os processos.
    pub working_set: u64,
    /// Memória reservada só para eles (private bytes).
    pub private: u64,
    /// Quantos processos: o Termo, o WebView2 e os das abas.
    pub processes: u32,
}

/// Processos descendentes de `root` (inclusive), a partir de pares (pid, pai).
pub fn descendants(root: u32, pairs: &[(u32, u32)]) -> Vec<u32> {
    let mut out = vec![root];
    let mut i = 0;
    while i < out.len() {
        let parent = out[i];
        for &(pid, ppid) in pairs {
            // pid 0 e ciclos (pid reaproveitado) não entram.
            if ppid == parent && pid != 0 && pid != parent && !out.contains(&pid) {
                out.push(pid);
            }
        }
        i += 1;
    }
    out
}

#[cfg(windows)]
mod win {
    use super::MemoryUsage;
    use windows::Win32::Foundation::CloseHandle;
    use windows::Win32::System::Diagnostics::ToolHelp::{
        CreateToolhelp32Snapshot, Process32FirstW, Process32NextW, PROCESSENTRY32W, TH32CS_SNAPPROCESS,
    };
    use windows::Win32::System::ProcessStatus::{EmptyWorkingSet, GetProcessMemoryInfo, PROCESS_MEMORY_COUNTERS_EX};
    use windows::Win32::System::Threading::{OpenProcess, PROCESS_QUERY_LIMITED_INFORMATION, PROCESS_SET_QUOTA};

    /// Pares (pid, pai) de todos os processos.
    fn snapshot() -> Vec<(u32, u32)> {
        let mut out = Vec::new();
        unsafe {
            let Ok(snap) = CreateToolhelp32Snapshot(TH32CS_SNAPPROCESS, 0) else { return out };
            let mut e = PROCESSENTRY32W { dwSize: std::mem::size_of::<PROCESSENTRY32W>() as u32, ..Default::default() };
            if Process32FirstW(snap, &mut e).is_ok() {
                loop {
                    out.push((e.th32ProcessID, e.th32ParentProcessID));
                    if Process32NextW(snap, &mut e).is_err() {
                        break;
                    }
                }
            }
            let _ = CloseHandle(snap);
        }
        out
    }

    /// O Termo e tudo que ele abriu (WebView2, shells, Claude...).
    pub fn tree() -> Vec<u32> {
        super::descendants(std::process::id(), &snapshot())
    }

    /// Soma o uso de memória dos processos; com `trim`, antes devolve a memória ociosa ao Windows.
    pub fn measure(pids: &[u32], trim: bool) -> MemoryUsage {
        let mut usage = MemoryUsage::default();
        for &pid in pids {
            unsafe {
                let access = PROCESS_QUERY_LIMITED_INFORMATION | if trim { PROCESS_SET_QUOTA } else { Default::default() };
                let Ok(h) = OpenProcess(access, false, pid) else { continue };
                if trim {
                    let _ = EmptyWorkingSet(h);
                }
                let mut c = PROCESS_MEMORY_COUNTERS_EX {
                    cb: std::mem::size_of::<PROCESS_MEMORY_COUNTERS_EX>() as u32,
                    ..Default::default()
                };
                if GetProcessMemoryInfo(h, &mut c as *mut _ as *mut _, c.cb).is_ok() {
                    usage.working_set += c.WorkingSetSize as u64;
                    usage.private += c.PrivateUsage as u64;
                    usage.processes += 1;
                }
                let _ = CloseHandle(h);
            }
        }
        usage
    }
}

/// Uso de memória do Termo e de tudo que ele abriu.
pub fn usage() -> MemoryUsage {
    #[cfg(windows)]
    {
        win::measure(&win::tree(), false)
    }
    #[cfg(not(windows))]
    {
        MemoryUsage::default()
    }
}

/// Devolve ao Windows a memória ociosa do Termo e de tudo que ele abriu; devolve o uso depois.
pub fn trim() -> MemoryUsage {
    #[cfg(windows)]
    {
        win::measure(&win::tree(), true)
    }
    #[cfg(not(windows))]
    {
        MemoryUsage::default()
    }
}

/// Pede ao WebView2 da janela o modo de pouca memória (`low`) ou o normal. Sem efeito em WebView2 antigo.
pub fn set_webview_low<R: tauri::Runtime>(window: &tauri::WebviewWindow<R>, low: bool) {
    #[cfg(windows)]
    {
        let _ = window.with_webview(move |w| unsafe {
            use webview2_com::Microsoft::Web::WebView2::Win32::{
                ICoreWebView2_19, COREWEBVIEW2_MEMORY_USAGE_TARGET_LEVEL_LOW, COREWEBVIEW2_MEMORY_USAGE_TARGET_LEVEL_NORMAL,
            };
            use windows::core::Interface;
            let Ok(core) = w.controller().CoreWebView2() else { return };
            let Ok(core19) = core.cast::<ICoreWebView2_19>() else { return };
            let level = if low { COREWEBVIEW2_MEMORY_USAGE_TARGET_LEVEL_LOW } else { COREWEBVIEW2_MEMORY_USAGE_TARGET_LEVEL_NORMAL };
            let _ = core19.SetMemoryUsageTargetLevel(level);
        });
    }
    #[cfg(not(windows))]
    let _ = (window, low);
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn finds_descendants_without_cycles() {
        let pairs = [(10, 1), (11, 10), (12, 11), (20, 1), (13, 12), (14, 14), (0, 10)];
        let mut d = descendants(10, &pairs);
        d.sort();
        assert_eq!(d, vec![10, 11, 12, 13]);
    }

    #[test]
    fn measures_this_process() {
        let u = usage();
        if cfg!(windows) {
            assert!(u.processes >= 1 && u.working_set > 0);
        }
    }
}
