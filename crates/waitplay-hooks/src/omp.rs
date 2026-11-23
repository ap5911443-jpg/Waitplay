//! `waitplay-hook omp-watch`: tails the newest OMP session log, `~/.omp/agent/sessions/<project>/*.jsonl` (override the
//! root with `WAITPLAY_OMP_SESSIONS_DIR`). Port of omp-session-watcher.js.
//!
//! * a user message opens a turn (`task_started`) and launches the companion window
//! * tool starts/results and assistant messages keep it open (`task_running`), repeated every 5 s while the turn is open
//! * a settled assistant stop, an error/abort or a `session_exit` ends it: close signal first, then `task_completed`
//!
//! `OMP_WATCH_MAX_SILENT_MS` (default 600000) stops the heartbeat for a turn that has produced no session output for that long.

use crate::common::{self, js_len, js_slice, js_string, obj, truthy, PopRequest};
use crate::env::{run_loop, Env, RealEnv, Watcher};
use serde_json::Value;
use std::collections::HashMap;
use std::fs;
use std::io::{Read, Seek, SeekFrom};
use std::path::{Path, PathBuf};
use std::time::{SystemTime, UNIX_EPOCH};

pub const SESSION: &str = "omp-session";
const POLL_MS: u64 = 50;
const HEARTBEAT_MS: i64 = 5000;
const DISCOVERY_MS: i64 = 1000;
const SETTLE_MS: i64 = 1500; // stop and aborted: output has settled
const RETRY_SETTLE_MS: i64 = 120_000; // error and length: OMP retries or compacts; gaps seen up to ~2 min
const POP_DEBOUNCE_MS: i64 = 1500;
const DEFAULT_MODEL: &str = "Gemini 3.8 Flash";

pub fn format_model_name(raw: &str) -> String {
    if raw.is_empty() {
        return DEFAULT_MODEL.to_string();
    }
    if raw.contains("gemini-3.8-flash") || raw.contains("gemini-3.8") {
        return "Gemini 3.8 Flash".into();
    }
    if raw.contains("sonnet") {
        return "Claude 3.7 Sonnet".into();
    }
    if raw.contains("opus") {
        return "Claude 3 Opus".into();
    }
    if raw.contains("haiku") {
        return "Claude 3.5 Haiku".into();
    }
    if raw.contains("gpt-4o") {
        return "GPT-4o".into();
    }
    if raw.contains("o3") {
        return "o3-mini".into();
    }
    crate::cline::last_segment(raw)
}

fn ms_of(t: SystemTime) -> i64 {
    t.duration_since(UNIX_EPOCH).map(|d| d.as_millis() as i64).unwrap_or(0)
}

/// OMP writes `sessions/<project-slug>/<timestamp>_<id>.jsonl`; the newest file across all projects is the active session.
pub fn latest_session_file(root: &Path) -> Option<PathBuf> {
    let mut latest: Option<(PathBuf, SystemTime)> = None;
    for slug in fs::read_dir(root).ok()?.flatten() {
        let Ok(names) = fs::read_dir(slug.path()) else { continue }; // a loose file in the root, not a project dir
        for e in names.flatten() {
            if !e.file_name().to_string_lossy().ends_with(".jsonl") {
                continue;
            }
            let p = e.path();
            let Ok(mtime) = fs::metadata(&p).and_then(|m| m.modified()) else { continue }; // deleted mid-scan
            if latest.as_ref().map_or(true, |(_, t)| mtime > *t) {
                latest = Some((p, mtime));
            }
        }
    }
    latest.map(|l| l.0)
}

pub struct OmpWatcher {
    root: PathBuf,
    max_silent_ms: i64,
    started_at: i64,
    resume_offsets: HashMap<PathBuf, u64>,
    last_discovery_at: i64,
    active_file: Option<PathBuf>,
    file_position: u64,
    remainder: Vec<u8>,
    pub is_working: bool,
    pub pending_tools: u32,
    finish_at: Option<i64>,
    pub current_prompt_ts: i64,
    pub current_model: String,
    last_output_at: i64,
    last_pop_time: i64,
    next_heartbeat: i64,
}

