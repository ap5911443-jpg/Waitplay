//! `waitplay-hook claude-code <start|tool|stop|notify|end>`: the Claude Code lifecycle hook (port of
//! integrations/claude-code/waitplay-hook.cjs, the one `~/.claude/settings.json` points at; waitplay-hook.js is a generic
//! reference dispatcher that nothing calls). Claude Code pipes the hook JSON to stdin.

use crate::common::{self, obj, or_default, PopRequest};
use serde_json::{Map, Value};
use std::io::Read;
use std::sync::mpsc;
use std::time::Duration;
use waitplay_core::{protocol::now_ms, signals, state};

pub const AGENT: &str = "claude-code";
pub const SESSION: &str = "claude-code-session";
const DEFAULT_MODEL: &str = "Claude 3.7 Sonnet";

/// What one hook invocation must do. Pure result of the hook name and the stdin JSON.
#[derive(Debug, PartialEq)]
pub enum Action {
    Start { model: Value, prompt: String },
    Tool { tool: Value, model: Value },
    Stop { model: Value },
    WaitingForInput { prompt: String },
    End,
    Ignore,
}

/// `event_type` is the CLI argument (`start`, `tool`, ...); `data` is the stdin JSON (an empty object when absent).
pub fn classify(event_type: &str, data: &Value) -> Action {
    let field = |k: &str| data.get(k);
    // `data.hook_event_name || eventType`
    let hook_name: &str = match field("hook_event_name") {
        Some(Value::String(s)) if !s.is_empty() => s,
        Some(v) if common::truthy(v) => "",
        _ => event_type,
    };
    let model = || or_default(field("model"), DEFAULT_MODEL);

    if hook_name == "UserPromptSubmit" || hook_name == "user_prompt_submit" || event_type == "start" {
        Action::Start { model: model(), prompt: common::prompt_100(field("prompt")) }
    } else if hook_name == "PreToolUse" || hook_name == "pre_tool_use" || event_type == "tool" {
        let tool = match field("tool_name") {
            Some(v) if common::truthy(v) => v.clone(),
            _ => or_default(field("tool"), "Tool"),
        };
        Action::Tool { tool, model: model() }
    } else if hook_name == "Stop" || hook_name == "stop" || event_type == "stop" {
        Action::Stop { model: model() }
    } else if hook_name == "Notification" || event_type == "notify" {
        let msg = match field("message") {
            Some(Value::String(s)) => s.as_str(),
            _ => "",
        };
        if msg.contains("permission") || msg.contains("approve") || msg.contains("allow") {
            Action::WaitingForInput { prompt: msg.to_string() }
        } else {
            Action::Ignore
        }
    } else if hook_name == "SessionEnd" || event_type == "end" {
        Action::End
    } else {
        Action::Ignore
    }
}

fn post(event: &str, model: Value, data: Option<Map<String, Value>>) {
    common::post_event_quiet(&common::event_payload(AGENT, SESSION, event, Some(model), None, data));
}

pub fn execute(action: Action) {
    match action {
        Action::Start { model, prompt } => {
            let prompt_time = now_ms();
            signals::clear_dismissal(SESSION);
            // The companion window takes a moment to appear; start it before the (possibly slow) bridge call.
            if state::is_enabled() && !signals::is_prompt_dismissed(SESSION) {
                common::spawn_app(&PopRequest {
                    session: SESSION.into(),
                    terminal: None,
                    prompt_time: Some(prompt_time),
                    parent_pid: common::parent_pid_or_self(),
                });
            }
            post(
                "task_started",
                model.clone(),
                Some(obj(vec![("model", model), ("prompt", Value::String(prompt)), ("promptTime", Value::from(prompt_time))])),
            );
        }
        Action::Tool { tool, model } => post("task_running", model.clone(), Some(obj(vec![("tool", tool), ("model", model)]))),
        Action::Stop { model } => {
            signals::clear_dismissal(SESSION);
            post("task_completed", model.clone(), Some(obj(vec![("model", model)])));
            signals::write_close_signal(SESSION);
        }
        Action::WaitingForInput { prompt } => {
            post("waiting_for_input", Value::String(DEFAULT_MODEL.into()), Some(obj(vec![("prompt", Value::String(prompt))])))
        }
        Action::End => {
            signals::clear_dismissal(SESSION);
            post("session_ended", Value::String(DEFAULT_MODEL.into()), None);
        }
        Action::Ignore => {}
    }
}

