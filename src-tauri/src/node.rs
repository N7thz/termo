//! Node da aba: a versão do `node` que o shell resolve, se a pasta é um projeto Node e quais
//! versões o gerenciador (fnm, nvm-windows ou Volta) tem instaladas para trocar.
//!
//! O caminho do `node` vem do prompt (`OSC 633;P;Node=`, ver shell.rs), porque é o PATH do shell
//! que vale: o fnm, por exemplo, troca a versão por aba. A versão sai do próprio caminho quando dá
//! (as pastas dos gerenciadores têm o número) e, senão, de `node --version`, guardado por caminho.

use serde::Serialize;
use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::process::Command;
use std::sync::Mutex;

#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct NodeInfo {
    /// Sem o `v` (ex.: `24.14.0`); `None` sem node no PATH do shell.
    pub version: Option<String>,
    /// A pasta (ou uma acima dela) tem `package.json`.
    pub project: bool,
    /// Versão pedida pelo projeto em `.nvmrc` ou `.node-version` (como está escrita, sem o `v`).
    pub wanted: Option<String>,
    /// Scripts do `package.json` do projeto, na ordem do arquivo (como o "NPM Scripts" do VS Code).
    pub scripts: Vec<NpmScript>,
    /// Quem roda os scripts: `npm`, `pnpm`, `yarn` ou `bun` (campo `packageManager`, senão o lockfile).
    pub package_manager: Option<&'static str>,
}

#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct NpmScript {
    pub name: String,
    /// O comando do script, para mostrar ao lado do nome (cortado em `MAX_SCRIPT_COMMAND`).
    pub command: String,
}

/// Quantos scripts a lista mostra no máximo.
const MAX_SCRIPTS: usize = 100;
/// Tamanho máximo do comando mostrado (o script roda inteiro: quem executa é o gerenciador).
const MAX_SCRIPT_COMMAND: usize = 300;
/// `package.json` maior que isso não é lido (lido a cada prompt).
const MAX_PACKAGE_JSON: u64 = 1024 * 1024;

/// `scripts` do `package.json` na ordem em que aparecem (o `Map` do serde_json ordenaria pelo nome).
#[derive(Default)]
struct OrderedScripts(Vec<NpmScript>);

impl<'de> serde::Deserialize<'de> for OrderedScripts {
    fn deserialize<D: serde::Deserializer<'de>>(d: D) -> Result<Self, D::Error> {
        struct V;
        impl<'de> serde::de::Visitor<'de> for V {
            type Value = OrderedScripts;
            fn expecting(&self, f: &mut std::fmt::Formatter) -> std::fmt::Result {
                f.write_str("um objeto de scripts")
            }
            fn visit_map<A: serde::de::MapAccess<'de>>(self, mut map: A) -> Result<Self::Value, A::Error> {
                let mut out = Vec::new();
                while let Some((name, value)) = map.next_entry::<String, serde_json::Value>()? {
                    // Só texto vira script; o nome não pode estar vazio nem ter quebra de linha.
                    let Some(command) = value.as_str() else { continue };
                    if name.trim().is_empty() || name.contains(['\n', '\r']) || out.len() >= MAX_SCRIPTS {
                        continue;
                    }
                    let command: String = command.chars().take(MAX_SCRIPT_COMMAND).collect();
                    out.push(NpmScript { name, command });
                }
                Ok(OrderedScripts(out))
            }
        }
        d.deserialize_map(V)
    }
}

#[derive(serde::Deserialize, Default)]
#[serde(rename_all = "camelCase", default)]
struct PackageJson {
    scripts: Option<OrderedScripts>,
    package_manager: Option<String>,
}

fn read_package(root: &Path) -> PackageJson {
    let path = root.join("package.json");
    let small = std::fs::metadata(&path).is_ok_and(|m| m.len() <= MAX_PACKAGE_JSON);
    small
        .then(|| std::fs::read_to_string(&path).ok())
        .flatten()
        .and_then(|text| serde_json::from_str(text.trim_start_matches('\u{feff}')).ok())
        .unwrap_or_default()
}

