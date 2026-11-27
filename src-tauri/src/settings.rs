//! Configurações em `<app config>/settings.json`, com validação e gravação atômica.

use std::collections::BTreeMap;
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::Mutex;

use serde::{Deserialize, Serialize};

pub const FONT_MIN: u16 = 9;
pub const FONT_MAX: u16 = 32;

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase", default)]
pub struct Settings {
    /// Abre a primeira aba já rodando o Claude Code.
    pub start_with_claude: bool,
    pub font_family: String,
    pub font_size: u16,
    /// Pasta inicial das abas novas. Vazio = pasta do usuário.
    pub default_cwd: String,
    /// Sugestões do PSReadLine (histórico) numa lista abaixo do cursor. Vale para abas novas.
    pub shell_predictions: bool,
    /// Id do tema (`system`, `termo-dark`, `dracula`...). O frontend cai no padrão se não conhecer.
    pub theme: String,
    /// Destaques na saída do terminal.
    pub highlights: HighlightSettings,
    /// Partes da janela: abas na lateral, barra de status e diff do git no topo.
    pub layout: LayoutSettings,
    /// Perfis (como no Dia): cada um com as suas abas, cor de moldura, pasta inicial e pastas fixadas.
    pub profiles: Vec<Profile>,
    /// Onde os links do terminal abrem: `panel` (painel ao lado) ou `browser` (navegador do sistema).
    pub link_target: String,
    /// Tamanho da interface: `small`, `medium` ou `large` (zoom do webview).
    pub interface_size: String,
    /// Reabre as abas, grupos e divisões de cada perfil ao abrir o app.
    pub restore_session: bool,
    /// Editor de entrada no estilo do Warp (experimental).
    pub input_editor: bool,
    /// Avisos do Windows: Claude esperando você e comandos longos que terminam com a janela sem foco.
    pub notifications: NotificationSettings,
    /// Comandos salvos com parâmetros `{{nome}}`, chamados pela paleta.
    pub workflows: Vec<Workflow>,
    /// Atalho global que mostra e esconde o Termo (`Alt+F12`, `Ctrl+Shift+Space`...). Vazio = desligado.
    pub global_hotkey: String,
    /// Procura atualização nas releases do GitHub ao abrir.
    pub auto_update: bool,
    /// Reabre as abas com o fim da saída que elas tinham (só com `restore_session`).
    pub restore_output: bool,
    /// Shell das abas novas: `auto` (pwsh, senão Windows PowerShell), `pwsh`, `powershell`, `cmd`,
    /// `wsl` (distribuição padrão) ou `wsl:<distro>`.
    pub default_shell: String,
    /// Ctrl+R abre a busca no histórico do Termo; desligado, o Ctrl+R vai para o shell (busca do PSReadLine).
    pub history_search: bool,
    /// Ícone na bandeja do Windows (área de notificação) e o que fechar/minimizar fazem.
    pub tray: TraySettings,
    /// Imagem de fundo (uma ou várias, em slideshow) atrás do terminal ou sobre a janela inteira.
    pub background: BackgroundSettings,
    /// Layouts salvos: conjuntos de abas, grupos e divisões, abertos com um clique.
    pub layouts: Vec<SavedLayout>,
    /// Na tela dividida, o painel sem o foco fica mais apagado.
    pub dim_inactive_pane: bool,
    /// Contraste mínimo entre texto e fundo no terminal (`minimumContrastRatio` do xterm):
    /// 1 = desligado; 3, 4.5 (WCAG AA) ou 7 (AAA) clareiam ou escurecem o texto até chegar lá.
    pub minimum_contrast: f64,
    /// Programas podem copiar para a área de transferência pelo OSC 52 (tmux, nvim, ssh). Ler nunca.
    pub osc_clipboard: bool,
    /// Programas podem mandar avisos pelo OSC 9 / OSC 777 (`printf '\e]9;pronto\a'`).
    pub osc_notifications: bool,
    /// Atalhos trocados pela pessoa: ação do app (`new-shell`, `palette`...) → combinação (`Ctrl+Alt+T`).
    /// Vazio desliga o atalho; a ação que não está aqui usa o padrão.
    pub keybindings: BTreeMap<String, String>,
    /// Cabeçalho fixo do comando: quando a saída passa da tela, o comando fica preso no topo.
    pub sticky_command: bool,
    /// Esquemas de cores importados de outros terminais (a interface é gerada a partir deles).
    pub custom_themes: Vec<CustomTheme>,
}

pub const MAX_CUSTOM_THEMES: usize = 50;

/// Esquema importado, no formato do Windows Terminal (o mesmo `TerminalScheme` do frontend).
#[derive(Clone, Debug, Serialize, Deserialize, PartialEq, Default)]
#[serde(rename_all = "camelCase", default)]
pub struct CustomTheme {
    /// `custom-...`, letras minúsculas, números e hífen.
    pub id: String,
    pub name: String,
    pub author: String,
    pub source: String,
    pub background: String,
    pub foreground: String,
    pub cursor: String,
    pub selection: Option<String>,
    pub black: String,
    pub red: String,
    pub green: String,
    pub yellow: String,
    pub blue: String,
    pub magenta: String,
    pub cyan: String,
    pub white: String,
    pub bright_black: String,
    pub bright_red: String,
    pub bright_green: String,
    pub bright_yellow: String,
    pub bright_blue: String,
    pub bright_magenta: String,
    pub bright_cyan: String,
    pub bright_white: String,
}

impl CustomTheme {
    fn colors_mut(&mut self) -> [&mut String; 19] {
        [
            &mut self.background,
            &mut self.foreground,
            &mut self.cursor,
            &mut self.black,
            &mut self.red,
            &mut self.green,
            &mut self.yellow,
            &mut self.blue,
            &mut self.magenta,
            &mut self.cyan,
            &mut self.white,
            &mut self.bright_black,
            &mut self.bright_red,
            &mut self.bright_green,
            &mut self.bright_yellow,
            &mut self.bright_blue,
            &mut self.bright_magenta,
            &mut self.bright_cyan,
            &mut self.bright_white,
        ]
    }
}

/// Até 50 temas com id `custom-...` único, nome de 1 a 60 caracteres e todas as cores `#rrggbb`.
fn sanitize_custom_themes(list: Vec<CustomTheme>) -> Vec<CustomTheme> {
    let mut out: Vec<CustomTheme> = Vec::new();
    for mut t in list {
        t.name = t.name.trim().chars().take(60).collect();
        t.author = t.author.trim().chars().take(80).collect();
        t.source = t.source.trim().chars().take(80).collect();
        let mut colors_ok = true;
        for c in t.colors_mut() {
            *c = c.trim().to_ascii_lowercase();
            colors_ok &= is_hex_color(c);
        }
        t.selection = t.selection.map(|s| s.trim().to_ascii_lowercase()).filter(|s| is_hex_color(s));
        if !colors_ok
            || t.name.is_empty()
            || !t.id.starts_with("custom-")
            || !is_valid_theme_id(&t.id)
            || out.iter().any(|o| o.id == t.id)
        {
            continue;
        }
        out.push(t);
        if out.len() == MAX_CUSTOM_THEMES {
            break;
        }
    }
    out
}

pub const MAX_KEYBINDINGS: usize = 100;

