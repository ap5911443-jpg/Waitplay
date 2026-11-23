//! The ON/OFF switch (`.waitplay-enabled.json`), shared by the widget, the hooks and the bridge.
//!
//! Written to two places so that a process with a different `TEMP` still sees it: `<temp>/waitplay` and the repo root.
//! The newest `updatedAt` wins. Missing or unreadable means enabled.

use crate::paths;
use serde_json::{json, Value};
use std::fs;
use std::path::PathBuf;

const FILE: &str = ".waitplay-enabled.json";

fn locations() -> Vec<PathBuf> {
    let mut v = vec![paths::signal_dir().join(FILE)];
    if let Some(root) = paths::repo_root() {
        v.push(root.join(FILE));
    }
    v
}

pub fn is_enabled() -> bool {
    let mut newest: Option<(i64, bool)> = None;
    for p in locations() {
        let Ok(text) = fs::read_to_string(&p) else { continue };
        let Ok(v) = serde_json::from_str::<Value>(&text) else { continue };
        let Some(enabled) = v.get("enabled").and_then(Value::as_bool) else { continue };
        let at = v.get("updatedAt").and_then(Value::as_i64).unwrap_or(0);
        if newest.map_or(true, |(t, _)| at > t) {
            newest = Some((at, enabled));
        }
    }
    newest.map_or(true, |(_, e)| e)
}

/// Persists the switch. Does not tell the bridge; use `BridgeClient::post_state` for that.
pub fn set_enabled(enabled: bool) {
    let body = serde_json::to_vec_pretty(&json!({ "enabled": enabled, "updatedAt": crate::protocol::now_ms() })).unwrap_or_default();
    for p in locations() {
        let _ = paths::write_atomic(&p, &body);
    }
}

pub fn toggle() -> bool {
    let next = !is_enabled();
    set_enabled(next);
    next
}
