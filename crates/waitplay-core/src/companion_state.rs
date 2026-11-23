//! What a running companion window tells the menu-bar app: its process and whether the page is on screen.
//! `<temp>/waitplay/.waitplay-companion-<site>.json`, written on every visibility change and removed on exit.

use crate::paths;
use crate::protocol::now_ms;
use serde_json::{json, Value};
use std::path::PathBuf;

/// A state file older than this with no live process is stale (crash).
const MAX_AGE_MS: i64 = 12 * 60 * 60 * 1000;

#[derive(Clone, Debug, PartialEq)]
pub struct CompanionState {
    pub site: String,
    pub pid: u32,
    pub visible: bool,
    pub ts: i64,
}

fn file(site: &str) -> PathBuf {
    paths::signal_dir().join(format!(".waitplay-companion-{}.json", crate::signals::signal_file_id(site)))
}

pub fn write(site: &str, visible: bool) {
    let body = json!({ "site": site, "pid": std::process::id(), "visible": visible, "ts": now_ms() }).to_string();
    let _ = paths::write_atomic(&file(site), body.as_bytes());
}

pub fn remove(site: &str) {
    let _ = std::fs::remove_file(file(site));
}

pub fn parse(text: &str) -> Option<CompanionState> {
    let v: Value = serde_json::from_str(text).ok()?;
    Some(CompanionState {
        site: v.get("site")?.as_str()?.to_string(),
        pid: u32::try_from(v.get("pid")?.as_u64()?).ok()?,
        visible: v.get("visible")?.as_bool()?,
        ts: v.get("ts")?.as_i64()?,
    })
}

#[cfg(unix)]
fn process_alive(pid: u32) -> bool {
    // SAFETY: signal 0 only checks that the process exists.
    let r = unsafe { libc::kill(pid as libc::pid_t, 0) };
    r == 0 || std::io::Error::last_os_error().raw_os_error() == Some(libc::EPERM)
}

#[cfg(not(unix))]
fn process_alive(_pid: u32) -> bool {
    true // age check only
}

/// The live companions' states (stale files of crashed processes are ignored).
pub fn live() -> Vec<CompanionState> {
    let Ok(dir) = std::fs::read_dir(paths::signal_dir()) else { return Vec::new() };
    let now = now_ms();
    dir.flatten()
        .filter(|e| e.file_name().to_string_lossy().starts_with(".waitplay-companion-"))
        .filter_map(|e| parse(&std::fs::read_to_string(e.path()).ok()?))
        .filter(|s| now - s.ts < MAX_AGE_MS && process_alive(s.pid))
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_what_it_writes_and_rejects_garbage() {
        let s = parse(r#"{"site":"x","pid":42,"visible":true,"ts":7}"#).unwrap();
        assert_eq!(s, CompanionState { site: "x".into(), pid: 42, visible: true, ts: 7 });
        assert!(parse("{").is_none());
        assert!(parse(r#"{"site":"x","pid":-1,"visible":true,"ts":7}"#).is_none());
        assert!(parse(r#"{"site":"x","pid":1}"#).is_none());
    }
}