impl OmpWatcher {
    pub fn new(root: PathBuf, max_silent_ms: i64, now: i64) -> OmpWatcher {
        OmpWatcher {
            root,
            max_silent_ms,
            started_at: now,
            resume_offsets: HashMap::new(),
            last_discovery_at: 0,
            active_file: None,
            file_position: 0,
            remainder: Vec::new(),
            is_working: false,
            pending_tools: 0,
            finish_at: None,
            current_prompt_ts: 0,
            current_model: DEFAULT_MODEL.into(),
            last_output_at: 0,
            last_pop_time: 0,
            next_heartbeat: now + HEARTBEAT_MS,
        }
    }

    fn send(&self, env: &mut dyn Env, event: &str, data: serde_json::Map<String, Value>, quiet: bool) {
        env.post(event, None, Some(data));
        if !quiet {
            env.log(&format!("[OMP Watcher] Event -> {}", event));
        }
    }

    fn model(&self) -> Value {
        Value::String(self.current_model.clone())
    }

    fn pop_app(&mut self, env: &mut dyn Env) {
        if !env.is_enabled() {
            return;
        }
        if env.is_prompt_dismissed(SESSION) {
            env.log("[OMP Watcher] Prompt was dismissed by user, skipping popApp.");
            return;
        }
        let now = env.now_ms();
        if now - self.last_pop_time < POP_DEBOUNCE_MS {
            return; // duplicate pop request
        }
        self.last_pop_time = now;
        env.pop_app(&PopRequest { session: SESSION.into(), terminal: None, prompt_time: None, parent_pid: std::process::id() });
    }

    /// Ends the open turn after `delay` ms with no agent activity; any activity cancels it (see `process_line`).
    fn schedule_turn_end(&mut self, delay: i64, env: &mut dyn Env) {
        self.finish_at = Some(env.now_ms() + delay);
    }

    fn complete_turn(&mut self, env: &mut dyn Env) {
        self.is_working = false;
        self.finish_at = None;
        env.log("[OMP Watcher] OMP turn fully settled and complete!");
        env.clear_dismissal(SESSION);
        env.write_close_signal(SESSION);
        self.send(env, "task_completed", obj(vec![("model", self.model())]), false);
    }

