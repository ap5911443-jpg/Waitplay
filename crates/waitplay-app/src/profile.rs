//! Where the browser profile lives: every login is in it, so it must survive restarts, rebuilds and cleaner tools.
//!
//! Windows: `%LOCALAPPDATA%\WaitPlay\webview2` (the same folder the C# app used, so existing logins carry over).
//! macOS: `~/Library/Application Support/WaitPlay/webview2`; elsewhere `$XDG_DATA_HOME` or `~/.local/share`.
//! `WAITPLAY_PROFILE_DIR` overrides the location (portable installs, tests) and is used exactly as given.
//!
//! Each Vibe Play account has its own browser profile, so the Instagram / YouTube / X logins belong to the account, not to the PC: the
//! first account that signs in keeps the existing profile (so nothing is lost), every other account gets `profiles\<account id>`, and
//! while nobody is signed in a separate empty profile is used. Signing out and in again returns to the same profile. The site logins
//! never leave this PC; on another PC the account's preferences and plan follow it, and the sites are signed in again there.

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
    let default = default_dir();
    match account_dir(&default) {
        Some(dir) => {
            let _ = fs::create_dir_all(&dir);
            dir
        }
        None => adopt(&default, &legacy_dir()),
    }
}

/// The folder that says whose profile is in use (`active-account`) and who owns the default one (`profile-owner`).
fn account_root(default: &Path) -> PathBuf {
    default.parent().unwrap_or(default).to_path_buf()
}

fn read_trim(p: &Path) -> Option<String> {
    fs::read_to_string(p).ok().map(|s| s.trim().to_string()).filter(|s| !s.is_empty())
}

/// Account ids are UUIDs: letters, digits and dashes only, so the id can never be a path.
fn valid_id(id: &str) -> bool {
    (8..=64).contains(&id.len()) && id.chars().all(|c| c.is_ascii_alphanumeric() || c == '-')
}

/// `None`: no account was ever recorded, the default profile is used as before.
fn account_dir(default: &Path) -> Option<PathBuf> {
    let root = account_root(default);
    let who = read_trim(&root.join("active-account"))?;
    if who == "-" {
        return Some(root.join("profiles").join("signed-out").join("webview2"));
    }
    if !valid_id(&who) {
        return None;
    }
    if read_trim(&root.join("profile-owner")).as_deref() == Some(who.as_str()) {
        return Some(adopt(default, &legacy_dir()));
    }
    Some(root.join("profiles").join(&who).join("webview2"))
}

/// Records whose profile the entertainment windows use from now on: `Some(account id)` after a sign-in, `None` after a sign-out.
/// The first account ever recorded becomes the owner of the existing default profile.
pub fn set_active(account: Option<&str>) {
    set_active_in(&account_root(&default_dir()), account);
}

fn set_active_in(root: &Path, account: Option<&str>) {
    let _ = fs::create_dir_all(root);
    let value = match account {
        Some(id) if valid_id(id) => {
            if read_trim(&root.join("profile-owner")).is_none() {
                let _ = paths::write_atomic(&root.join("profile-owner"), id.as_bytes());
            }
            id
        }
        Some(_) => return,
        None => "-",
    };
    let _ = paths::write_atomic(&root.join("active-account"), value.as_bytes());
}

/// The app recorded that nobody is signed in. Only the account-enabled app writes this, so builds without an account service, and
/// machines where it never ran, are never "signed out".
#[cfg(any(target_os = "macos", test))]
pub fn signed_out() -> bool {
    signed_out_in(&account_root(&default_dir()))
}

#[cfg(any(target_os = "macos", test))]
fn signed_out_in(root: &Path) -> bool {
    read_trim(&root.join("active-account")).as_deref() == Some("-")
}

/// The WebKit data-store identifier of whoever is signed in, for macOS where a profile folder cannot be chosen (wry's
/// `with_data_store_identifier`, macOS 14 and later). `None`: use the default store (nobody recorded yet, or the account that owns the
/// original profile, so today's logins carry over). Every other account gets a store of its own; so does "signed out".
pub fn store_id() -> Option<[u8; 16]> {
    store_id_in(&account_root(&default_dir()))
}

