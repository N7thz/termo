//! Imagens citadas na saída de um comando, para a prévia nos blocos (features/blocks).
//!
//! A interface manda os nomes que achou no texto; aqui só passam arquivos que existem e têm extensão
//! de imagem. A prévia volta como `data:` (a CSP já aceita `img-src data:`), então não é preciso abrir
//! o protocolo de arquivos do Tauri para o disco inteiro.

use serde::Serialize;
use std::path::{Path, PathBuf};

const IMAGE_EXTS: &[(&str, &str)] = &[
    ("png", "image/png"),
    ("jpg", "image/jpeg"),
    ("jpeg", "image/jpeg"),
    ("gif", "image/gif"),
    ("webp", "image/webp"),
    ("bmp", "image/bmp"),
    ("ico", "image/x-icon"),
    ("svg", "image/svg+xml"),
    ("avif", "image/avif"),
];

/// Imagens maiores que isso não viram prévia (o base64 passa pelo IPC inteiro).
const MAX_BYTES: u64 = 12 * 1024 * 1024;
/// Quantas imagens um bloco mostra no máximo.
pub const MAX_IMAGES: usize = 24;

fn mime_of(path: &Path) -> Option<&'static str> {
    let ext = path.extension()?.to_str()?.to_ascii_lowercase();
    IMAGE_EXTS.iter().find(|(e, _)| *e == ext).map(|(_, m)| *m)
}

/// Caminho absoluto de um nome citado na saída (relativo à pasta em que o comando rodou).
fn resolve(cwd: Option<&Path>, raw: &str) -> Option<PathBuf> {
    let name = raw.trim().trim_matches(|c| c == '"' || c == '\'');
    if name.is_empty() || name.len() > 1024 || name.contains('\0') {
        return None;
    }
    let p = Path::new(name);
    let full = if p.is_absolute() { p.to_path_buf() } else { cwd?.join(p) };
    (mime_of(&full).is_some() && full.is_file()).then_some(full)
}

/// Dos nomes citados, os que são imagens que existem, sem repetir e na ordem em que apareceram.
pub fn existing(cwd: Option<&str>, candidates: &[String]) -> Vec<String> {
    let cwd = cwd.map(Path::new).filter(|d| d.is_dir());
    let mut out: Vec<String> = Vec::new();
    for c in candidates.iter().take(200) {
        let Some(full) = resolve(cwd, c) else { continue };
        let full = std::fs::canonicalize(&full).unwrap_or(full);
        let s = full.to_string_lossy().trim_start_matches(r"\\?\").to_string();
        if !out.contains(&s) {
            out.push(s);
            if out.len() >= MAX_IMAGES {
                break;
            }
        }
    }
    out
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Preview {
    pub data_url: String,
    pub bytes: u64,
}

/// A imagem como `data:` para o `<img>` da prévia.
pub fn preview(path: &str) -> Result<Preview, String> {
    let p = Path::new(path);
    let mime = mime_of(p).ok_or("não é uma imagem")?;
    let meta = std::fs::metadata(p).map_err(|e| format!("não foi possível ler {path}: {e}"))?;
    if !meta.is_file() {
        return Err(format!("não é um arquivo: {path}"));
    }
    if meta.len() > MAX_BYTES {
        return Err(format!("imagem grande demais para a prévia ({} MB)", meta.len() / 1024 / 1024));
    }
    let data = std::fs::read(p).map_err(|e| format!("não foi possível ler {path}: {e}"))?;
    Ok(Preview { data_url: format!("data:{mime};base64,{}", base64(&data)), bytes: meta.len() })
}

/// Só abre (no visualizador padrão) arquivos que são imagens.
pub fn check_openable(path: &str) -> Result<(), String> {
    let p = Path::new(path);
    if mime_of(p).is_none() || !p.is_file() {
        return Err(format!("imagem não encontrada: {path}"));
    }
    Ok(())
}

fn base64(data: &[u8]) -> String {
    const T: &[u8; 64] = b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
    let mut out = String::with_capacity(data.len().div_ceil(3) * 4);
    for chunk in data.chunks(3) {
        let b = [chunk[0], *chunk.get(1).unwrap_or(&0), *chunk.get(2).unwrap_or(&0)];
        let n = (u32::from(b[0]) << 16) | (u32::from(b[1]) << 8) | u32::from(b[2]);
        out.push(T[(n >> 18) as usize & 63] as char);
        out.push(T[(n >> 12) as usize & 63] as char);
        out.push(if chunk.len() > 1 { T[(n >> 6) as usize & 63] as char } else { '=' });
        out.push(if chunk.len() > 2 { T[n as usize & 63] as char } else { '=' });
    }
    out
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn encodes_base64() {
        assert_eq!(base64(b""), "");
        assert_eq!(base64(b"f"), "Zg==");
        assert_eq!(base64(b"fo"), "Zm8=");
        assert_eq!(base64(b"foo"), "Zm9v");
        assert_eq!(base64(b"foobar"), "Zm9vYmFy");
    }

    #[test]
    fn keeps_only_existing_images() {
        let dir = std::env::temp_dir().join(format!("termo-images-{}", std::process::id()));
        std::fs::create_dir_all(dir.join("sub")).unwrap();
        std::fs::write(dir.join("a.png"), b"x").unwrap();
        std::fs::write(dir.join("sub").join("b.JPG"), b"x").unwrap();
        std::fs::write(dir.join("notas.txt"), b"x").unwrap();
        let found = existing(
            dir.to_str(),
            &["a.png".into(), "'sub\\b.JPG'".into(), "a.png".into(), "notas.txt".into(), "falta.png".into()],
        );
        assert_eq!(found.len(), 2, "{found:?}");
        assert!(found[0].ends_with("a.png"));
        assert!(found[1].ends_with("b.JPG"));
        let p = preview(&found[0]).unwrap();
        assert_eq!(p.data_url, "data:image/png;base64,eA==");
        assert!(preview(dir.join("notas.txt").to_str().unwrap()).is_err());
        assert!(check_openable(dir.join("notas.txt").to_str().unwrap()).is_err());
        std::fs::remove_dir_all(&dir).ok();
    }
}
