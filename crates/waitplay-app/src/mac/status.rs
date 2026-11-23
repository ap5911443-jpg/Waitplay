//! What the menu bar, the widget and the settings window say about the agents: derived from the bridge's `GET /sessions` body plus
//! three flags. Pure, so every rule is unit tested.

use serde_json::Value;

/// A working session counts only while it is this fresh (hooks and watchers repeat events well inside it).
const FRESH_WORKING_MS: i64 = 15_000;
/// A session that waits for the user stays waiting until the next event: far longer.
const FRESH_WAITING_MS: i64 = 30 * 60_000;

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Activity {
    Idle,
    Working,
    Waiting,
}

impl Activity {
    pub fn as_str(self) -> &'static str {
        match self {
            Activity::Idle => "idle",
            Activity::Working => "working",
            Activity::Waiting => "waiting",
        }
    }
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct AgentRow {
    /// `claude-code`, `opencode`, ...
    pub id: String,
    pub name: String,
    pub activity: Activity,
}

#[derive(Clone, Debug, PartialEq, Eq, Default)]
pub struct SessionsView {
    /// One row per agent that has a session on the bridge (the strongest activity of its sessions).
    pub agents: Vec<AgentRow>,
}

impl SessionsView {
    pub fn working(&self) -> Vec<&AgentRow> {
        self.agents.iter().filter(|a| a.activity == Activity::Working).collect()
    }
    pub fn waiting(&self) -> Vec<&AgentRow> {
        self.agents.iter().filter(|a| a.activity == Activity::Waiting).collect()
    }
    pub fn activity_of(&self, id: &str) -> Activity {
        self.agents.iter().find(|a| a.id == id).map_or(Activity::Idle, |a| a.activity)
    }
}

pub fn agent_name(id: &str) -> String {
    match id {
        "claude-code" => "Claude Code",
        "opencode" => "OpenCode",
        "codex" => "Codex",
        "omp" => "OMP",
        "cline" => "Cline",
        "cursor" => "Cursor",
        "antigravity" => "Antigravity",
        other => other,
    }
    .to_string()
}

/// `None` when the body is not a session list.
pub fn parse_sessions(json: &str, now_ms: i64) -> Option<SessionsView> {
    let root: Value = serde_json::from_str(json).ok()?;
    let sessions = root.get("sessions")?.as_array()?;
    let mut agents: Vec<AgentRow> = Vec::new();
    for s in sessions.iter().filter_map(Value::as_object) {
        let id = s.get("agent").and_then(Value::as_str).unwrap_or("").to_string();
        if id.is_empty() {
            continue;
        }
        let status = s.get("status").and_then(Value::as_str).unwrap_or("");
        let at = s.get("lastEventAt").and_then(|v| v.as_i64().or_else(|| v.as_f64().map(|f| f as i64))).unwrap_or(0);
        let age = now_ms - at;
        let activity = match status {
            "WORKING" | "GAME_ACTIVE" if age <= FRESH_WORKING_MS => Activity::Working,
            "WAITING_FOR_INPUT" if age <= FRESH_WAITING_MS => Activity::Waiting,
            _ => Activity::Idle,
        };
        match agents.iter_mut().find(|a| a.id == id) {
            Some(row) => {
                // working beats waiting beats idle
                if rank(activity) > rank(row.activity) {
                    row.activity = activity;
                }
            }
            None => agents.push(AgentRow { name: agent_name(&id), id, activity }),
        }
    }
    agents.sort_by(|a, b| a.name.cmp(&b.name));
    Some(SessionsView { agents })
}

fn rank(a: Activity) -> u8 {
    match a {
        Activity::Idle => 0,
        Activity::Waiting => 1,
        Activity::Working => 2,
    }
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Status {
    Idle,
    Working,
    Entertainment,
    Paused,
    Error,
}

impl Status {
    pub fn as_str(self) -> &'static str {
        match self {
            Status::Idle => "idle",
            Status::Working => "working",
            Status::Entertainment => "entertainment",
            Status::Paused => "paused",
            Status::Error => "error",
        }
    }
}

/// Paused beats everything (the user turned automation off); a dead bridge is an error; an open entertainment window beats
/// "working"; then working/waiting; else idle.
pub fn overall(enabled: bool, bridge_ok: bool, view: &SessionsView, entertainment_open: bool) -> Status {
    if !enabled {
        Status::Paused
    } else if !bridge_ok {
        Status::Error
    } else if entertainment_open {
        Status::Entertainment
    } else if view.agents.iter().any(|a| a.activity != Activity::Idle) {
        Status::Working
    } else {
        Status::Idle
    }
}