fn store_id_in(root: &Path) -> Option<[u8; 16]> {
    let who = read_trim(&root.join("active-account"))?;
    if who == "-" {
        return Some(*b"vibeplay-signout");
    }
    if !valid_id(&who) || read_trim(&root.join("profile-owner")).as_deref() == Some(who.as_str()) {
        return None;
    }
    // an account id is a UUID: its 32 hex digits are the 16 bytes; anything else is hashed (FNV-1a, twice, different seeds)
    let hex: String = who.chars().filter(|c| *c != '-').collect();
    if hex.len() == 32 && hex.chars().all(|c| c.is_ascii_hexdigit()) {
        let mut out = [0u8; 16];
        for (i, b) in out.iter_mut().enumerate() {
            *b = u8::from_str_radix(&hex[i * 2..i * 2 + 2], 16).ok()?;
        }
        return Some(out);
    }
    let fnv = |seed: u64| who.bytes().fold(seed, |h, b| (h ^ b as u64).wrapping_mul(0x0000_0100_0000_01b3));
    let (a, b) = (fnv(0xcbf2_9ce4_8422_2325), fnv(0x8422_2325_cbf2_9ce4));
    let mut out = [0u8; 16];
    out[..8].copy_from_slice(&a.to_le_bytes());
    out[8..].copy_from_slice(&b.to_le_bytes());
    Some(out)
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
        // next to the test binary, not in TMPDIR: the poller tests rewrite TMPDIR for the whole process and delete that folder
        let p = std::env::current_exe().unwrap().parent().unwrap().join(format!("wp-adopt-{}-{}", tag, std::process::id()));
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
    fn every_account_gets_its_own_profile_and_signing_back_in_returns_to_it() {
        let r = scratch("acct");
        let default = r.join("WaitPlay").join("webview2");
        let root = account_root(&default);
        assert_eq!(account_dir(&default), None, "nobody recorded yet: the default profile, as before");
        set_active_in(&root, Some("aaaaaaaa-1111"));
        assert_eq!(account_dir(&default), Some(adopt(&default, &legacy_dir())), "the first account owns the existing profile");
        set_active_in(&root, Some("bbbbbbbb-2222"));
        assert_eq!(account_dir(&default), Some(root.join("profiles").join("bbbbbbbb-2222").join("webview2")));
        set_active_in(&root, None);
        assert_eq!(account_dir(&default), Some(root.join("profiles").join("signed-out").join("webview2")));
        set_active_in(&root, Some("aaaaaaaa-1111"));
        assert_eq!(account_dir(&default), Some(adopt(&default, &legacy_dir())), "back to the first account's profile");
        set_active_in(&root, Some("../evil"));
        assert_eq!(account_dir(&default), Some(adopt(&default, &legacy_dir())), "an id that is not an id changes nothing");
        let _ = fs::remove_dir_all(&r);
    }

    #[test]
    fn each_account_gets_its_own_webkit_store_and_the_owner_keeps_the_default() {
        let r = scratch("store");
        let root = r.join("WaitPlay");
        assert_eq!(store_id_in(&root), None, "nobody recorded: the default store");
        set_active_in(&root, Some("aaaaaaaa-1111-2222-3333-444444444444"));
        assert_eq!(store_id_in(&root), None, "the first account owns the default store");
        set_active_in(&root, Some("bbbbbbbb-1111-2222-3333-444444444444"));
        let b = store_id_in(&root).expect("a second account has its own store");
        assert_eq!(b[0], 0xbb);
        set_active_in(&root, Some("cccccccc-1111-2222-3333-444444444444"));
        assert_ne!(store_id_in(&root), Some(b));
        set_active_in(&root, None);
        assert_eq!(store_id_in(&root), Some(*b"vibeplay-signout"));
        set_active_in(&root, Some("aaaaaaaa-1111-2222-3333-444444444444"));
        assert_eq!(store_id_in(&root), None, "signing back in returns to the owner's store");
        let _ = fs::remove_dir_all(&r);
    }

    #[test]
    fn only_a_recorded_sign_out_counts_as_signed_out() {
        let r = scratch("gate");
        let root = r.join("WaitPlay");
        assert!(!signed_out_in(&root), "never recorded");
        set_active_in(&root, None);
        assert!(signed_out_in(&root));
        set_active_in(&root, Some("aaaaaaaa-1111"));
        assert!(!signed_out_in(&root));
        let _ = fs::remove_dir_all(&r);
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
