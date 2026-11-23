//! Where the browser profile lives: every login is in it, so it must survive restarts, rebuilds and cleaner tools.
//!
//! Windows: `%LOCALAPPDATA%\WaitPlay\webview2` (the same folder the C# app used, so existing logins carry over).
//! macOS: `~/Library/Application Support/WaitPlay/webview2`; elsewhere `$XDG_DATA_HOME` or `~/.local/share`.
//! `WAITPLAY_PROFILE_DIR` overrides the location (portable installs, tests) and is used exactly as given.

use std::fs::{self, File, OpenOptions};
use std::path::{Path, PathBuf};
use std::time::{Duration, Instant};
use waitplay_core::paths;

pub fn resolve() -> PathBuf {
    if let Ok(over) = std::env::var("WAITPLAY_PROFILE_DIR") {
        let over = over.trim();
        if !over.is_empty() {
            let p = PathBuf::from(over);
            let _ = fs::create_dir_all(&p);
            return p;
        }
    }
    adopt(&default_dir(), &legacy_dir())
}

fn default_dir() -> PathBuf {
    #[cfg(windows)]
    let base = std::env::var_os("LOCALAPPDATA").map(PathBuf::from).unwrap_or_else(std::env::temp_dir);
    #[cfg(target_os = "macos")]
    let base = std::env::var_os("HOME").map(|h| PathBuf::from(h).join("Library").join("Application Support")).unwrap_or_else(std::env::temp_dir);
    #[cfg(all(not(windows), not(target_os = "macos")))]
    let base = std::env::var_os("XDG_DATA_HOME")
        .map(PathBuf::from)
        .or_else(|| std::env::var_os("HOME").map(|h| PathBuf::from(h).join(".local").join("share")))
        .unwrap_or_else(std::env::temp_dir);
    base.join("WaitPlay").join("webview2")
}

/// Where very old builds kept the profile (inside the cleaned-up temp dir).
fn legacy_dir() -> PathBuf {
    paths::signal_dir().join("webview2")
}

/// Holds the cross-process migration lock: two companions starting together must not both migrate (the loser would end up
/// with an empty profile).
struct MigrationGate(Option<File>);

impl MigrationGate {
    fn acquire() -> MigrationGate {
        let dir = paths::ensure_signal_dir();
        let Ok(f) = OpenOptions::new().create(true).read(true).write(true).truncate(false).open(dir.join(".profile-migration.lock")) else {
            return MigrationGate(None);
        };
        let deadline = Instant::now() + Duration::from_secs(15);
        while Instant::now() < deadline {
            if f.try_lock().is_ok() {
                return MigrationGate(Some(f));
            }
            std::thread::sleep(Duration::from_millis(50));
        }
        MigrationGate(None)
    }
}

fn has_profile(dir: &Path) -> bool {
    dir.join("EBWebView").is_dir()
}

/// The folder to use: `dest`, with the old profile moved into it when `dest` has none yet. When the move is not possible yet
/// (a browser from the old build is still shutting down) the old folder itself, so the logins keep working this run.
pub fn adopt(dest: &Path, legacy: &Path) -> PathBuf {
    let _gate = MigrationGate::acquire();
    if !has_profile(dest) && has_profile(legacy) {
        // an empty folder left by an earlier run is in the way of the move; anything else is left alone
        if dest.is_dir() && fs::read_dir(dest).map(|mut d| d.next().is_none()).unwrap_or(false) {
            let _ = fs::remove_dir(dest);
        }
        if !dest.exists() {
            if let Some(parent) = dest.parent() {
                let _ = fs::create_dir_all(parent);
            }
            if fs::rename(legacy, dest).is_err() && legacy.exists() {
                return legacy.to_path_buf();
            }
        }
    }
    let _ = fs::create_dir_all(dest);
    dest.to_path_buf()
}

#[cfg(test)]
mod tests {
    use super::*;

    fn scratch(tag: &str) -> PathBuf {
        let p = std::env::temp_dir().join(format!("wp-adopt-{}-{}", tag, std::process::id()));
        let _ = fs::remove_dir_all(&p);
        fs::create_dir_all(&p).unwrap();
        p
    }

    fn make_profile(dir: &Path, tag: &str) {
        let net = dir.join("EBWebView").join("Default").join("Network");
        fs::create_dir_all(&net).unwrap();
        fs::write(net.join("Cookies"), tag).unwrap();
    }

    fn tag(dir: &Path) -> String {
        fs::read_to_string(dir.join("EBWebView").join("Default").join("Network").join("Cookies")).unwrap_or_default()
    }

    #[test]
    fn old_profile_moves_to_a_new_destination() {
        let r = scratch("1");
        let (d, l) = (r.join("new").join("webview2"), r.join("old").join("webview2"));
        make_profile(&l, "LOGIN-1");
        assert_eq!(adopt(&d, &l), d);
        assert_eq!(tag(&d), "LOGIN-1");
        assert!(!l.exists());
        let _ = fs::remove_dir_all(&r);
    }

    #[test]
    fn existing_destination_profile_wins_and_old_is_left_alone() {
        let r = scratch("2");
        let (d, l) = (r.join("new").join("webview2"), r.join("old").join("webview2"));
        make_profile(&d, "NEW");
        make_profile(&l, "OLD");
        assert_eq!(adopt(&d, &l), d);
        assert_eq!((tag(&d), tag(&l)), ("NEW".to_string(), "OLD".to_string()));
        let _ = fs::remove_dir_all(&r);
    }

    #[test]
    fn empty_destination_folder_does_not_block_the_move() {
        let r = scratch("3");
        let (d, l) = (r.join("new").join("webview2"), r.join("old").join("webview2"));
        fs::create_dir_all(&d).unwrap();
        make_profile(&l, "LOGIN-3");
        assert_eq!(adopt(&d, &l), d);
        assert_eq!(tag(&d), "LOGIN-3");
        assert!(!l.exists());
        let _ = fs::remove_dir_all(&r);
    }

    #[test]
    fn foreign_non_empty_destination_is_not_clobbered() {
        let r = scratch("5");
        let (d, l) = (r.join("new").join("webview2"), r.join("old").join("webview2"));
        fs::create_dir_all(&d).unwrap();
        fs::write(d.join("notes.txt"), "x").unwrap();
        make_profile(&l, "LOGIN-5");
        adopt(&d, &l);
        assert_eq!(tag(&l), "LOGIN-5");
        assert!(d.join("notes.txt").exists());
        let _ = fs::remove_dir_all(&r);
    }

    #[cfg(windows)]
    #[test]
    fn locked_old_profile_is_used_in_place_then_moved_once_unlocked() {
        let r = scratch("4");
        let (d, l) = (r.join("new").join("webview2"), r.join("old").join("webview2"));
        make_profile(&l, "LOGIN-4");
        // An open handle without delete sharing stops a directory rename on Windows
        let held = {
            use std::os::windows::fs::OpenOptionsExt;
            OpenOptions::new().read(true).share_mode(0).open(l.join("EBWebView").join("Default").join("Network").join("Cookies")).unwrap()
        };
        assert_eq!(adopt(&d, &l), l);
        assert_eq!(tag(&l).len(), 0, "file is locked for reads while held");
        assert!(!d.join("EBWebView").exists());
        drop(held);
        assert_eq!(tag(&l), "LOGIN-4");
        assert_eq!(adopt(&d, &l), d);
        assert_eq!(tag(&d), "LOGIN-4");
        assert!(!l.exists());
        let _ = fs::remove_dir_all(&r);
    }
}
