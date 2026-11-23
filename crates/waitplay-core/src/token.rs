//! Bridge authentication token: where the bridge publishes it and where clients look for it.

use crate::paths;
use std::fs;
use std::path::PathBuf;

const FILE: &str = ".bridge-token";

/// Every place a token may have been written, best first. The bridge writes the first one.
pub fn token_locations() -> Vec<PathBuf> {
    let mut v = vec![paths::signal_dir().join(FILE)];
    if let Ok(cwd) = std::env::current_dir() {
        v.push(cwd.join("waitplay").join(FILE));
        v.push(cwd.join(FILE));
    }
    if let Some(root) = paths::repo_root() {
        v.push(root.join(FILE));
        v.push(root.join("apps").join("bridge").join(FILE));
    }
    v
}

/// `BRIDGE_AUTH_TOKEN`, else the first readable token file; empty when there is none.
pub fn find_token() -> String {
    if let Ok(t) = std::env::var("BRIDGE_AUTH_TOKEN") {
        let t = t.trim();
        if !t.is_empty() {
            return t.to_string();
        }
    }
    for p in token_locations() {
        if let Ok(t) = fs::read_to_string(&p) {
            let t = t.trim();
            if !t.is_empty() {
                return t.to_string();
            }
        }
    }
    String::new()
}