    pub fn process_line(&mut self, line: &str, env: &mut dyn Env) {
        if line.trim().is_empty() {
            return;
        }
        self.last_output_at = env.now_ms();
        let Ok(entry) = serde_json::from_str::<Value>(line.trim()) else { return }; // malformed fragment

        let etype = entry.get("type").and_then(Value::as_str).unwrap_or("");
        let custom_type = entry.get("customType").and_then(Value::as_str).unwrap_or("");
        let message = entry.get("message");
        let role = message.and_then(|m| m.get("role")).and_then(Value::as_str).unwrap_or("");

        // Agent activity re-opens the turn: cancel a pending completion. Session metadata and injected
        // messages (model_change, session_exit, todo_hud_state...) do not.
        let is_activity = (etype == "message" && matches!(role, "user" | "assistant" | "toolResult"))
            || (etype == "custom" && custom_type == "tool_execution_start");
        if is_activity && self.finish_at.is_some() {
            self.finish_at = None;
            env.log("[OMP Watcher] Completion timer cancelled — new activity detected");
        }

        // 1. User prompt submitted: the task starts
        if etype == "message" && role == "user" {
            self.is_working = true;
            self.pending_tools = 0;
            let prompt_ts = env.now_ms();
            self.current_prompt_ts = prompt_ts;

            let mut prompt = String::new();
            match message.and_then(|m| m.get("content")) {
                Some(Value::String(s)) => prompt = s.clone(),
                Some(Value::Array(parts)) => {
                    let texts: Vec<String> = parts
                        .iter()
                        .filter(|p| p.get("type").and_then(Value::as_str) == Some("text"))
                        .map(|p| match p.get("text") {
                            None | Some(Value::Null) => String::new(),
                            Some(t) => js_string(t),
                        })
                        .collect();
                    prompt = texts.join(" ");
                }
                _ => {}
            }
            if js_len(&prompt) > 100 {
                prompt = js_slice(&prompt, 100) + "...";
            }

            env.log(&format!("[OMP Watcher] User prompt submitted! Starting task... ({})", prompt));
            self.send(
                env,
                "task_started",
                obj(vec![("model", self.model()), ("prompt", Value::String(prompt)), ("promptTime", Value::from(prompt_ts))]),
                false,
            );

            env.clear_dismissal(SESSION);
            if !env.is_prompt_dismissed(SESSION) {
                self.pop_app(env);
            } else {
                env.log("[OMP Watcher] Prompt was dismissed by user, skipping popApp.");
            }
            return;
        }

        // 2. Tool execution start: one more pending tool
        if etype == "custom" && custom_type == "tool_execution_start" {
            self.is_working = true;
            self.pending_tools += 1;
            let tool = match entry.get("data").and_then(|d| d.get("toolName")) {
                Some(t) if truthy(t) => t.clone(),
                _ => Value::String("tool".into()),
            };
            env.log(&format!("[OMP Watcher] Tool started: {} (pending: {})", js_string(&tool), self.pending_tools));
            self.send(env, "task_running", obj(vec![("tool", tool), ("model", self.model())]), false);
            return;
        }

        // 3. Tool result returned: one fewer pending tool
        if etype == "message" && role == "toolResult" {
            self.pending_tools = self.pending_tools.saturating_sub(1);
            self.is_working = true;
            env.log(&format!("[OMP Watcher] Tool finished (pending: {})", self.pending_tools));
            self.send(env, "task_running", obj(vec![("model", self.model())]), false);
            return;
        }

        // 4. Metadata and injected messages are not agent output: they never open or close a turn.
        //    A session_exit ends an open turn, so it settles at once.
        if etype == "custom" && custom_type == "session_exit" {
            if self.is_working {
                self.schedule_turn_end(SETTLE_MS, env);
            }
            return;
        }
        if matches!(etype, "custom" | "custom_message" | "internal") {
            return;
        }

        // 5. Assistant message: its stopReason decides whether the turn can end
        if etype == "message" && role == "assistant" {
            let message = message.expect("role implies message");
            match message.get("model") {
                Some(Value::String(m)) if !m.is_empty() => self.current_model = format_model_name(m),
                Some(v) if truthy(v) => return, // not a string: the old code threw here and dropped the message
                _ => {}
            }
            self.is_working = true;

            let stop_reason = message.get("stopReason").and_then(Value::as_str).unwrap_or("");
            let has_tool_call = message
                .get("content")
                .and_then(Value::as_array)
                .map_or(false, |a| a.iter().any(|c| c.get("type").and_then(Value::as_str) == Some("toolCall")));
            // error and aborted cut the turn off: the tools they requested never run, so pending_tools does not gate them
            let cut_off = stop_reason == "error" || stop_reason == "aborted";

            if !cut_off && (stop_reason == "toolUse" || has_tool_call) {
                // The model is requesting another tool: it cannot be finished
                self.send(env, "task_running", obj(vec![("model", self.model())]), false);
                return;
            }
            if cut_off || (matches!(stop_reason, "stop" | "end_turn" | "length") && self.pending_tools == 0) {
                // OMP retries errors and compacts after length, usually within tens of seconds, so those wait longer
                let delay = if stop_reason == "error" || stop_reason == "length" { RETRY_SETTLE_MS } else { SETTLE_MS };
                self.schedule_turn_end(delay, env);
            } else {
                // Intermediate reasoning or thinking
                self.send(env, "task_running", obj(vec![("model", self.model())]), false);
            }
        }
    }

