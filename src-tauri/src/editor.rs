//! Abrir um arquivo citado na saída do terminal: no VS Code na linha certa, ou no app padrão.

use std::path::{Path, PathBuf};
use std::process::Command;

/// Tipos que o app padrão do Windows só mostra (texto, imagem, PDF, mídia). Lista do que pode, e não do
/// que não pode: a lista de executáveis e formatos ativos do Windows é longa e cresce (`.chm`, `.msix`,
/// `.rdp`, `.appinstaller`, `.docm`, `.iso`, `.html`, `.svg`...). Código de linguagens com interpretador
/// associado (`.py`, `.rb`, `.sh`, `.js`, `.mjs`) fica de fora: abrir pelo app padrão rodaria o script.
const VIEW_ONLY: &[&str] = &[
    // texto e configuração
    "txt", "log", "md", "markdown", "json", "jsonc", "json5", "yaml", "yml", "toml", "ini", "cfg", "conf", "csv",
    "tsv", "lock", "diff", "patch", "env", "gitignore", "editorconfig",
    // código sem interpretador associado por padrão
    "ts", "tsx", "jsx", "rs", "go", "c", "h", "cc", "cpp", "hpp", "cs", "java", "kt", "swift", "css", "scss",
    "less", "sql", "graphql", "proto",
    // imagens (sem .svg: abre no navegador, com script)
    "png", "jpg", "jpeg", "gif", "webp", "bmp", "ico", "tif", "tiff", "avif",
    // documentos e mídia
    "pdf", "mp4", "webm", "mkv", "mov", "mp3", "wav", "ogg", "flac",
];

/// Abrir pelo app padrão pode executar ou carregar conteúdo ativo? Aí a alternativa ao VS Code é abrir a
/// pasta dele. O caminho vem de um link na saída do terminal, que qualquer programa (ou um `cat`) pode
/// escrever. Sem extensão (`Makefile`) o Windows só pergunta com que app abrir.
pub fn runs_when_opened(file: &Path) -> bool {
    match file.extension().and_then(|e| e.to_str()) {
        None => file.extension().is_some(),
        Some(e) => !VIEW_ONLY.iter().any(|v| v.eq_ignore_ascii_case(e)),
    }
}

/// Resolve o caminho citado (relativo à pasta da aba) e confirma que é um arquivo.
pub fn resolve_file(path: &str, cwd: Option<&str>) -> Result<PathBuf, String> {
    // O link vem da saída do terminal: caminho de rede não é aberto (ver paths::is_network_path).
    if crate::paths::is_network_path(path) || cwd.is_some_and(crate::paths::is_network_path) {
        return Err("caminhos de rede não são abertos pelos links do terminal".into());
    }
    let raw = Path::new(path.trim());
    let full = match cwd.map(Path::new).filter(|d| d.is_dir()) {
        Some(dir) if raw.is_relative() => dir.join(raw),
        _ => raw.to_path_buf(),
    };
    if full.is_file() {
        Ok(full)
    } else {
        Err(format!("arquivo não encontrado: {}", full.display()))
    }
}

/// Argumento do `code --goto`: `arquivo:linha:coluna` (linha/coluna só quando existem).
pub fn goto_arg(file: &Path, line: Option<u32>, column: Option<u32>) -> String {
    let mut s = file.display().to_string();
    if let Some(l) = line.filter(|l| *l > 0) {
        s.push_str(&format!(":{l}"));
        if let Some(c) = column.filter(|c| *c > 0) {
            s.push_str(&format!(":{c}"));
        }
    }
    s
}

/// Tenta o VS Code (`code --goto`); devolve `false` se ele não estiver no PATH.
pub fn open_in_vscode(file: &Path, line: Option<u32>, column: Option<u32>) -> bool {
    let Ok(code) = which::which("code") else { return false };
    let mut cmd = Command::new(code);
    cmd.args(["--goto", &goto_arg(file, line, column)]);
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        // CREATE_NO_WINDOW: o code.cmd não pisca uma janela de console.
        cmd.creation_flags(0x0800_0000);
    }
    cmd.spawn().is_ok()
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;

    #[test]
    fn runnable_files_are_not_opened() {
        for f in [
            "a.exe", "b.BAT", "c.ps1", "d.lnk", "e.js", "f.appref-ms", "g.chm", "h.msix", "i.rdp", "j.html", "k.svg",
            "l.docm", "m.iso", "n.py", "o.sh", "p.mjs", "q.appinstaller",
        ] {
            assert!(runs_when_opened(Path::new(f)), "{f}");
        }
        for f in ["a.ts", "b.rs", "c.txt", "d.PNG", "e.pdf", "f.json", "Makefile"] {
            assert!(!runs_when_opened(Path::new(f)), "{f}");
        }
    }

    #[test]
    fn goto_formats_position() {
        let f = Path::new("src/a.ts");
        assert_eq!(goto_arg(f, Some(4), Some(2)), "src/a.ts:4:2");
        assert_eq!(goto_arg(f, Some(4), None), "src/a.ts:4");
        assert_eq!(goto_arg(f, None, Some(2)), "src/a.ts");
        assert_eq!(goto_arg(f, Some(0), None), "src/a.ts");
    }

    #[test]
    fn resolves_relative_to_cwd() {
        let dir = std::env::temp_dir().join(format!("termo-editor-{}", std::process::id()));
        fs::create_dir_all(dir.join("src")).unwrap();
        fs::write(dir.join("src/a.ts"), "x").unwrap();
        let cwd = dir.to_string_lossy().into_owned();
        assert_eq!(resolve_file("src/a.ts", Some(&cwd)).unwrap(), dir.join("src/a.ts"));
        assert!(resolve_file("src/nao.ts", Some(&cwd)).is_err());
        assert!(resolve_file("src", Some(&cwd)).is_err(), "pasta não é arquivo");
        fs::remove_dir_all(dir).unwrap();
    }
}