/// Parses stdin text: an empty or malformed body is an empty object, anything that is not an object reads as empty too.
pub fn parse_stdin(input: &str) -> Value {
    if input.trim().is_empty() {
        return Value::Object(Map::new());
    }
    match serde_json::from_str::<Value>(input) {
        Ok(v @ Value::Object(_)) => v,
        _ => Value::Object(Map::new()),
    }
}

/// Reads all of stdin, giving up after `limit` (the old hook exited 0 after one second of silence).
pub fn read_stdin_with_timeout(limit: Duration) -> Option<String> {
    let (tx, rx) = mpsc::channel();
    std::thread::spawn(move || {
        let mut buf = Vec::new();
        let _ = std::io::stdin().lock().read_to_end(&mut buf);
        let _ = tx.send(String::from_utf8_lossy(&buf).into_owned());
    });
    rx.recv_timeout(limit).ok()
}

pub fn run(args: &[String]) {
    let event_type = args.first().map(String::as_str).unwrap_or("unknown");
    let Some(input) = read_stdin_with_timeout(Duration::from_millis(1000)) else { return };
    execute(classify(event_type, &parse_stdin(&input)));
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    fn c(arg: &str, data: Value) -> Action {
        classify(arg, &data)
    }

    #[test]
    fn start_from_hook_json_and_from_arg() {
        let long = "x".repeat(150);
        assert_eq!(
            c("start", json!({"hook_event_name": "UserPromptSubmit", "prompt": long, "model": "opus"})),
            Action::Start { model: json!("opus"), prompt: "x".repeat(100) }
        );
        // the CLI argument alone is enough
        assert_eq!(c("start", json!({})), Action::Start { model: json!("Claude 3.7 Sonnet"), prompt: String::new() });
        // hook name alone, whatever the argument is
        assert_eq!(c("unknown", json!({"hook_event_name": "user_prompt_submit"})), Action::Start { model: json!("Claude 3.7 Sonnet"), prompt: String::new() });
    }

    #[test]
    fn tool_name_fallbacks() {
        assert_eq!(c("tool", json!({"tool_name": "Bash"})), Action::Tool { tool: json!("Bash"), model: json!("Claude 3.7 Sonnet") });
        assert_eq!(c("tool", json!({"tool": "Edit"})), Action::Tool { tool: json!("Edit"), model: json!("Claude 3.7 Sonnet") });
        assert_eq!(c("tool", json!({})), Action::Tool { tool: json!("Tool"), model: json!("Claude 3.7 Sonnet") });
        assert_eq!(c("x", json!({"hook_event_name": "PreToolUse", "tool_name": "Read"})), Action::Tool { tool: json!("Read"), model: json!("Claude 3.7 Sonnet") });
    }

    #[test]
    fn stop_notify_end() {
        assert_eq!(c("stop", json!({})), Action::Stop { model: json!("Claude 3.7 Sonnet") });
        assert_eq!(c("x", json!({"hook_event_name": "Stop", "model": "m"})), Action::Stop { model: json!("m") });
        assert_eq!(c("end", json!({})), Action::End);
        assert_eq!(c("x", json!({"hook_event_name": "SessionEnd"})), Action::End);
        assert_eq!(
            c("notify", json!({"message": "Claude needs your permission to use Bash"})),
            Action::WaitingForInput { prompt: "Claude needs your permission to use Bash".into() }
        );
        assert_eq!(c("notify", json!({"message": "Claude is waiting for your input"})), Action::Ignore);
        assert_eq!(c("x", json!({"hook_event_name": "Notification", "message": "please approve"})), Action::WaitingForInput { prompt: "please approve".into() });
        assert_eq!(c("notify", json!({})), Action::Ignore);
        assert_eq!(c("bogus", json!({})), Action::Ignore);
        assert_eq!(c("unknown", json!({})), Action::Ignore);
    }

    #[test]
    fn start_arg_wins_over_hook_name() {
        // the `start` argument is tested before the hook name for the later branches, as in the Node script
        assert!(matches!(c("start", json!({"hook_event_name": "Stop"})), Action::Start { .. }));
    }

    #[test]
    fn stdin_parsing_is_forgiving() {
        assert_eq!(parse_stdin(""), json!({}));
        assert_eq!(parse_stdin("{not json"), json!({}));
        assert_eq!(parse_stdin("null"), json!({}));
        assert_eq!(parse_stdin(r#"{"prompt":"hi"}"#), json!({"prompt": "hi"}));
    }
}