/// Ações com id válido (letras minúsculas, números e hífen) e combinações no formato do atalho global.
fn sanitize_keybindings(map: BTreeMap<String, String>) -> BTreeMap<String, String> {
    map.into_iter()
        .map(|(k, v)| (k, v.trim().to_string()))
        .filter(|(k, v)| is_valid_theme_id(k) && is_valid_hotkey(v))
        .take(MAX_KEYBINDINGS)
        .collect()
}

pub const CONTRAST_LEVELS: &[f64] = &[1.0, 3.0, 4.5, 7.0];

pub const MAX_LAYOUTS: usize = 20;
pub const MAX_LAYOUT_TABS: usize = 16;
pub const MAX_LAYOUT_COMMAND: usize = 500;

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq, Default)]
#[serde(rename_all = "camelCase", default)]
pub struct SavedLayout {
    /// 1 a 60 caracteres; único na lista (sem diferenciar maiúsculas).
    pub name: String,
    pub tabs: Vec<LayoutTab>,
    /// Nomes dos grupos; `LayoutTab.group` é o índice aqui.
    pub groups: Vec<String>,
    /// Pares de tela dividida, por índice em `tabs`.
    pub splits: Vec<LayoutSplit>,
}

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase", default)]
pub struct LayoutTab {
    /// `shell` ou `claude`.
    pub kind: String,
    pub title: String,
    /// Perfil de shell (`pwsh`, `cmd`, `wsl:Ubuntu`, `ssh:host`...); vazio = o padrão.
    pub shell: String,
    pub cwd: String,
    /// Índice em `SavedLayout.groups`.
    pub group: Option<usize>,
    /// Comando que roda ao abrir (uma linha; só em abas de shell).
    pub command: String,
}

impl Default for LayoutTab {
    fn default() -> Self {
        Self { kind: "shell".into(), title: String::new(), shell: String::new(), cwd: String::new(), group: None, command: String::new() }
    }
}

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase", default)]
pub struct LayoutSplit {
    /// Painel que é dividido (índice em `tabs`).
    pub left: usize,
    /// Aba que entra depois dele.
    pub right: usize,
    pub ratio: f64,
    /// `row` (ao lado, o padrão dos layouts antigos) ou `col` (embaixo).
    pub dir: String,
}

impl Default for LayoutSplit {
    fn default() -> Self {
        Self { left: 0, right: 0, ratio: 0.5, dir: "row".into() }
    }
}

/// Perfil de shell de uma aba salva: um perfil concreto (sem `auto`) ou `ssh:<host>` com host válido.
fn is_valid_tab_shell(s: &str) -> bool {
    (is_valid_shell(s) && s != "auto") || s.strip_prefix("ssh:").is_some_and(crate::ssh::is_valid_host)
}

/// Layouts válidos: nomes únicos, até 20 layouts de até 16 abas, comandos de uma linha com até 500
/// caracteres só em abas de shell, grupos e divisões que apontam para abas que existem.
fn sanitize_layouts(list: Vec<SavedLayout>) -> Vec<SavedLayout> {
    let mut out: Vec<SavedLayout> = Vec::new();
    for l in list {
        let name = l.name.trim().to_string();
        if name.is_empty()
            || name.chars().count() > 60
            || l.tabs.is_empty()
            || out.iter().any(|o| o.name.to_lowercase() == name.to_lowercase())
        {
            continue;
        }
        let groups: Vec<String> = l
            .groups
            .into_iter()
            .map(|g| g.trim().chars().take(40).collect::<String>())
            .map(|g| if g.is_empty() { "Grupo".to_string() } else { g })
            .take(MAX_LAYOUT_TABS)
            .collect();
        let tabs: Vec<LayoutTab> = l
            .tabs
            .into_iter()
            .take(MAX_LAYOUT_TABS)
            .map(|t| {
                let kind = if t.kind == "claude" { "claude" } else { "shell" };
                let command = t.command.trim().to_string();
                let command_ok = kind == "shell"
                    && command.chars().count() <= MAX_LAYOUT_COMMAND
                    && !command.chars().any(|c| c.is_control());
                let shell = t.shell.trim();
                let cwd = t.cwd.trim();
                LayoutTab {
                    kind: kind.into(),
                    title: t.title.trim().chars().take(200).collect(),
                    shell: if kind == "shell" && is_valid_tab_shell(shell) { shell.to_string() } else { String::new() },
                    cwd: if cwd.len() <= 1000 && !cwd.contains('\0') { cwd.to_string() } else { String::new() },
                    group: t.group.filter(|g| *g < groups.len()),
                    // Aba SSH não tem o prompt integrado que dispara o comando inicial.
                    command: if command_ok && !shell.starts_with("ssh:") { command } else { String::new() },
                }
            })
            .collect();
        // Divisões em ordem formam a árvore da tela dividida: `left` pode já ter aparecido (dividir de novo
        // um painel), `right` é sempre uma aba que ainda não está em nenhuma.
        let mut used: Vec<usize> = Vec::new();
        let splits = l
            .splits
            .into_iter()
            .filter(|p| {
                let ok = p.left != p.right && p.left < tabs.len() && p.right < tabs.len() && !used.contains(&p.right);
                if ok {
                    used.push(p.left);
                    used.push(p.right);
                }
                ok
            })
            .map(|p| LayoutSplit {
                ratio: if p.ratio.is_finite() { p.ratio.clamp(0.1, 0.9) } else { 0.5 },
                dir: if p.dir == "col" { "col".into() } else { "row".into() },
                ..p
            })
            .collect();
        out.push(SavedLayout { name, tabs, groups, splits });
        if out.len() == MAX_LAYOUTS {
            break;
        }
    }
    out
}

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase", default)]
pub struct BackgroundSettings {
    pub enabled: bool,
    /// Caminhos absolutos das imagens (até `MAX_BACKGROUNDS`).
    pub images: Vec<String>,
    /// `terminal` (atrás do texto do terminal) ou `window` (sobre a janela inteira, sem pegar cliques).
    pub target: String,
    /// Opacidade da imagem, em %: `BG_OPACITY_MIN` a 100.
    pub opacity: u8,
    /// Desfoque em px: 0 a `BG_BLUR_MAX`.
    pub blur: u8,
    /// `cover`, `contain`, `center` (tamanho original) ou `tile` (repetida).
    pub fit: String,
    /// Troca a imagem a cada N segundos; 0 = não troca. Fora do 0: `BG_CHANGE_MIN` a `BG_CHANGE_MAX`.
    pub change_secs: u32,
    /// Ordem aleatória no slideshow.
    pub shuffle: bool,
    /// Brilho suave nas bordas da janela (na moldura, em volta do terminal), nas cores do tema.
    pub glow: bool,
    /// Intensidade do brilho, em %: `GLOW_MIN` a 100.
    pub glow_strength: u8,
}

impl Default for BackgroundSettings {
    fn default() -> Self {
        Self {
            enabled: false,
            images: Vec::new(),
            target: "terminal".into(),
            opacity: 20,
            blur: 0,
            fit: "cover".into(),
            change_secs: 0,
            shuffle: false,
            glow: true,
            glow_strength: 50,
        }
    }
}