    /// Sessions created after this watcher started are read from byte 0; older ones start at EOF so old prompts never replay.
    fn start_offset_for(&self, file: &Path) -> std::io::Result<u64> {
        if let Some(o) = self.resume_offsets.get(file) {
            return Ok(*o);
        }
        let meta = fs::metadata(file)?;
        let born = meta.created().map(ms_of).unwrap_or(i64::MIN);
        Ok(if born >= self.started_at { 0 } else { meta.len() })
    }

    fn discover_session_file(&mut self, env: &mut dyn Env) -> std::io::Result<()> {
        self.last_discovery_at = env.now_ms();
        let Some(latest) = latest_session_file(&self.root) else { return Ok(()) };
        if self.active_file.as_ref() == Some(&latest) {
            return Ok(());
        }
        let offset = self.start_offset_for(&latest)?;
        if let Some(prev) = self.active_file.take() {
            self.resume_offsets.insert(prev, self.file_position - self.remainder.len() as u64);
        }
        env.log(&format!(
            "[OMP Watcher] Tailing session: {} at byte {}",
            latest.file_name().map(|n| n.to_string_lossy().into_owned()).unwrap_or_default(),
            offset
        ));
        self.active_file = Some(latest);
        self.file_position = offset;
        self.remainder.clear();
        Ok(())
    }

    fn check_file_updates(&mut self, env: &mut dyn Env) {
        if env.now_ms() - self.last_discovery_at >= DISCOVERY_MS {
            // the sessions root may be briefly unreadable; retried on the next discovery
            let _ = self.discover_session_file(env);
        }
        let Some(active) = self.active_file.clone() else { return };
        let Ok(meta) = fs::metadata(&active) else { return };
        if meta.len() <= self.file_position {
            return;
        }
        let want = meta.len() - self.file_position;
        let mut buf = Vec::with_capacity(want as usize);
        let read = fs::File::open(&active).and_then(|mut f| {
            f.seek(SeekFrom::Start(self.file_position))?;
            f.take(want).read_to_end(&mut buf)
        });
        let Ok(n) = read else { return }; // transient I/O errors are retried on the next tick
        self.file_position += n as u64;

        let mut chunk = std::mem::take(&mut self.remainder);
        chunk.extend_from_slice(&buf);
        let mut lines: Vec<Vec<u8>> = chunk.split(|b| *b == b'\n').map(<[u8]>::to_vec).collect();
        self.remainder = lines.pop().unwrap_or_default();
        for mut line in lines {
            if line.last() == Some(&b'\r') {
                line.pop();
            }
            self.process_line(&String::from_utf8_lossy(&line), env);
        }
    }

    /// While a turn is open, repeat task_running so the bridge's 20 s watchdog does not close a silent tool run.
    fn send_heartbeat(&mut self, env: &mut dyn Env) {
        if !self.is_working || env.now_ms() - self.last_output_at > self.max_silent_ms {
            return;
        }
        self.send(env, "task_running", obj(vec![("model", self.model())]), true);
    }
}

impl Watcher for OmpWatcher {
    fn poll(&mut self, env: &mut dyn Env) {
        self.check_file_updates(env);
    }

    fn deadline(&self) -> Option<i64> {
        Some(self.finish_at.map_or(self.next_heartbeat, |f| f.min(self.next_heartbeat)))
    }

    fn fire(&mut self, env: &mut dyn Env) {
        let now = env.now_ms();
        if let Some(due) = self.finish_at {
            if now >= due {
                self.complete_turn(env);
            }
        }
        if now >= self.next_heartbeat {
            self.send_heartbeat(env);
            self.next_heartbeat += HEARTBEAT_MS;
            if self.next_heartbeat <= now {
                self.next_heartbeat = now + HEARTBEAT_MS;
            }
        }
    }
}