/// Gerenciador do projeto: o campo `packageManager` (`pnpm@9.1.0`) manda; senão, o lockfile; senão, npm.
fn package_manager(root: &Path, field: Option<&str>) -> &'static str {
    const KNOWN: &[&str] = &["npm", "pnpm", "yarn", "bun"];
    if let Some(name) = field.and_then(|f| f.split('@').next()) {
        if let Some(pm) = KNOWN.iter().find(|k| **k == name.trim()) {
            return pm;
        }
    }
    const LOCKS: &[(&str, &str)] = &[
        ("bun.lock", "bun"),
        ("bun.lockb", "bun"),
        ("pnpm-lock.yaml", "pnpm"),
        ("yarn.lock", "yarn"),
        ("package-lock.json", "npm"),
    ];
    LOCKS
        .iter()
        .find(|(file, _)| root.join(file).is_file())
        .map_or("npm", |(_, pm)| pm)
}

#[derive(Debug, Clone, Copy, PartialEq, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum Manager {
    Fnm,
    Nvm,
    Volta,
}

#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct NodeVersions {
    /// `None`: nenhum gerenciador encontrado.
    pub manager: Option<Manager>,
    /// Instaladas, da mais nova para a mais antiga, sem o `v`.
    pub versions: Vec<String>,
}

/// `node --version` por caminho real do executável (o caminho real muda quando a versão muda).
#[derive(Default)]
pub struct VersionCache(Mutex<HashMap<PathBuf, Option<String>>>);

pub fn node_info(cache: &VersionCache, node: Option<&str>, cwd: Option<&str>) -> NodeInfo {
    let version = node
        .filter(|n| !n.is_empty())
        .and_then(|n| version_of(cache, Path::new(n)));
    let root = cwd.map(Path::new).and_then(project_root);
    let wanted = root.as_deref().and_then(wanted_version);
    let (scripts, package_manager) = match root.as_deref() {
        Some(r) => {
            let pkg = read_package(r);
            let pm = package_manager(r, pkg.package_manager.as_deref());
            (pkg.scripts.unwrap_or_default().0, Some(pm))
        }
        None => (Vec::new(), None),
    };
    NodeInfo {
        version,
        project: root.is_some(),
        wanted,
        scripts,
        package_manager,
    }
}

fn version_of(cache: &VersionCache, node: &Path) -> Option<String> {
    let real = std::fs::canonicalize(node).ok()?;
    if let Some(v) = version_in_path(&real) {
        return Some(v);
    }
    // Daqui em diante o arquivo é EXECUTADO. O caminho vem do `OSC 633;P;Node=`, que qualquer saída do
    // terminal pode falsificar (um `cat` com a sequência certa): só roda um `node` que está numa pasta do PATH.
    if !trusted_node(&real) {
        return None;
    }
    // O shim do Volta é sempre o mesmo arquivo e troca de versão por baixo: esse não vai para o cache.
    let shim = real
        .to_string_lossy()
        .to_ascii_lowercase()
        .contains("volta");
    if !shim {
        if let Some(hit) = cache.0.lock().ok()?.get(&real) {
            return hit.clone();
        }
    }
    let v = run(&real, &["--version"]).and_then(|out| parse_version(out.trim()));
    if !shim {
        if let Ok(mut map) = cache.0.lock() {
            map.insert(real, v.clone());
        }
    }
    v
}

/// Pode rodar `--version` neste arquivo? Só se ele se chama `node`/`node.exe` e está numa pasta do PATH
/// do Termo (instalação comum ou shim de gerenciador). As versões dos gerenciadores nem chegam aqui:
/// saem do nome da pasta, sem executar nada.
fn trusted_node(real: &Path) -> bool {
    let named_node = real
        .file_name()
        .and_then(|n| n.to_str())
        .is_some_and(|n| n.eq_ignore_ascii_case("node.exe") || n == "node");
    let Some(dir) = real.parent() else { return false };
    let Some(path) = std::env::var_os("PATH") else { return false };
    named_node && std::env::split_paths(&path).filter_map(|d| std::fs::canonicalize(d).ok()).any(|d| d == dir)
}

/// `20.11.0` a partir de `v20.11.0` (ou já sem o `v`); `None` se não for uma versão.
pub fn parse_version(s: &str) -> Option<String> {
    let s = s.strip_prefix('v').unwrap_or(s);
    let parts: Vec<&str> = s.split('.').collect();
    (parts.len() == 3
        && parts
            .iter()
            .all(|p| !p.is_empty() && p.bytes().all(|b| b.is_ascii_digit())))
    .then(|| s.to_string())
}

/// Os gerenciadores guardam cada versão numa pasta com o número (`.../node-versions/v20.11.0/installation/node.exe`).
fn version_in_path(path: &Path) -> Option<String> {
    path.ancestors()
        .skip(1)
        .filter_map(|p| p.file_name()?.to_str())
        .find_map(parse_version)
}