pub const MAX_BACKGROUNDS: usize = 50;
pub const BG_OPACITY_MIN: u8 = 5;
pub const GLOW_MIN: u8 = 10;
pub const BG_BLUR_MAX: u8 = 40;
pub const BG_CHANGE_MIN: u32 = 5;
pub const BG_CHANGE_MAX: u32 = 86_400;
const BG_TARGETS: &[&str] = &["terminal", "window"];
const BG_FITS: &[&str] = &["cover", "contain", "center", "tile"];

/// Limita cada campo à faixa aceita; arquivo editado à mão ou patch fora da faixa volta ao válido.
fn sanitize_background(mut b: BackgroundSettings) -> BackgroundSettings {
    let mut images: Vec<String> = Vec::new();
    for raw in b.images {
        let p = raw.trim().to_string();
        if p.is_empty() || p.len() > 1024 || p.contains('\0') || images.contains(&p) {
            continue;
        }
        images.push(p);
        if images.len() >= MAX_BACKGROUNDS {
            break;
        }
    }
    b.images = images;
    if !BG_TARGETS.contains(&b.target.as_str()) {
        b.target = "terminal".into();
    }
    if !BG_FITS.contains(&b.fit.as_str()) {
        b.fit = "cover".into();
    }
    b.opacity = b.opacity.clamp(BG_OPACITY_MIN, 100);
    b.glow_strength = b.glow_strength.clamp(GLOW_MIN, 100);
    b.blur = b.blur.min(BG_BLUR_MAX);
    if b.change_secs != 0 {
        b.change_secs = b.change_secs.clamp(BG_CHANGE_MIN, BG_CHANGE_MAX);
    }
    b
}

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase", default)]
pub struct TraySettings {
    /// Mostra o ícone na bandeja, com o menu (mostrar, nova aba, Claude Code, nova janela, sair).
    pub enabled: bool,
    /// Fechar a janela principal só a esconde; as abas continuam rodando. Sair pelo menu da bandeja.
    pub close_to_tray: bool,
    /// Minimizar a janela principal a esconde na bandeja (some da barra de tarefas).
    pub minimize_to_tray: bool,
    /// Abre o Termo junto com o Windows.
    pub launch_at_login: bool,
    /// Aberto junto com o Windows, fica só na bandeja (sem janela) até ser chamado.
    pub start_hidden: bool,
    /// Modo leve em segundo plano: minimizado ou na bandeja, o WebView2 vai para o modo de pouca memória
    /// e a memória ociosa do Termo e das abas volta ao Windows (memory.rs). Ligado por padrão.
    #[serde(default = "yes")]
    pub light_background: bool,
}

fn yes() -> bool {
    true
}

impl Default for TraySettings {
    fn default() -> Self {
        Self {
            enabled: false,
            close_to_tray: false,
            minimize_to_tray: false,
            launch_at_login: false,
            start_hidden: false,
            light_background: true,
        }
    }
}

impl TraySettings {
    /// Esconder na bandeja só vale com o ícone ligado: sem ele, a janela sumiria sem volta.
    pub fn hides_on_close(&self) -> bool {
        self.enabled && self.close_to_tray
    }
    pub fn hides_on_minimize(&self) -> bool {
        self.enabled && self.minimize_to_tray
    }
    pub fn starts_hidden(&self) -> bool {
        self.enabled && self.start_hidden
    }
}

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase", default)]
pub struct NotificationSettings {
    pub enabled: bool,
    /// Aba do Claude esperando você ou bloqueada (pedido de permissão).
    pub claude: bool,
    /// Comando que terminou depois de `command_secs` segundos com a janela sem foco.
    pub commands: bool,
    pub command_secs: u32,
}

impl Default for NotificationSettings {
    fn default() -> Self {
        Self { enabled: true, claude: true, commands: true, command_secs: 30 }
    }
}

pub const COMMAND_SECS_MIN: u32 = 5;
pub const COMMAND_SECS_MAX: u32 = 3600;

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq, Default)]
#[serde(rename_all = "camelCase", default)]
pub struct Workflow {
    /// 1 a 60 caracteres.
    pub name: String,
    /// 1 a 2000 caracteres; `{{param}}` vira um campo para preencher antes de rodar.
    pub command: String,
    /// Até 200 caracteres.
    pub description: String,
}

pub const MAX_WORKFLOWS: usize = 50;

fn sanitize_workflows(list: Vec<Workflow>) -> Vec<Workflow> {
    list.into_iter()
        .map(|w| Workflow {
            name: w.name.trim().to_string(),
            command: w.command.trim().to_string(),
            description: w.description.trim().to_string(),
        })
        .filter(|w| {
            let n = w.name.chars().count();
            (1..=60).contains(&n)
                && !w.command.is_empty()
                && w.command.chars().count() <= 2000
                && w.description.chars().count() <= 200
        })
        .take(MAX_WORKFLOWS)
        .collect()
}

/// Atalho no formato do tauri-plugin-global-shortcut (`Ctrl+Alt+T`); vazio desliga. Aqui só se confere
/// o formato; a combinação em si é validada ao registrar.
pub fn is_valid_hotkey(h: &str) -> bool {
    h.is_empty()
        || (h.len() <= 40
            && h.split('+').all(|p| !p.is_empty())
            && h.chars().all(|c| c.is_ascii_alphanumeric() || "+`-=[];',./\\".contains(c)))
}

/// `auto`, `pwsh`, `powershell`, `cmd`, `bash` (Git Bash), `wsl` ou `wsl:<distro>` (letras, números, `.`, `_`, `-`).
pub fn is_valid_shell(s: &str) -> bool {
    match s {
        "auto" | "pwsh" | "powershell" | "cmd" | "bash" | "wsl" => true,
        _ => s.strip_prefix("wsl:").is_some_and(|d| {
            (1..=64).contains(&d.len()) && d.chars().all(|c| c.is_ascii_alphanumeric() || "._-".contains(c))
        }),
    }
}

const INTERFACE_SIZES: [&str; 3] = ["small", "medium", "large"];

pub const MAX_PROFILES: usize = 9;
pub const MAX_PINNED: usize = 12;

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase", default)]
pub struct Profile {
    /// Letras minúsculas, números e hífen, até 40 caracteres; único na lista.
    pub id: String,
    pub name: String,
    /// Tom do tema (`green`, `accent`...) que tinge a moldura; a cor real vem do tema ativo.
    pub color: String,
    /// Pasta inicial das abas deste perfil. Vazio = a pasta inicial geral.
    pub cwd: String,
    /// Pastas fixadas na lateral.
    pub pinned: Vec<String>,
}

impl Default for Profile {
    fn default() -> Self {
        Self {
            id: String::new(),
            name: String::new(),
            color: "accent".into(),
            cwd: String::new(),
            pinned: Vec::new(),
        }
    }
}

fn default_profiles() -> Vec<Profile> {
    vec![
        Profile {
            id: "trabalho".into(),
            name: "Trabalho".into(),
            color: "green".into(),
            ..Default::default()
        },
        Profile {
            id: "pessoal".into(),
            name: "Pessoal".into(),
            color: "yellow".into(),
            ..Default::default()
        },
    ]
}

/// Tons do tema aceitos como cor de perfil (mesma lista de PROFILE_COLORS no front).
pub const PROFILE_TONES: [&str; 8] = [
    "green", "yellow", "accent", "magenta", "cyan", "red", "blue", "claude",
];

