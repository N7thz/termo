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

/// Pasta das imagens coladas (print, imagem copiada do navegador) que viram arquivo para o shell.
pub fn paste_dir() -> PathBuf {
    std::env::temp_dir().join("termo-paste")
}

/// Arquivos colados com mais que isso são apagados ao colar o próximo.
const PASTE_KEEP: std::time::Duration = std::time::Duration::from_secs(7 * 24 * 3600);

/// Grava a imagem (RGBA, como vem da área de transferência) como PNG em `dir`, com um nome novo
/// (`colado-<ms>.png`), e apaga as coladas há mais de uma semana. Devolve o caminho.
pub fn save_png(dir: &Path, rgba: &[u8], width: u32, height: u32) -> Result<PathBuf, String> {
    if width == 0 || height == 0 || rgba.len() != width as usize * height as usize * 4 {
        return Err("imagem da área de transferência inválida".into());
    }
    std::fs::create_dir_all(dir).map_err(|e| format!("não foi possível criar {}: {e}", dir.display()))?;
    prune_pastes(dir);
    let now = std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).unwrap_or_default();
    let mut path = dir.join(format!("colado-{}.png", now.as_millis()));
    let mut n = 1;
    while path.exists() {
        path = dir.join(format!("colado-{}-{n}.png", now.as_millis()));
        n += 1;
    }
    let file = std::fs::File::create(&path).map_err(|e| format!("não foi possível gravar a imagem: {e}"))?;
    let mut enc = png::Encoder::new(std::io::BufWriter::new(file), width, height);
    enc.set_color(png::ColorType::Rgba);
    enc.set_depth(png::BitDepth::Eight);
    enc.write_header()
        .and_then(|mut w| w.write_image_data(rgba))
        .map_err(|e| format!("não foi possível gravar a imagem: {e}"))?;
    Ok(path)
}

fn prune_pastes(dir: &Path) {
    let Ok(entries) = std::fs::read_dir(dir) else { return };
    for e in entries.flatten() {
        let old = e
            .metadata()
            .and_then(|m| m.modified())
            .ok()
            .and_then(|t| t.elapsed().ok())
            .is_some_and(|age| age > PASTE_KEEP);
        let ours = e.file_name().to_string_lossy().starts_with("colado-");
        if old && ours {
            let _ = std::fs::remove_file(e.path());
        }
    }
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
    fn saves_pasted_image_as_png() {
        let dir = std::env::temp_dir().join(format!("termo-paste-test-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        let rgba = [255u8, 0, 0, 255, 0, 255, 0, 255]; // 2x1: vermelho, verde
        let a = save_png(&dir, &rgba, 2, 1).unwrap();
        let b = save_png(&dir, &rgba, 2, 1).unwrap();
        assert_ne!(a, b, "cada colagem vira um arquivo novo");
        let bytes = std::fs::read(&a).unwrap();
        assert_eq!(&bytes[..8], b"\x89PNG\r\n\x1a\n");
        assert!(preview(a.to_str().unwrap()).unwrap().data_url.starts_with("data:image/png;base64,"));
        // Tamanho que não bate com os pixels é recusado.
        assert!(save_png(&dir, &rgba, 3, 1).is_err());
        assert!(save_png(&dir, &[], 0, 0).is_err());
        let _ = std::fs::remove_dir_all(&dir);
    }

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