fn project_root(cwd: &Path) -> Option<PathBuf> {
    cwd.ancestors()
        .find(|d| d.join("package.json").is_file())
        .map(Path::to_path_buf)
}

fn wanted_version(root: &Path) -> Option<String> {
    [".nvmrc", ".node-version"].iter().find_map(|f| {
        let text = std::fs::read_to_string(root.join(f)).ok()?;
        let line = text
            .lines()
            .map(str::trim)
            .find(|l| !l.is_empty() && !l.starts_with('#'))?;
        Some(line.strip_prefix('v').unwrap_or(line).to_string())
    })
}

fn run(exe: &Path, args: &[&str]) -> Option<String> {
    let mut cmd = Command::new(exe);
    cmd.args(args);
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        cmd.creation_flags(0x0800_0000);
    }
    let out = cmd.output().ok()?;
    out.status
        .success()
        .then(|| String::from_utf8_lossy(&out.stdout).into_owned())
}

/// Lugares onde o executável do gerenciador costuma ficar, além do PATH do app (que pode estar
/// desatualizado: instalar pelo winget com o Termo aberto não muda o PATH do processo).
fn manager_exe(name: &str, extra: &[Option<PathBuf>]) -> Option<PathBuf> {
    which::which(name).ok().or_else(|| {
        extra
            .iter()
            .flatten()
            .map(|d| d.join(format!("{name}.exe")))
            .find(|p| p.is_file())
    })
}

fn env_dir(key: &str) -> Option<PathBuf> {
    std::env::var_os(key)
        .filter(|v| !v.is_empty())
        .map(PathBuf::from)
}

/// Pasta de versões do fnm: `FNM_DIR`, senão `%APPDATA%\fnm` (ou o antigo `~/.fnm`).
fn fnm_versions_dir() -> Option<PathBuf> {
    let candidates = [
        env_dir("FNM_DIR"),
        dirs::data_dir().map(|d| d.join("fnm")),
        dirs::home_dir().map(|d| d.join(".fnm")),
    ];
    candidates
        .into_iter()
        .flatten()
        .map(|d| d.join("node-versions"))
        .find(|d| d.is_dir())
}

/// Nomes de subpastas que são versões.
fn versions_in(dir: &Path) -> Vec<String> {
    let Ok(entries) = std::fs::read_dir(dir) else {
        return Vec::new();
    };
    entries
        .flatten()
        .filter_map(|e| parse_version(e.file_name().to_str()?))
        .collect()
}

/// Da mais nova para a mais antiga, comparando os números (e não o texto).
pub fn sort_desc(versions: &mut Vec<String>) {
    let key = |v: &String| {
        v.split('.')
            .map(|p| p.parse::<u64>().unwrap_or(0))
            .collect::<Vec<_>>()
    };
    versions.sort_by_key(|v| std::cmp::Reverse(key(v)));
    versions.dedup();
}