fn is_hex_color(c: &str) -> bool {
    c.len() == 7 && c.starts_with('#') && c[1..].chars().all(|c| c.is_ascii_hexdigit())
}

/// Até 9 perfis válidos e de id único; nome com 1 a 30 caracteres; lista vazia volta aos padrões.
fn sanitize_profiles(list: Vec<Profile>) -> Vec<Profile> {
    let mut out: Vec<Profile> = Vec::new();
    for p in list {
        let name = p.name.trim().to_string();
        // Cor fixa (`#rrggbb`, de uma versão anterior) vira tom do tema, para seguir o tema escolhido.
        let color = match p.color.trim().to_ascii_lowercase() {
            c if c == "#4fb38a" => "green".to_string(),
            c if c == "#d39a5c" => "yellow".to_string(),
            c if is_hex_color(&c) => "accent".to_string(),
            c => c,
        };
        if !is_valid_theme_id(&p.id)
            || out.iter().any(|o| o.id == p.id)
            || name.is_empty()
            || name.chars().count() > 30
            || !PROFILE_TONES.contains(&color.as_str())
        {
            continue;
        }
        let cwd = p.cwd.trim();
        let pinned = p
            .pinned
            .into_iter()
            .map(|d| d.trim().to_string())
            .filter(|d| !d.is_empty() && d.len() <= 1000)
            .take(MAX_PINNED)
            .collect();
        out.push(Profile {
            id: p.id,
            name,
            color,
            cwd: if cwd.len() <= 1000 {
                cwd.to_string()
            } else {
                String::new()
            },
            pinned,
        });
        if out.len() == MAX_PROFILES {
            break;
        }
    }
    if out.is_empty() {
        default_profiles()
    } else {
        out
    }
}

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase", default)]
pub struct LayoutSettings {
    pub sidebar: bool,
    /// Lateral minimizada: uma faixa estreita só com os ícones das abas.
    pub sidebar_collapsed: bool,
    pub status_bar: bool,
    pub diff_badge: bool,
}

impl Default for LayoutSettings {
    fn default() -> Self {
        Self {
            sidebar: true,
            sidebar_collapsed: false,
            status_bar: true,
            diff_badge: true,
        }
    }
}

pub const MAX_RULES: usize = 20;
pub const MAX_PATTERN: usize = 200;

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase", default)]
pub struct HighlightSettings {
    /// Caminhos `arquivo:linha:coluna` clicáveis (abrem no VS Code).
    pub file_links: bool,
    /// Marca linhas de erro/aviso e conta nas abas em segundo plano.
    pub severity: bool,
    /// Hashes do git clicáveis (copiam).
    pub git_hashes: bool,
    /// `localhost:porta` e IPs clicáveis.
    pub network: bool,
    /// Níveis de log (INFO, WARN, DEBUG...).
    pub log_levels: bool,
    /// Linhas de diff (+/-).
    pub diffs: bool,
    /// Datas e horários.
    pub timestamps: bool,
    /// UUIDs.
    pub uuids: bool,
    /// Regras próprias: regex + cor.
    pub rules: Vec<HighlightRule>,
}

impl Default for HighlightSettings {
    fn default() -> Self {
        Self {
            file_links: true,
            severity: true,
            git_hashes: true,
            network: true,
            log_levels: true,
            diffs: true,
            timestamps: true,
            uuids: true,
            rules: vec![HighlightRule {
                pattern: r"\b(TODO|FIXME|HACK)\b".into(),
                color: "#e0af68".into(),
                ..Default::default()
            }],
        }
    }
}

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq, Default)]
pub struct HighlightRule {
    pub pattern: String,
    pub color: String,
    /// Gatilho: a linha que casa vira aviso (central e, com a janela sem foco, Windows).
    #[serde(default)]
    pub notify: bool,
    /// Gatilho: a linha que casa marca a aba escondida até ela ser aberta.
    #[serde(default)]
    pub mark: bool,
}

impl HighlightSettings {
    /// Mantém só regras com padrão não vazio (até 200 caracteres) e cor `#rrggbb`, no máximo 20.
    fn sanitized(mut self) -> Self {
        self.rules = self
            .rules
            .into_iter()
            .map(|r| HighlightRule {
                pattern: r.pattern.trim().to_string(),
                color: r.color.trim().to_ascii_lowercase(),
                notify: r.notify,
                mark: r.mark,
            })
            .filter(|r| {
                !r.pattern.is_empty() && r.pattern.len() <= MAX_PATTERN && is_hex_color(&r.color)
            })
            .take(MAX_RULES)
            .collect();
        self
    }
}

impl Default for Settings {
    fn default() -> Self {
        Self {
            start_with_claude: false,
            font_family: "'JetBrains Mono', 'Cascadia Code', 'Fira Code', Consolas, monospace"
                .into(),
            font_size: 14,
            default_cwd: String::new(),
            shell_predictions: true,
            theme: "system".into(),
            highlights: HighlightSettings::default(),
            layout: LayoutSettings::default(),
            profiles: default_profiles(),
            link_target: "panel".into(),
            interface_size: "medium".into(),
            restore_session: true,
            input_editor: false,
            notifications: NotificationSettings::default(),
            workflows: Vec::new(),
            global_hotkey: String::new(),
            auto_update: true,
            restore_output: true,
            default_shell: "auto".into(),
            history_search: true,
            tray: TraySettings::default(),
            background: BackgroundSettings::default(),
            layouts: Vec::new(),
            dim_inactive_pane: true,
            minimum_contrast: 1.0,
            osc_clipboard: true,
            osc_notifications: true,
            keybindings: BTreeMap::new(),
            sticky_command: true,
            custom_themes: Vec::new(),
        }
    }
}

#[derive(Debug, Default, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SettingsPatch {
    pub start_with_claude: Option<bool>,
    pub font_family: Option<String>,
    pub font_size: Option<u16>,
    pub default_cwd: Option<String>,
    pub shell_predictions: Option<bool>,
    pub theme: Option<String>,
    /// Substitui todos os destaques de uma vez (já validados no apply).
    pub highlights: Option<HighlightSettings>,
    pub layout: Option<LayoutSettings>,
    /// Substitui a lista inteira de perfis (validada no apply).
    pub profiles: Option<Vec<Profile>>,
    pub link_target: Option<String>,
    pub interface_size: Option<String>,
    pub restore_session: Option<bool>,
    pub input_editor: Option<bool>,
    pub notifications: Option<NotificationSettings>,
    /// Substitui a lista inteira de workflows (validada no apply).
    pub workflows: Option<Vec<Workflow>>,
    pub global_hotkey: Option<String>,
    pub auto_update: Option<bool>,
    pub restore_output: Option<bool>,
    pub default_shell: Option<String>,
    pub history_search: Option<bool>,
    pub tray: Option<TraySettings>,
    /// Substitui a configuração inteira do fundo (validada no apply).
    pub background: Option<BackgroundSettings>,
    /// Substitui a lista inteira de layouts (validada no apply).
    pub layouts: Option<Vec<SavedLayout>>,
    pub dim_inactive_pane: Option<bool>,
    pub minimum_contrast: Option<f64>,
    pub osc_clipboard: Option<bool>,
    pub osc_notifications: Option<bool>,
    /// Substitui todos os atalhos trocados de uma vez (validados no apply).
    pub keybindings: Option<BTreeMap<String, String>>,
    pub sticky_command: Option<bool>,
    /// Substitui a lista inteira de temas importados (validada no apply).
    pub custom_themes: Option<Vec<CustomTheme>>,
}