pub fn sessions_root() -> PathBuf {
    common::env_path_or("WAITPLAY_OMP_SESSIONS_DIR", || common::home_dir().join(".omp").join("agent").join("sessions"))
}

pub fn max_silent_ms() -> i64 {
    std::env::var("OMP_WATCH_MAX_SILENT_MS").ok().and_then(|v| common::parse_int(&v)).unwrap_or(600_000)
}

pub fn run_watch() -> ! {
    let mut env = RealEnv::new("omp", SESSION);
    let mut watcher = OmpWatcher::new(sessions_root(), max_silent_ms(), env.now_ms());
    println!("[OMP Watcher] Started! Monitoring OMP session activity...");
    run_loop(POLL_MS, &mut watcher, &mut env)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::env::mock::MockEnv;
    use serde_json::json;

    fn watcher(env: &MockEnv) -> OmpWatcher {
        OmpWatcher::new(PathBuf::from("."), 600_000, env.now)
    }

    fn feed(w: &mut OmpWatcher, env: &mut MockEnv, v: Value) {
        w.process_line(&v.to_string(), env);
    }

    fn user(text: &str) -> Value {
        json!({"type": "message", "message": {"role": "user", "content": [{"type": "text", "text": text}]}})
    }
    fn assistant(stop: &str, content: Value) -> Value {
        json!({"type": "message", "message": {"role": "assistant", "model": "anthropic/claude-sonnet-4", "stopReason": stop, "content": content}})
    }
    fn tool_start(name: &str) -> Value {
        json!({"type": "custom", "customType": "tool_execution_start", "data": {"toolName": name}})
    }
    fn tool_result() -> Value {
        json!({"type": "message", "message": {"role": "toolResult", "content": []}})
    }

    #[test]
    fn model_names() {
        assert_eq!(format_model_name("google/gemini-3.8-flash"), "Gemini 3.8 Flash");
        assert_eq!(format_model_name("claude-opus-4"), "Claude 3 Opus");
        assert_eq!(format_model_name("vendor/some-model"), "some-model");
        assert_eq!(format_model_name(""), "Gemini 3.8 Flash");
    }

    #[test]
    fn full_turn_with_tool() {
        let mut env = MockEnv::new();
        let mut w = watcher(&env);
        feed(&mut w, &mut env, user("Refactor auth"));
        assert_eq!(env.events(), ["task_started"]);
        assert_eq!(env.data(0)["prompt"], "Refactor auth");
        assert_eq!(env.data(0)["model"], "Gemini 3.8 Flash");
        assert_eq!(env.data(0)["promptTime"], env.now);
        assert!(env.posts[0].1.is_none(), "omp events carry the model in data only");
        assert_eq!(env.pops.len(), 1);
        assert_eq!(env.pops[0].session, "omp-session");

        feed(&mut w, &mut env, assistant("toolUse", json!([{"type": "toolCall", "name": "bash"}])));
        feed(&mut w, &mut env, tool_start("bash"));
        assert_eq!(w.pending_tools, 1);
        assert_eq!(env.data(2), json!({"tool": "bash", "model": "Claude 3.7 Sonnet"}));
        feed(&mut w, &mut env, tool_result());
        assert_eq!(w.pending_tools, 0);
        feed(&mut w, &mut env, assistant("stop", json!([{"type": "text", "text": "Done"}])));
        assert_eq!(w.deadline(), Some(env.now + 1500).map(|d| d.min(w.next_heartbeat)));

        env.advance(1500);
        w.fire(&mut env);
        assert_eq!(env.events().last(), Some(&"task_completed"));
        let n = env.calls.len();
        assert_eq!(&env.calls[n - 3..], ["clear_dismissal:omp-session", "close:omp-session", "post:task_completed"]);
        assert!(!w.is_working);
    }

    #[test]
    fn stop_with_pending_tools_does_not_end_the_turn() {
        let mut env = MockEnv::new();
        let mut w = watcher(&env);
        feed(&mut w, &mut env, user("go"));
        feed(&mut w, &mut env, tool_start("read"));
        feed(&mut w, &mut env, assistant("stop", json!([])));
        assert_eq!(w.finish_at, None);
        assert_eq!(env.events().last(), Some(&"task_running")); // intermediate reasoning
    }

    #[test]
    fn error_waits_two_minutes_and_activity_cancels_it() {
        let mut env = MockEnv::new();
        let mut w = watcher(&env);
        feed(&mut w, &mut env, user("go"));
        feed(&mut w, &mut env, assistant("error", json!([{"type": "toolCall"}])));
        assert_eq!(w.finish_at, Some(env.now + 120_000));
        feed(&mut w, &mut env, json!({"type": "custom", "customType": "todo_hud_state"}));
        assert!(w.finish_at.is_some(), "metadata is not activity");
        feed(&mut w, &mut env, assistant("toolUse", json!([])));
        assert_eq!(w.finish_at, None);

        feed(&mut w, &mut env, assistant("aborted", json!([])));
        assert_eq!(w.finish_at, Some(env.now + 1500));
        feed(&mut w, &mut env, assistant("length", json!([])));
        assert_eq!(w.finish_at, Some(env.now + 120_000));
    }

    #[test]
    fn session_exit_settles_only_an_open_turn() {
        let mut env = MockEnv::new();
        let mut w = watcher(&env);
        feed(&mut w, &mut env, json!({"type": "custom", "customType": "session_exit"}));
        assert_eq!(w.finish_at, None);
        feed(&mut w, &mut env, user("go"));
        feed(&mut w, &mut env, json!({"type": "custom", "customType": "session_exit"}));
        assert_eq!(w.finish_at, Some(env.now + 1500));
    }

    #[test]
    fn ignored_and_malformed_lines() {
        let mut env = MockEnv::new();
        let mut w = watcher(&env);
        w.process_line("", &mut env);
        w.process_line("   ", &mut env);
        w.process_line("{not json", &mut env);
        for t in ["session", "model_change", "custom_message", "internal"] {
            feed(&mut w, &mut env, json!({"type": t}));
        }
        assert!(env.posts.is_empty());
        assert!(!w.is_working);
        // a garbage line still counts as output for the silence timer
        assert_eq!(w.last_output_at, env.now);
    }

    #[test]
    fn long_prompt_is_cut_and_string_content_works() {
        let mut env = MockEnv::new();
        let mut w = watcher(&env);
        feed(&mut w, &mut env, json!({"type": "message", "message": {"role": "user", "content": "z".repeat(130)}}));
        assert_eq!(env.data(0)["prompt"], format!("{}...", "z".repeat(100)));
        feed(
            &mut w,
            &mut env,
            json!({"type": "message", "message": {"role": "user", "content": [{"type": "text", "text": "a"}, {"type": "image"}, {"type": "text", "text": "b"}]}}),
        );
        assert_eq!(env.data(1)["prompt"], "a b");
    }

    #[test]
    fn popup_is_debounced_and_respects_switches() {
        let mut env = MockEnv::new();
        let mut w = watcher(&env);
        feed(&mut w, &mut env, user("one"));
        env.advance(500);
        feed(&mut w, &mut env, user("two"));
        assert_eq!(env.pops.len(), 1, "second pop inside 1.5 s is dropped");
        env.advance(1500);
        feed(&mut w, &mut env, user("three"));
        assert_eq!(env.pops.len(), 2);

        let mut env = MockEnv::new();
        env.enabled = false;
        let mut w = watcher(&env);
        feed(&mut w, &mut env, user("x"));
        assert_eq!(env.events(), ["task_started"]);
        assert!(env.pops.is_empty());
    }

    #[test]
    fn heartbeat_only_while_working_and_not_silent_too_long() {
        let mut env = MockEnv::new();
        let mut w = OmpWatcher::new(PathBuf::from("."), 10_000, env.now);
        env.advance(5000);
        w.fire(&mut env);
        assert!(env.posts.is_empty(), "idle: no heartbeat");
        feed(&mut w, &mut env, user("go"));
        env.advance(5000);
        w.fire(&mut env);
        assert_eq!(env.events(), ["task_started", "task_running"]);
        assert_eq!(env.logs.iter().filter(|l| l.contains("Event -> task_running")).count(), 0, "heartbeats are quiet");
        env.advance(5000);
        w.fire(&mut env);
        env.advance(5000); // 15 s since the last output, limit 10 s
        w.fire(&mut env);
        assert_eq!(env.events().iter().filter(|e| **e == "task_running").count(), 2);
    }

    #[test]
    fn tails_a_session_directory_and_resumes_offsets() {
        let root = std::env::temp_dir().join(format!("waitplay-omp-test-{}", std::process::id()));
        let _ = fs::remove_dir_all(&root);
        let proj = root.join("-proj");
        fs::create_dir_all(&proj).unwrap();
        let old = proj.join("2026-01-01_old.jsonl");
        fs::write(&old, format!("{}\n", user("history"))).unwrap();
        std::thread::sleep(std::time::Duration::from_millis(30));

        let mut env = MockEnv::new();
        env.now = ms_of(SystemTime::now());
        let mut w = OmpWatcher::new(root.clone(), 600_000, env.now);
        w.poll(&mut env);
        assert!(env.posts.is_empty(), "history of an older session is skipped");
        assert_eq!(w.active_file.as_deref(), Some(old.as_path()));

        // append a split line: the partial tail waits for its newline
        let line = user("hello there").to_string();
        let (a, b) = line.split_at(20);
        let mut f = fs::OpenOptions::new().append(true).open(&old).unwrap();
        use std::io::Write;
        f.write_all(a.as_bytes()).unwrap();
        w.poll(&mut env);
        assert!(env.posts.is_empty());
        f.write_all(b.as_bytes()).unwrap();
        f.write_all(b"\r\n").unwrap();
        w.poll(&mut env);
        assert_eq!(env.events(), ["task_started"]);
        assert_eq!(env.data(0)["prompt"], "hello there");

        // a brand new session file (created after the watcher started) is read from byte 0
        std::thread::sleep(std::time::Duration::from_millis(30));
        let fresh = proj.join("2026-02-02_new.jsonl");
        fs::write(&fresh, format!("{}\n", user("fresh prompt"))).unwrap();
        env.advance(1500); // let discovery run again
        w.poll(&mut env);
        assert_eq!(w.active_file.as_deref(), Some(fresh.as_path()));
        assert_eq!(env.events(), ["task_started", "task_started"]);
        assert_eq!(env.data(1)["prompt"], "fresh prompt");
        let _ = fs::remove_dir_all(&root);
    }

    /// Fixture from a real OMP session log of this machine (read-only), if present.
    #[test]
    fn replays_a_real_session_log_without_panicking() {
        let root = common::home_dir().join(".omp").join("agent").join("sessions");
        let Some(file) = latest_session_file(&root) else { return };
        let Ok(text) = fs::read_to_string(&file) else { return };
        let mut env = MockEnv::new();
        let mut w = watcher(&env);
        for line in text.lines().take(5000) {
            w.process_line(line, &mut env);
        }
        // every user message in the log must have produced exactly one task_started
        let users = text
            .lines()
            .take(5000)
            .filter_map(|l| serde_json::from_str::<Value>(l.trim()).ok())
            .filter(|e| e["type"] == "message" && e["message"]["role"] == "user")
            .count();
        assert_eq!(env.events().iter().filter(|e| **e == "task_started").count(), users);
    }
}