/// Gerenciador encontrado (nesta ordem: fnm, nvm-windows, Volta) e as versões que ele tem.
pub fn node_versions() -> NodeVersions {
    let local = dirs::data_local_dir();
    let winget = local.as_ref().map(|d| d.join(r"Microsoft\WinGet\Links"));
    let scoop = dirs::home_dir().map(|d| d.join(r"scoop\shims"));
    let cargo = dirs::home_dir().map(|d| d.join(r".cargo\bin"));

    let (manager, mut versions) =
        if manager_exe("fnm", &[winget.clone(), scoop.clone(), cargo]).is_some() {
            (
                Some(Manager::Fnm),
                fnm_versions_dir()
                    .map(|d| versions_in(&d))
                    .unwrap_or_default(),
            )
        } else if let Some(nvm) = manager_exe(
            "nvm",
            &[env_dir("NVM_HOME"), dirs::data_dir().map(|d| d.join("nvm"))],
        ) {
            let home = env_dir("NVM_HOME").or_else(|| nvm.parent().map(Path::to_path_buf));
            (
                Some(Manager::Nvm),
                home.map(|d| versions_in(&d)).unwrap_or_default(),
            )
        } else if manager_exe(
            "volta",
            &[
                local.as_ref().map(|d| d.join(r"Volta\bin")),
                env_dir("ProgramFiles").map(|d| d.join("Volta")),
            ],
        )
        .is_some()
        {
            let home = env_dir("VOLTA_HOME").or_else(|| local.map(|d| d.join("Volta")));
            (
                Some(Manager::Volta),
                home.map(|d| versions_in(&d.join(r"tools\image\node")))
                    .unwrap_or_default(),
            )
        } else {
            (None, Vec::new())
        };
    sort_desc(&mut versions);
    NodeVersions { manager, versions }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_versions() {
        assert_eq!(parse_version("v24.14.0").as_deref(), Some("24.14.0"));
        assert_eq!(parse_version("20.11.1").as_deref(), Some("20.11.1"));
        assert_eq!(parse_version("installation"), None);
        assert_eq!(parse_version("v20"), None);
        assert_eq!(parse_version("v20.1.x"), None);
    }

    #[test]
    fn version_from_manager_folder() {
        let p = Path::new(
            r"C:\Users\x\AppData\Roaming\fnm\node-versions\v20.11.0\installation\node.exe",
        );
        assert_eq!(version_in_path(p).as_deref(), Some("20.11.0"));
        assert_eq!(version_in_path(Path::new(r"D:\node\node.exe")), None);
    }

    #[test]
    fn only_runs_node_from_path() {
        // Um "node.exe" fora do PATH (ex.: dentro de um repositório baixado) nunca é executado.
        let dir = std::env::temp_dir().join(format!("termo-fake-node-{}", std::process::id()));
        std::fs::create_dir_all(&dir).unwrap();
        let fake = dir.join("node.exe");
        std::fs::write(&fake, b"nao executar").unwrap();
        let real = std::fs::canonicalize(&fake).unwrap();
        assert!(!trusted_node(&real));
        assert_eq!(node_info(&VersionCache::default(), fake.to_str(), None).version, None);
        // Outro nome nunca, mesmo no PATH.
        assert!(!trusted_node(&real.with_file_name("calc.exe")));
        std::fs::remove_dir_all(&dir).ok();
    }

    #[test]
    fn sorts_numerically() {
        let mut v = vec![
            "9.0.0".to_string(),
            "20.11.0".into(),
            "20.2.0".into(),
            "20.11.0".into(),
        ];
        sort_desc(&mut v);
        assert_eq!(v, ["20.11.0", "20.2.0", "9.0.0"]);
    }

    #[test]
    fn finds_project_and_wanted_version() {
        let root = std::env::temp_dir().join(format!("termo-node-{}", std::process::id()));
        let sub = root.join("src").join("deep");
        std::fs::create_dir_all(&sub).unwrap();
        std::fs::write(root.join("package.json"), "{}").unwrap();
        std::fs::write(root.join(".nvmrc"), "# comentário\nv20.11.0\n").unwrap();
        let info = node_info(&VersionCache::default(), None, sub.to_str());
        assert!(info.project);
        assert_eq!(info.wanted.as_deref(), Some("20.11.0"));
        assert_eq!(info.version, None);
        assert!(info.scripts.is_empty());
        assert_eq!(info.package_manager, Some("npm"));
        std::fs::remove_dir_all(&root).ok();
    }

    #[test]
    fn reads_scripts_in_file_order_and_package_manager() {
        let root = std::env::temp_dir().join(format!("termo-scripts-{}", std::process::id()));
        std::fs::create_dir_all(&root).unwrap();
        std::fs::write(
            root.join("package.json"),
            "\u{feff}{\"scripts\":{\"dev\":\"vite\",\"build\":\"vite build\",\"x\":1,\"\":\"vazio\",\"test:web\":\"bun test\"}}",
        )
        .unwrap();
        std::fs::write(root.join("pnpm-lock.yaml"), "").unwrap();
        let info = node_info(&VersionCache::default(), None, root.to_str());
        let names: Vec<&str> = info.scripts.iter().map(|s| s.name.as_str()).collect();
        assert_eq!(names, ["dev", "build", "test:web"]);
        assert_eq!(info.scripts[1].command, "vite build");
        assert_eq!(info.package_manager, Some("pnpm"));
        // O campo packageManager vence o lockfile.
        std::fs::write(root.join("package.json"), r#"{"packageManager":"bun@1.3.10"}"#).unwrap();
        assert_eq!(node_info(&VersionCache::default(), None, root.to_str()).package_manager, Some("bun"));
        // JSON quebrado: projeto sem scripts, sem erro.
        std::fs::write(root.join("package.json"), "{ quebrado").unwrap();
        assert!(node_info(&VersionCache::default(), None, root.to_str()).scripts.is_empty());
        std::fs::remove_dir_all(&root).ok();
    }
}