fn is_contrast_level(v: f64) -> bool {
    CONTRAST_LEVELS.iter().any(|l| (l - v).abs() < 1e-9)
}

/// Ids de tema: letras minúsculas, números e hífen, até 40 caracteres.
fn is_valid_theme_id(id: &str) -> bool {
    !id.is_empty()
        && id.len() <= 40
        && id
            .chars()
            .all(|c| c.is_ascii_lowercase() || c.is_ascii_digit() || c == '-')
}

impl Settings {
    /// Aplica o patch já validado: fonte limitada, textos aparados.
    pub fn apply(&mut self, patch: SettingsPatch) {
        if let Some(v) = patch.start_with_claude {
            self.start_with_claude = v;
        }
        if let Some(v) = patch.font_family {
            let v = v.trim();
            if !v.is_empty() && v.len() <= 300 {
                self.font_family = v.to_string();
            }
        }
        if let Some(v) = patch.font_size {
            self.font_size = v.clamp(FONT_MIN, FONT_MAX);
        }
        if let Some(v) = patch.default_cwd {
            self.default_cwd = v.trim().to_string();
        }
        if let Some(v) = patch.shell_predictions {
            self.shell_predictions = v;
        }
        if let Some(v) = patch.theme {
            if is_valid_theme_id(&v) {
                self.theme = v;
            }
        }
        if let Some(v) = patch.highlights {
            self.highlights = v.sanitized();
        }
        if let Some(v) = patch.layout {
            self.layout = v;
        }
        if let Some(v) = patch.profiles {
            self.profiles = sanitize_profiles(v);
        }
        if let Some(v) = patch.interface_size {
            if INTERFACE_SIZES.contains(&v.as_str()) {
                self.interface_size = v;
            }
        }
        if let Some(v) = patch.link_target {
            if v == "panel" || v == "browser" {
                self.link_target = v;
            }
        }
        if let Some(v) = patch.restore_session {
            self.restore_session = v;
        }
        if let Some(v) = patch.input_editor {
            self.input_editor = v;
        }
        if let Some(mut v) = patch.notifications {
            v.command_secs = v.command_secs.clamp(COMMAND_SECS_MIN, COMMAND_SECS_MAX);
            self.notifications = v;
        }
        if let Some(v) = patch.workflows {
            self.workflows = sanitize_workflows(v);
        }
        if let Some(v) = patch.global_hotkey {
            let v = v.trim();
            if is_valid_hotkey(v) {
                self.global_hotkey = v.to_string();
            }
        }
        if let Some(v) = patch.auto_update {
            self.auto_update = v;
        }
        if let Some(v) = patch.restore_output {
            self.restore_output = v;
        }
        if let Some(v) = patch.history_search {
            self.history_search = v;
        }
        if let Some(v) = patch.tray {
            self.tray = v;
        }
        if let Some(v) = patch.background {
            self.background = sanitize_background(v);
        }
        if let Some(v) = patch.layouts {
            self.layouts = sanitize_layouts(v);
        }
        if let Some(v) = patch.default_shell {
            if is_valid_shell(v.trim()) {
                self.default_shell = v.trim().to_string();
            }
        }
        if let Some(v) = patch.dim_inactive_pane {
            self.dim_inactive_pane = v;
        }
        if let Some(v) = patch.minimum_contrast {
            if is_contrast_level(v) {
                self.minimum_contrast = v;
            }
        }
        if let Some(v) = patch.osc_clipboard {
            self.osc_clipboard = v;
        }
        if let Some(v) = patch.custom_themes {
            self.custom_themes = sanitize_custom_themes(v);
        }
        if let Some(v) = patch.sticky_command {
            self.sticky_command = v;
        }
        if let Some(v) = patch.keybindings {
            self.keybindings = sanitize_keybindings(v);
        }
        if let Some(v) = patch.osc_notifications {
            self.osc_notifications = v;
        }
    }
}

pub struct SettingsStore {
    path: PathBuf,
    current: Mutex<Settings>,
}

impl SettingsStore {
    pub fn load(dir: &Path) -> Self {
        let path = dir.join("settings.json");
        let current = fs::read_to_string(&path)
            .ok()
            .and_then(|text| parse_or_salvage(&path, &text))
            .map(|mut s| {
                // Arquivo editado à mão pode trazer valores fora da faixa.
                s.font_size = s.font_size.clamp(FONT_MIN, FONT_MAX);
                s.profiles = sanitize_profiles(std::mem::take(&mut s.profiles));
                if s.link_target != "panel" && s.link_target != "browser" {
                    s.link_target = "panel".into();
                }
                if !INTERFACE_SIZES.contains(&s.interface_size.as_str()) {
                    s.interface_size = "medium".into();
                }
                s.notifications.command_secs =
                    s.notifications.command_secs.clamp(COMMAND_SECS_MIN, COMMAND_SECS_MAX);
                s.workflows = sanitize_workflows(std::mem::take(&mut s.workflows));
                if !is_valid_hotkey(&s.global_hotkey) {
                    s.global_hotkey.clear();
                }
                if !is_valid_shell(&s.default_shell) {
                    s.default_shell = "auto".into();
                }
                s.background = sanitize_background(std::mem::take(&mut s.background));
                s.layouts = sanitize_layouts(std::mem::take(&mut s.layouts));
                s.keybindings = sanitize_keybindings(std::mem::take(&mut s.keybindings));
                s.custom_themes = sanitize_custom_themes(std::mem::take(&mut s.custom_themes));
                if !is_contrast_level(s.minimum_contrast) {
                    s.minimum_contrast = 1.0;
                }
                s
            })
            .unwrap_or_default();
        Self {
            path,
            current: Mutex::new(current),
        }
    }

    pub fn get(&self) -> Settings {
        self.current.lock().unwrap().clone()
    }

    pub fn update(&self, patch: SettingsPatch) -> Result<Settings, String> {
        let mut cur = self.current.lock().unwrap();
        let mut next = cur.clone();
        next.apply(patch);
        if next != *cur {
            write_atomic(
                &self.path,
                &serde_json::to_string_pretty(&next).map_err(|e| e.to_string())?,
            )
            .map_err(|e| format!("não foi possível salvar as configurações: {e}"))?;
            *cur = next;
        }
        Ok(cur.clone())
    }
}

/// Lê o `settings.json`. Se um campo não fecha com o tipo esperado (arquivo editado à mão, versão mais nova
/// do Termo, tipo que mudou), não troca tudo pelos padrões: guarda uma cópia do arquivo
/// (`settings.json.bad-<segundos>`) e aproveita cada campo que ainda vale, campo a campo. Sem isso, o
/// primeiro salvamento gravaria os padrões por cima e levaria perfis, workflows, layouts e temas.
fn parse_or_salvage(path: &Path, text: &str) -> Option<Settings> {
    let err = match serde_json::from_str::<Settings>(text) {
        Ok(s) => return Some(s),
        Err(e) => e,
    };
    let backup = path.with_extension(format!("json.bad-{}", unix_secs()));
    let saved = fs::copy(path, &backup).is_ok();
    log::warn!(
        "settings.json inválido ({err}); {} e os campos válidos foram aproveitados",
        if saved { format!("cópia em {}", backup.display()) } else { "a cópia falhou".into() }
    );
    salvage(text)
}

