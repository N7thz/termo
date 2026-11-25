//! Papéis para as abas do Claude: os agentes de `.claude/agents/*.md` do projeto e do usuário
//! (`~/.claude/agents`). A aba abre com `claude --agent <nome>`, que usa as instruções, o modelo e
//! as ferramentas definidos no arquivo.

use std::path::Path;

use serde::Serialize;

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AgentDef {
    pub name: String,
    pub description: String,
    /// `sonnet`, `opus`... ou vazio (`inherit` vira vazio).
    pub model: String,
    /// Do projeto (`.claude/agents` da pasta) ou do usuário.
    pub project: bool,
}

/// Nome que vai para `--agent`: letras, números, `-` e `_`.
pub fn valid_name(name: &str) -> bool {
    !name.is_empty() && name.len() <= 64 && name.chars().all(|c| c.is_ascii_alphanumeric() || c == '-' || c == '_')
}

/// Lê o frontmatter (`---` ... `---`) de um arquivo de agente. Sem `name`, vale o nome do arquivo.
pub fn parse(text: &str, file_stem: &str, project: bool) -> Option<AgentDef> {
    let mut lines = text.lines();
    if lines.next()?.trim() != "---" {
        return None;
    }
    let (mut name, mut description, mut model) = (None, String::new(), String::new());
    for line in lines {
        let line = line.trim_end();
        if line.trim() == "---" {
            break;
        }
        let Some((key, value)) = line.split_once(':') else { continue };
        let value = value.trim().trim_matches(['"', '\'']).to_string();
        match key.trim() {
            "name" => name = Some(value),
            "description" => description = value,
            "model" => model = if value == "inherit" { String::new() } else { value },
            _ => {}
        }
    }
    let name = name.filter(|n| !n.is_empty()).unwrap_or_else(|| file_stem.to_string());
    valid_name(&name).then_some(AgentDef { name, description, model, project })
}

fn read_dir(dir: &Path, project: bool, out: &mut Vec<AgentDef>) {
    let Ok(entries) = std::fs::read_dir(dir) else { return };
    for e in entries.flatten() {
        let path = e.path();
        if path.extension().and_then(|x| x.to_str()) != Some("md") {
            continue;
        }
        // Arquivo de agente é pequeno; um enorme não é um agente.
        if e.metadata().map(|m| m.len() > 256 * 1024).unwrap_or(true) {
            continue;
        }
        let stem = path.file_stem().and_then(|s| s.to_str()).unwrap_or_default().to_string();
        if let Some(def) = std::fs::read_to_string(&path).ok().and_then(|t| parse(&t, &stem, project)) {
            if !out.iter().any(|d| d.name == def.name) {
                out.push(def);
            }
        }
    }
}

/// Agentes do projeto (`<cwd>/.claude/agents`) e do usuário; o do projeto vale sobre o de mesmo nome.
pub fn list(cwd: Option<&Path>, home: Option<&Path>) -> Vec<AgentDef> {
    let mut out = Vec::new();
    if let Some(cwd) = cwd {
        read_dir(&cwd.join(".claude").join("agents"), true, &mut out);
    }
    if let Some(home) = home {
        read_dir(&home.join(".claude").join("agents"), false, &mut out);
    }
    out.sort_by(|a, b| (!a.project, &a.name).cmp(&(!b.project, &b.name)));
    out
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_frontmatter() {
        let t = "---\nname: revisor\ndescription: \"Revisa o diff\"\nmodel: inherit\n---\n# corpo\nname: outro";
        assert_eq!(
            parse(t, "x", true),
            Some(AgentDef { name: "revisor".into(), description: "Revisa o diff".into(), model: String::new(), project: true })
        );
        assert_eq!(parse("---\nmodel: opus\n---", "testador", false).unwrap().name, "testador");
        assert_eq!(parse("# sem frontmatter", "x", false), None);
        assert_eq!(parse("---\nname: nome com espaço\n---", "x", false), None);
    }

    #[test]
    fn project_overrides_user() {
        let root = std::env::temp_dir().join(format!("termo-agents-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&root);
        let proj = root.join("proj");
        let home = root.join("home");
        for (dir, name, desc) in [(&proj, "revisor", "do projeto"), (&home, "revisor", "do usuário"), (&home, "docs", "docs")] {
            let d = dir.join(".claude").join("agents");
            std::fs::create_dir_all(&d).unwrap();
            std::fs::write(d.join(format!("{name}.md")), format!("---\nname: {name}\ndescription: {desc}\n---\n")).unwrap();
        }
        let l = list(Some(&proj), Some(&home));
        assert_eq!(l.iter().map(|a| (a.name.as_str(), a.project)).collect::<Vec<_>>(), vec![("revisor", true), ("docs", false)]);
        assert_eq!(l[0].description, "do projeto");
        std::fs::remove_dir_all(&root).ok();
    }
}
