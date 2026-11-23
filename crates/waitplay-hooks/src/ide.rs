//! `waitplay-hook cursor|antigravity <start|tool|stop|complete> [arg1] [arg2]` (ports of cursor-hook.cjs and
//! antigravity-hook.cjs, which differ only in names and defaults).

use crate::common::{self, obj, PopRequest};
use serde_json::{Map, Value};
use waitplay_core::{protocol::now_ms, state};

pub struct Ide {
    pub agent: &'static str,
    pub session: &'static str,
    pub default_model: &'static str,
    pub default_task: &'static str,
    pub default_tool: &'static str,
}

pub const CURSOR: Ide = Ide {
    agent: "cursor",
    session: "cursor-session",
    default_model: "Claude 3.7 Sonnet",
    default_task: "Cursor Composer generation",
    default_tool: "Edit",
};

pub const ANTIGRAVITY: Ide = Ide {
    agent: "antigravity",
    session: "antigravity-session",
    default_model: "Gemini 3.8 Flash",
    default_task: "Antigravity IDE task",
    default_tool: "Task",
};

/// One event to send. `model` is the top-level payload model.
#[derive(Debug, PartialEq)]
pub struct Planned {
    pub event: &'static str,
    pub model: String,
    pub data: Option<Map<String, Value>>,
}

/// `Some` when the action sends an event; `start` additionally launches the app.
pub fn plan(ide: &Ide, action: &str, param1: &str, param2: &str, prompt_time: i64) -> Option<Planned> {
    let s = |x: &str| Value::String(x.to_string());
    let or = |p: &str, d: &str| if p.is_empty() { d.to_string() } else { p.to_string() };
    match action {
        "start" => {
            let model = or(param1, ide.default_model);
            Some(Planned {
                event: "task_started",
                data: Some(obj(vec![("model", s(&model)), ("task", s(&or(param2, ide.default_task))), ("promptTime", Value::from(prompt_time))])),
                model,
            })
        }
        "tool" => Some(Planned {
            event: "task_running",
            model: ide.default_model.to_string(),
            data: Some(obj(vec![("tool", s(&or(param1, ide.default_tool)))])),
        }),
        "stop" | "complete" => Some(Planned { event: "task_completed", model: ide.default_model.to_string(), data: None }),
        _ => None,
    }
}

pub fn run(ide: &Ide, args: &[String]) {
    let action = args.first().map(String::as_str).unwrap_or("start");
    let param1 = args.get(1).map(String::as_str).unwrap_or("");
    let param2 = args.get(2).map(String::as_str).unwrap_or("");
    let prompt_time = now_ms();
    let Some(p) = plan(ide, action, param1, param2, prompt_time) else { return };

    if action == "start" && state::is_enabled() && !common::legacy_dismissed_since(ide.session, prompt_time) {
        common::spawn_app(&PopRequest {
            session: ide.session.into(),
            terminal: None,
            prompt_time: Some(prompt_time),
            parent_pid: common::parent_pid_or_self(),
        });
    }
    common::post_event_quiet(&common::event_payload(ide.agent, ide.session, p.event, Some(Value::String(p.model)), None, p.data));
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn cursor_start_defaults_and_overrides() {
        let p = plan(&CURSOR, "start", "", "", 7).unwrap();
        assert_eq!(p.event, "task_started");
        assert_eq!(p.model, "Claude 3.7 Sonnet");
        assert_eq!(Value::Object(p.data.unwrap()), json!({"model": "Claude 3.7 Sonnet", "task": "Cursor Composer generation", "promptTime": 7}));
        let p = plan(&CURSOR, "start", "gpt-5", "Refactor", 7).unwrap();
        assert_eq!(p.model, "gpt-5");
        assert_eq!(Value::Object(p.data.unwrap()), json!({"model": "gpt-5", "task": "Refactor", "promptTime": 7}));
    }

    #[test]
    fn antigravity_defaults() {
        let p = plan(&ANTIGRAVITY, "start", "", "", 1).unwrap();
        assert_eq!(p.model, "Gemini 3.8 Flash");
        assert_eq!(p.data.unwrap()["task"], "Antigravity IDE task");
        let p = plan(&ANTIGRAVITY, "tool", "", "", 1).unwrap();
        assert_eq!(Value::Object(p.data.unwrap()), json!({"tool": "Task"}));
        assert_eq!(p.model, "Gemini 3.8 Flash");
    }

    #[test]
    fn tool_stop_complete_and_unknown() {
        assert_eq!(plan(&CURSOR, "tool", "Read", "", 1).unwrap().data.unwrap()["tool"], "Read");
        assert_eq!(plan(&CURSOR, "tool", "", "", 1).unwrap().data.unwrap()["tool"], "Edit");
        for a in ["stop", "complete"] {
            let p = plan(&CURSOR, a, "", "", 1).unwrap();
            assert_eq!((p.event, p.data), ("task_completed", None));
        }
        assert!(plan(&CURSOR, "bogus", "", "", 1).is_none());
    }
}