/// Campo a campo: começa dos padrões e põe cada campo do arquivo que, sozinho, ainda deixa o todo válido.
fn salvage(text: &str) -> Option<Settings> {
    let serde_json::Value::Object(file) = serde_json::from_str::<serde_json::Value>(text).ok()? else {
        return None;
    };
    let mut merged = serde_json::to_value(Settings::default()).ok()?;
    for (key, value) in file {
        let serde_json::Value::Object(obj) = &mut merged else { return None };
        let previous = obj.insert(key.clone(), value);
        if serde_json::from_value::<Settings>(merged.clone()).is_err() {
            let serde_json::Value::Object(obj) = &mut merged else { return None };
            match previous {
                Some(p) => obj.insert(key, p),
                None => obj.remove(&key),
            };
        }
    }
    serde_json::from_value(merged).ok()
}

fn unix_secs() -> u64 {
    std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).map(|d| d.as_secs()).unwrap_or(0)
}

/// Grava num `.tmp` e renomeia: uma queda no meio não corrompe o arquivo.
fn write_atomic(path: &Path, contents: &str) -> std::io::Result<()> {
    if let Some(dir) = path.parent() {
        fs::create_dir_all(dir)?;
    }
    let tmp = path.with_extension("json.tmp");
    fs::write(&tmp, contents)?;
    fs::rename(&tmp, path)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn clamps_font_size() {
        let mut s = Settings::default();
        s.apply(SettingsPatch {
            font_size: Some(1),
            ..Default::default()
        });
        assert_eq!(s.font_size, FONT_MIN);
        s.apply(SettingsPatch {
            font_size: Some(500),
            ..Default::default()
        });
        assert_eq!(s.font_size, FONT_MAX);
    }

    #[test]
    fn sanitizes_background() {
        let mut s = Settings::default();
        s.apply(SettingsPatch {
            background: Some(BackgroundSettings {
                enabled: true,
                images: vec![" C:/a.png ".into(), "C:/a.png".into(), "".into(), "D:/b.jpg".into()],
                target: "sidebar".into(),
                opacity: 0,
                blur: 200,
                fit: "stretch".into(),
                change_secs: 1,
                shuffle: true,
                glow: true,
                glow_strength: 0,
            }),
            ..Default::default()
        });
        let b = &s.background;
        assert_eq!(b.images, vec!["C:/a.png".to_string(), "D:/b.jpg".to_string()]);
        assert_eq!((b.target.as_str(), b.fit.as_str()), ("terminal", "cover"));
        assert_eq!((b.opacity, b.blur, b.change_secs), (BG_OPACITY_MIN, BG_BLUR_MAX, BG_CHANGE_MIN));
        assert_eq!(b.glow_strength, GLOW_MIN);
        // Arquivo antigo, sem o campo: desligado.
        let old: Settings = serde_json::from_str("{}").unwrap();
        assert_eq!(old.background, BackgroundSettings::default());
    }

    #[test]
    fn sanitizes_layouts() {
        let tab = |kind: &str, shell: &str, command: &str, group: Option<usize>| LayoutTab {
            kind: kind.into(),
            shell: shell.into(),
            command: command.into(),
            group,
            ..Default::default()
        };
        let layout = |name: &str| SavedLayout {
            name: name.into(),
            tabs: vec![
                tab("shell", "pwsh", " bun run dev ", Some(0)),
                tab("claude", "pwsh", "ls", Some(5)),
                tab("shell", "ssh:-oProxy", "a\nb", None),
                tab("shell", "ssh:web-1", "ls", None),
                tab("shell", "auto", &"x".repeat(501), None),
            ],
            groups: vec![" Dev ".into()],
            splits: vec![
                LayoutSplit { left: 0, right: 1, ratio: 9.0, ..Default::default() },
                LayoutSplit { left: 1, right: 2, ratio: 0.5, dir: "col".into() },
                LayoutSplit { left: 2, right: 2, ratio: 0.5, ..Default::default() },
                LayoutSplit { left: 3, right: 1, ratio: 0.5, ..Default::default() },
                LayoutSplit { left: 2, right: 9, ratio: 0.5, dir: "diagonal".into() },
            ],
        };
        let mut s = Settings::default();
        let mut list = vec![layout(" Dev "), layout("dev"), layout(""), SavedLayout { name: "vazio".into(), ..Default::default() }];
        list.extend((0..30).map(|i| layout(&format!("l{i}"))));
        s.apply(SettingsPatch { layouts: Some(list), ..Default::default() });
        assert_eq!(s.layouts.len(), MAX_LAYOUTS);
        let l = &s.layouts[0];
        assert_eq!(l.name, "Dev");
        assert_eq!(l.groups, vec!["Dev".to_string()]);
        assert_eq!((l.tabs[0].shell.as_str(), l.tabs[0].command.as_str(), l.tabs[0].group), ("pwsh", "bun run dev", Some(0)));
        // Claude não leva shell nem comando; grupo inexistente some.
        assert_eq!((l.tabs[1].shell.as_str(), l.tabs[1].command.as_str(), l.tabs[1].group), ("", "", None));
        // Host inválido, comando com quebra de linha, `auto` e comando longo viram vazio; SSH não leva comando.
        assert_eq!((l.tabs[2].shell.as_str(), l.tabs[2].command.as_str()), ("", ""));
        assert_eq!((l.tabs[3].shell.as_str(), l.tabs[3].command.as_str()), ("ssh:web-1", ""));
        assert_eq!((l.tabs[4].shell.as_str(), l.tabs[4].command.as_str()), ("", ""));
        // Divisões em árvore: ratio limitado; dividir de novo um painel vale; aba que já está numa divisão
        // (como `right`), de uma aba só ou fora da lista saem.
        assert_eq!(
            l.splits,
            vec![
                LayoutSplit { left: 0, right: 1, ratio: 0.9, dir: "row".into() },
                LayoutSplit { left: 1, right: 2, ratio: 0.5, dir: "col".into() },
            ]
        );
        let old: Settings = serde_json::from_str("{}").unwrap();
        assert!(old.layouts.is_empty());
        // Layout antigo (pares, sem `dir`): ao lado.
        let split: LayoutSplit = serde_json::from_str(r#"{"left":0,"right":1,"ratio":0.5}"#).unwrap();
        assert_eq!(split.dir, "row");
    }

    #[test]
    fn tray_options_need_the_icon() {
        let mut t = TraySettings { close_to_tray: true, minimize_to_tray: true, start_hidden: true, ..Default::default() };
        assert!(!t.hides_on_close() && !t.hides_on_minimize() && !t.starts_hidden());
        t.enabled = true;
        assert!(t.hides_on_close() && t.hides_on_minimize() && t.starts_hidden());
        // Arquivo antigo, sem o campo: tudo desligado.
        let s: Settings = serde_json::from_str("{}").unwrap();
        assert_eq!(s.tray, TraySettings::default());
    }

    #[test]
    fn validates_new_settings() {
        let mut s = Settings::default();
        s.apply(SettingsPatch {
            notifications: Some(NotificationSettings { command_secs: 1, ..Default::default() }),
            workflows: Some(vec![
                Workflow { name: " Log ".into(), command: "git log --author={{autor}}".into(), ..Default::default() },
                Workflow { name: String::new(), command: "x".into(), ..Default::default() },
                Workflow { name: "vazio".into(), command: "  ".into(), ..Default::default() },
            ]),
            global_hotkey: Some("Ctrl+Alt+T".into()),
            default_shell: Some("wsl:Ubuntu-22.04".into()),
            ..Default::default()
        });
        assert_eq!(s.notifications.command_secs, COMMAND_SECS_MIN);
        assert_eq!(s.workflows.len(), 1);
        assert_eq!(s.workflows[0].name, "Log");
        assert_eq!(s.global_hotkey, "Ctrl+Alt+T");
        assert_eq!(s.default_shell, "wsl:Ubuntu-22.04");
        s.apply(SettingsPatch {
            global_hotkey: Some("Ctrl++".into()),
            default_shell: Some("wsl:a; rm".into()),
            ..Default::default()
        });
        assert_eq!(s.global_hotkey, "Ctrl+Alt+T");
        assert_eq!(s.default_shell, "wsl:Ubuntu-22.04");
        for ok in ["auto", "pwsh", "powershell", "cmd", "bash", "wsl"] {
            assert!(is_valid_shell(ok));
        }
        assert!(!is_valid_shell("zsh") && !is_valid_shell("bash:x"));
        assert!(is_valid_hotkey(""));
    }

    #[test]
    fn accepts_only_valid_theme_ids() {
        let mut s = Settings::default();
        s.apply(SettingsPatch {
            theme: Some("dracula".into()),
            ..Default::default()
        });
        assert_eq!(s.theme, "dracula");
        for bad in ["", "Dracula", "../x", "a b", &"x".repeat(41)] {
            s.apply(SettingsPatch {
                theme: Some(bad.to_string()),
                ..Default::default()
            });
            assert_eq!(s.theme, "dracula");
        }
    }

    #[test]
    fn sanitizes_highlight_rules() {
        let mut s = Settings::default();
        let mut rules = vec![
            HighlightRule {
                pattern: " ok ".into(),
                color: "#AABBCC".into(),
                ..Default::default()
            },
            HighlightRule {
                pattern: "".into(),
                color: "#aabbcc".into(),
                ..Default::default()
            },
            HighlightRule {
                pattern: "x".into(),
                color: "red".into(),
                ..Default::default()
            },
            HighlightRule {
                pattern: "y".repeat(MAX_PATTERN + 1),
                color: "#aabbcc".into(),
                ..Default::default()
            },
        ];
        rules.extend((0..30).map(|i| HighlightRule {
            pattern: format!("r{i}"),
            color: "#000000".into(),
            ..Default::default()
        }));
        s.apply(SettingsPatch {
            highlights: Some(HighlightSettings {
                rules,
                severity: false,
                ..Default::default()
            }),
            ..Default::default()
        });
        assert!(!s.highlights.severity);
        assert_eq!(s.highlights.rules.len(), MAX_RULES);
        assert_eq!(
            s.highlights.rules[0],
            HighlightRule {
                pattern: "ok".into(),
                color: "#aabbcc".into(),
                ..Default::default()
            }
        );
    }

    #[test]
    fn rule_triggers_survive_and_old_rules_have_none() {
        let mut s = Settings::default();
        let rule = HighlightRule { pattern: "ready".into(), color: "#00ff00".into(), notify: true, mark: true };
        s.apply(SettingsPatch {
            highlights: Some(HighlightSettings { rules: vec![rule.clone()], ..Default::default() }),
            ..Default::default()
        });
        assert_eq!(s.highlights.rules, vec![rule]);
        let old: HighlightRule = serde_json::from_str(r##"{"pattern":"x","color":"#000000"}"##).unwrap();
        assert!(!old.notify && !old.mark);
    }

    #[test]
    fn old_settings_file_gets_default_highlights() {
        let s: Settings = serde_json::from_str(r#"{"theme":"dracula"}"#).unwrap();
        assert_eq!(s.highlights, HighlightSettings::default());
    }

    #[test]
    fn old_highlights_get_new_toggles_and_session_defaults() {
        let s: Settings =
            serde_json::from_str(r#"{"highlights":{"fileLinks":false,"rules":[]}}"#).unwrap();
        assert!(!s.highlights.file_links);
        assert!(s.highlights.log_levels && s.highlights.diffs);
        assert!(s.highlights.timestamps && s.highlights.uuids);
        assert!(s.restore_session);
        assert!(!s.input_editor);
    }

    #[test]
    fn sanitizes_profiles() {
        let mut s = Settings::default();
        let ok = Profile {
            id: "a".into(),
            name: " A ".into(),
            color: "#AABBCC".into(),
            ..Default::default()
        };
        // A cor fixa antiga vira o acento do tema.
        let mut list = vec![
            ok.clone(),
            Profile {
                id: "a".into(),
                name: "dup".into(),
                ..ok.clone()
            },
            Profile {
                id: "B C".into(),
                name: "x".into(),
                ..ok.clone()
            },
            Profile {
                id: "c".into(),
                name: "".into(),
                ..ok.clone()
            },
            Profile {
                id: "d".into(),
                name: "d".into(),
                color: "rosa".into(),
                ..Default::default()
            },
            Profile {
                id: "t".into(),
                name: "t".into(),
                color: "Cyan".into(),
                ..Default::default()
            },
            Profile {
                id: "e".into(),
                name: "e".into(),
                pinned: vec!["".into(), " D:/x ".into()],
                ..ok.clone()
            },
        ];
        list.extend((0..20).map(|i| Profile {
            id: format!("p{i}"),
            name: format!("p{i}"),
            ..ok.clone()
        }));
        s.apply(SettingsPatch {
            profiles: Some(list),
            ..Default::default()
        });
        assert_eq!(s.profiles.len(), MAX_PROFILES);
        assert_eq!(
            (s.profiles[0].name.as_str(), s.profiles[0].color.as_str()),
            ("A", "accent")
        );
        assert_eq!(
            (s.profiles[1].id.as_str(), s.profiles[1].color.as_str()),
            ("t", "cyan")
        );
        assert_eq!(s.profiles[2].id, "e");
        assert_eq!(s.profiles[2].pinned, vec!["D:/x".to_string()]);
        s.apply(SettingsPatch {
            profiles: Some(vec![]),
            ..Default::default()
        });
        assert_eq!(s.profiles, default_profiles());
    }

    #[test]
    fn accepts_only_known_interface_sizes() {
        let mut s = Settings::default();
        assert_eq!(s.interface_size, "medium");
        s.apply(SettingsPatch {
            interface_size: Some("large".into()),
            ..Default::default()
        });
        assert_eq!(s.interface_size, "large");
        s.apply(SettingsPatch {
            interface_size: Some("huge".into()),
            ..Default::default()
        });
        assert_eq!(s.interface_size, "large");
        let old: Settings = serde_json::from_str(r#"{"theme":"dracula"}"#).unwrap();
        assert_eq!(old.interface_size, "medium");
    }

    #[test]
    fn custom_themes_keep_only_valid_schemes() {
        let good = CustomTheme {
            id: "custom-meu".into(),
            name: " Meu ".into(),
            background: "#101010".into(),
            foreground: "#E0E0E0".into(),
            cursor: "#ffffff".into(),
            selection: Some("nada".into()),
            ..Default::default()
        };
        let mut good = good;
        for c in good.colors_mut().into_iter().skip(3) {
            *c = "#123456".into();
        }
        let mut bad_color = good.clone();
        bad_color.id = "custom-ruim".into();
        bad_color.red = "red".into();
        let mut bad_id = good.clone();
        bad_id.id = "dracula".into();
        let dup = good.clone();
        let mut s = Settings::default();
        s.apply(SettingsPatch { custom_themes: Some(vec![good, bad_color, bad_id, dup]), ..Default::default() });
        assert_eq!(s.custom_themes.len(), 1);
        let t = &s.custom_themes[0];
        assert_eq!((t.name.as_str(), t.foreground.as_str(), t.selection.clone()), ("Meu", "#e0e0e0", None));
    }

    #[test]
    fn keybindings_keep_only_valid_entries() {
        let mut s = Settings::default();
        let map: BTreeMap<String, String> = [
            ("new-shell", "Ctrl+Alt+T"),
            ("palette", ""),
            ("Bad Id", "Ctrl+X"),
            ("themes", "Ctrl+<script>"),
            ("font-up", " Ctrl+Equal "),
        ]
        .into_iter()
        .map(|(k, v)| (k.to_string(), v.to_string()))
        .collect();
        s.apply(SettingsPatch { keybindings: Some(map), ..Default::default() });
        let got: Vec<(&str, &str)> = s.keybindings.iter().map(|(k, v)| (k.as_str(), v.as_str())).collect();
        assert_eq!(got, vec![("font-up", "Ctrl+Equal"), ("new-shell", "Ctrl+Alt+T"), ("palette", "")]);
    }

    #[test]
    fn contrast_only_known_levels_and_osc_toggles() {
        let mut s = Settings::default();
        assert_eq!(s.minimum_contrast, 1.0);
        assert!(s.dim_inactive_pane && s.osc_clipboard && s.osc_notifications);
        s.apply(SettingsPatch { minimum_contrast: Some(4.5), osc_clipboard: Some(false), ..Default::default() });
        assert_eq!(s.minimum_contrast, 4.5);
        assert!(!s.osc_clipboard);
        s.apply(SettingsPatch { minimum_contrast: Some(30.0), ..Default::default() });
        assert_eq!(s.minimum_contrast, 4.5);
        s.apply(SettingsPatch { minimum_contrast: Some(f64::NAN), ..Default::default() });
        assert_eq!(s.minimum_contrast, 4.5);
    }

    #[test]
    fn accepts_only_known_link_targets() {
        let mut s = Settings::default();
        assert_eq!(s.link_target, "panel");
        s.apply(SettingsPatch {
            link_target: Some("browser".into()),
            ..Default::default()
        });
        assert_eq!(s.link_target, "browser");
        s.apply(SettingsPatch {
            link_target: Some("arc".into()),
            ..Default::default()
        });
        assert_eq!(s.link_target, "browser");
    }

    #[test]
    fn ignores_empty_font_family() {
        let mut s = Settings::default();
        let before = s.font_family.clone();
        s.apply(SettingsPatch {
            font_family: Some("   ".into()),
            ..Default::default()
        });
        assert_eq!(s.font_family, before);
    }

    #[test]
    fn one_bad_field_keeps_the_others_and_backs_up_the_file() {
        let dir = std::env::temp_dir().join(format!("termo-test-bad-{}", std::process::id()));
        fs::create_dir_all(&dir).unwrap();
        // fontSize com tipo errado; startWithClaude e fontFamily válidos.
        fs::write(
            dir.join("settings.json"),
            r#"{"fontSize":"grande","startWithClaude":true,"fontFamily":"Cascadia Code"}"#,
        )
        .unwrap();
        let store = SettingsStore::load(&dir);
        let s = store.get();
        assert!(s.start_with_claude);
        assert_eq!(s.font_family, "Cascadia Code");
        assert_eq!(s.font_size, Settings::default().font_size);
        let backups = fs::read_dir(&dir)
            .unwrap()
            .filter_map(Result::ok)
            .filter(|e| e.file_name().to_string_lossy().starts_with("settings.json.bad-"))
            .count();
        assert_eq!(backups, 1);
        let _ = fs::remove_dir_all(dir);
    }

    #[test]
    fn broken_json_falls_back_to_defaults_with_a_backup() {
        let dir = std::env::temp_dir().join(format!("termo-test-broken-{}", std::process::id()));
        fs::create_dir_all(&dir).unwrap();
        fs::write(dir.join("settings.json"), "{ isto não é json").unwrap();
        let store = SettingsStore::load(&dir);
        assert_eq!(store.get().font_size, Settings::default().font_size);
        assert!(fs::read_dir(&dir).unwrap().filter_map(Result::ok).any(|e| e
            .file_name()
            .to_string_lossy()
            .starts_with("settings.json.bad-")));
        let _ = fs::remove_dir_all(dir);
    }

    /// Os padrões e limites também vivem no frontend (`src/shared/settings.ts`). Este teste confere o lado do
    /// Rust contra `src/shared/settings.contract.json`, e o `settings.test.ts` confere o lado do TS: mudar um
    /// padrão só de um lado quebra um dos dois. Para regravar o arquivo depois de mudar de propósito:
    /// `TERMO_UPDATE_CONTRACT=1 cargo test --manifest-path src-tauri/Cargo.toml settings_contract`.
    #[test]
    fn settings_contract_matches_the_frontend() {
        let contract = serde_json::json!({
            "defaults": Settings::default(),
            "limits": {
                "fontMin": FONT_MIN,
                "fontMax": FONT_MAX,
                "maxProfiles": MAX_PROFILES,
                "maxPinned": MAX_PINNED,
                "maxRules": MAX_RULES,
                "maxPattern": MAX_PATTERN,
                "contrastLevels": CONTRAST_LEVELS,
            },
        });
        let path = Path::new(env!("CARGO_MANIFEST_DIR")).join("../src/shared/settings.contract.json");
        let text = format!("{}
", serde_json::to_string_pretty(&contract).unwrap());
        if std::env::var_os("TERMO_UPDATE_CONTRACT").is_some() {
            fs::write(&path, &text).unwrap();
        }
        let saved: serde_json::Value =
            serde_json::from_str(&fs::read_to_string(&path).expect("falta src/shared/settings.contract.json")).unwrap();
        assert_eq!(saved, contract, "padrões ou limites do Rust mudaram: regrave o contrato (veja o comentário do teste)");
    }

    #[test]
    fn persists_and_reloads() {
        let dir = std::env::temp_dir().join(format!("termo-test-{}", std::process::id()));
        let store = SettingsStore::load(&dir);
        store
            .update(SettingsPatch {
                start_with_claude: Some(true),
                font_size: Some(18),
                ..Default::default()
            })
            .unwrap();
        let again = SettingsStore::load(&dir);
        assert!(again.get().start_with_claude);
        assert_eq!(again.get().font_size, 18);
        let _ = fs::remove_dir_all(dir);
    }
}