fn join_names(rows: &[&AgentRow]) -> String {
    match rows {
        [] => String::new(),
        [a] => a.name.clone(),
        [a, b] => format!("{} and {}", a.name, b.name),
        [a, rest @ ..] => format!("{} and {} more", a.name, rest.len()),
    }
}

/// (title, subtitle) for the widget and the menu.
pub fn describe(status: Status, view: &SessionsView, platform_label: &str) -> (String, String) {
    let working = view.working();
    let waiting = view.waiting();
    match status {
        Status::Paused => ("Paused".into(), "Automation is off".into()),
        Status::Error => ("Needs attention".into(), "Local bridge is not running".into()),
        Status::Idle => ("Idle".into(), "Waiting for an agent".into()),
        Status::Working | Status::Entertainment => {
            let (title, detail) = if !working.is_empty() {
                let verb = if working.len() == 1 { "is working" } else { "are working" };
                (format!("{} {}", join_names(&working), verb), join_names(&working))
            } else if !waiting.is_empty() {
                (format!("{} needs you", join_names(&waiting)), join_names(&waiting))
            } else {
                ("Entertainment open".to_string(), String::new())
            };
            let sub = if detail.is_empty() { platform_label.to_string() } else { format!("{} \u{b7} {}", detail, platform_label) };
            (title, sub)
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    const NOW: i64 = 1_700_000_100_000;

    fn body(items: &[(&str, &str, i64)]) -> String {
        let list: Vec<String> =
            items.iter().map(|(agent, st, t)| format!(r#"{{"sessionId":"{}-session","agent":"{}","status":"{}","lastEventAt":{}}}"#, agent, agent, st, t)).collect();
        format!(r#"{{"sessions":[{}]}}"#, list.join(","))
    }

    #[test]
    fn strongest_activity_per_agent_and_stale_working_is_idle() {
        let v = parse_sessions(
            &body(&[("claude-code", "WORKING", NOW - 1000), ("claude-code", "WAITING_FOR_INPUT", NOW - 1000), ("opencode", "WORKING", NOW - 20_000)]),
            NOW,
        )
        .unwrap();
        assert_eq!(v.activity_of("claude-code"), Activity::Working);
        assert_eq!(v.activity_of("opencode"), Activity::Idle, "20 s of silence: the bridge watchdog is about to complete it");
        assert_eq!(v.agents.len(), 2);
    }

    #[test]
    fn waiting_outlasts_the_working_freshness() {
        let v = parse_sessions(&body(&[("codex", "WAITING_FOR_INPUT", NOW - 5 * 60_000)]), NOW).unwrap();
        assert_eq!(v.activity_of("codex"), Activity::Waiting);
    }

    #[test]
    fn garbage_is_not_a_session_list() {
        assert!(parse_sessions("nope", NOW).is_none());
        assert!(parse_sessions(r#"{"sessions":3}"#, NOW).is_none());
        assert_eq!(parse_sessions(r#"{"sessions":[]}"#, NOW).unwrap(), SessionsView::default());
    }

    #[test]
    fn overall_priorities() {
        let idle = SessionsView::default();
        let busy = parse_sessions(&body(&[("omp", "WORKING", NOW)]), NOW).unwrap();
        assert_eq!(overall(false, false, &busy, true), Status::Paused);
        assert_eq!(overall(true, false, &busy, true), Status::Error);
        assert_eq!(overall(true, true, &busy, true), Status::Entertainment);
        assert_eq!(overall(true, true, &busy, false), Status::Working);
        assert_eq!(overall(true, true, &idle, false), Status::Idle);
    }

    #[test]
    fn descriptions_name_the_agents() {
        let one = parse_sessions(&body(&[("claude-code", "WORKING", NOW)]), NOW).unwrap();
        assert_eq!(describe(Status::Working, &one, "Instagram"), ("Claude Code is working".into(), "Claude Code \u{b7} Instagram".into()));
        let two = parse_sessions(&body(&[("claude-code", "WORKING", NOW), ("omp", "WORKING", NOW)]), NOW).unwrap();
        assert_eq!(describe(Status::Entertainment, &two, "X").0, "Claude Code and OMP are working");
        let waiting = parse_sessions(&body(&[("codex", "WAITING_FOR_INPUT", NOW)]), NOW).unwrap();
        assert_eq!(describe(Status::Working, &waiting, "X").0, "Codex needs you");
        assert_eq!(describe(Status::Idle, &SessionsView::default(), "X").0, "Idle");
        assert_eq!(describe(Status::Entertainment, &SessionsView::default(), "YouTube"), ("Entertainment open".into(), "YouTube".into()));
    }
}
