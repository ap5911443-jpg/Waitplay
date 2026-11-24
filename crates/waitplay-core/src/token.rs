//! Bridge authentication token: where the bridge publishes it and where clients look for it.
//!
//! There is exactly one place, the per-user signal directory (`<temp>/waitplay/.bridge-token`, owner-only). Clients never read a
//! token from the current directory or from the source tree: a file in an arbitrary folder could be planted by another program.

use crate::paths;
use std::fs;
use std::path::PathBuf;

const FILE: &str = ".bridge-token";

/// The one file the bridge writes and clients read.
pub fn token_file() -> PathBuf {
    paths::signal_dir().join(FILE)
}

/// `BRIDGE_AUTH_TOKEN`, else the token file; empty when there is none.
pub fn find_token() -> String {
    if let Ok(t) = std::env::var("BRIDGE_AUTH_TOKEN") {
        let t = t.trim();
        if !t.is_empty() {
            return t.to_string();
        }
    }
    match fs::read_to_string(token_file()) {
        Ok(t) => t.trim().to_string(),
        Err(_) => String::new(),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn the_token_comes_from_the_signal_directory_only() {
        assert_eq!(token_file(), paths::signal_dir().join(".bridge-token"));
    }
}
