//! Which entertainment sites are signed in, and signing out of them.
//!
//! The logins live in the entertainment window's browser profile (`profile::resolve`), and only processes that run the entertainment
//! window's own webview setup may touch it: a webview opened by the tray app on the same profile fights the entertainment window's
//! browser process and leaves its pages black. So the tray app never opens one. Instead:
//!
//! - the entertainment window (and, when none is open, a short-lived hidden helper: `waitplay --logins`) looks for each site's session
//!   cookie (names only, never values) and writes the answer next to the profile, in `vibeplay-logins.json`;
//! - signing out is the same helper (`waitplay --logout=<site>`), which deletes the site's cookies and writes the new answer;
//! - the tray app only reads that file, and starts a helper when the file is missing or old.

use crate::companion::webview2;
use crate::{wp_info, wp_warn};
use std::collections::BTreeMap;
use std::path::{Path, PathBuf};
use std::time::{Duration, Instant};
use tao::dpi::LogicalSize;
use tao::event_loop::EventLoop;
use tao::platform::windows::WindowBuilderExtWindows;
use tao::window::WindowBuilder;
use waitplay_core::{now_ms, process};
use wry::{WebContext, WebView, WebViewBuilder};

/// Site key, the addresses its cookies live under, and the cookies that exist only while someone is signed in.
const SITES: [(&str, &[&str], &[&str]); 3] = [
    ("instagram", &["https://www.instagram.com/"], &["sessionid"]),
    ("x", &["https://x.com/", "https://twitter.com/"], &["auth_token"]),
    ("youtube", &["https://www.youtube.com/", "https://accounts.google.com/", "https://www.google.com/"], &["SAPISID", "__Secure-3PAPISID", "SID", "__Secure-1PSID"]),
];

/// An answer older than this is refreshed by a helper.
const STALE: Duration = Duration::from_secs(8);

fn state_file(profile: &Path) -> PathBuf {
    profile.join("vibeplay-logins.json")
}

/// `site key -> signed in`, read from the cookies of the webview's profile.
pub fn detect(webview: &WebView) -> BTreeMap<&'static str, bool> {
    SITES
        .iter()
        .map(|(key, urls, names)| (*key, urls.iter().any(|u| webview.cookies_for_url(u).map(|c| c.iter().any(|c| names.contains(&c.name()))).unwrap_or(false))))
        .collect()
}

/// Saves the answer where the tray app looks for it.
pub fn write_state(profile: &Path, state: &BTreeMap<&'static str, bool>) {
    let mut v = serde_json::Map::new();
    for (k, on) in state {
        v.insert((*k).to_string(), serde_json::Value::Bool(*on));
    }
    v.insert("at".into(), serde_json::json!(now_ms()));
    let _ = waitplay_core::paths::write_atomic(&state_file(profile), serde_json::Value::Object(v).to_string().as_bytes());
}

/// Deletes every cookie under the site's addresses.
fn forget(webview: &WebView, key: &str) {
    let Some((_, urls, _)) = SITES.iter().find(|s| s.0 == key) else { return };
    for u in *urls {
        for c in webview.cookies_for_url(u).unwrap_or_default() {
            let _ = webview.delete_cookie(&c);
        }
    }
}

/// The helper process: `waitplay --logins` (check) or `waitplay --logout=<site>` (sign out, then check). Opens the profile exactly the
/// way the entertainment window does, writes the answer and exits.
pub fn run_helper(logout: Option<String>) {
    let event_loop = EventLoop::new();
    let profile = crate::profile::resolve();
    let mut context = WebContext::new(Some(profile.clone()));
    let window = match WindowBuilder::new().with_title("Vibe Play session check").with_visible(false).with_decorations(false).with_skip_taskbar(true).with_inner_size(LogicalSize::new(1.0, 1.0)).build(&event_loop) {
        Ok(w) => w,
        Err(e) => {
            wp_warn!("login check: window: {e}");
            return;
        }
    };
    let webview = match webview2::tune(WebViewBuilder::new_with_web_context(&mut context)).with_url("about:blank").build(&window) {
        Ok(w) => w,
        Err(e) => {
            wp_warn!("login check: webview: {e}");
            return;
        }
    };
    if let Some(key) = logout.as_deref() {
        forget(&webview, key);
        wp_info!("signed out of {}", key);
    }
    write_state(&profile, &detect(&webview));
    drop(webview);
    drop(window);
    drop(context);
    std::process::exit(0); // the browser flushes the profile as the last webview closes
}

/// The tray app's side: reads the file, starts a helper when it is missing or old.
#[derive(Default)]
pub struct Logins {
    profile: Option<PathBuf>,
    last_spawn: Option<Instant>,
}

impl Logins {
    fn profile(&mut self) -> PathBuf {
        self.profile.get_or_insert_with(crate::profile::resolve).clone()
    }

    fn spawn(&mut self, arg: String) {
        if let Ok(exe) = std::env::current_exe() {
            if let Err(e) = process::spawn_detached(&exe, &[arg]) {
                wp_warn!("login check could not start: {}", e);
            }
        }
        self.last_spawn = Some(Instant::now());
    }

    /// `site key -> signed in` from the last check, or `None` while there is none yet.
    pub fn state(&mut self) -> Option<BTreeMap<&'static str, bool>> {
        let file = state_file(&self.profile());
        let v: serde_json::Value = std::fs::read_to_string(&file).ok().and_then(|t| serde_json::from_str(&t).ok()).unwrap_or(serde_json::Value::Null);
        let age_ms = (now_ms() - v.get("at").and_then(serde_json::Value::as_i64).unwrap_or(0)).max(0) as u128;
        // never start a helper while an entertainment window is open (it writes the answer itself) or is just being opened
        let window_open = !waitplay_core::companion_state::live().is_empty();
        if age_ms > STALE.as_millis() && !window_open && self.last_spawn.map_or(true, |t| t.elapsed() > Duration::from_secs(6)) {
            self.spawn("--logins".into());
        }
        v.is_object().then(|| SITES.iter().map(|(k, _, _)| (*k, v.get(*k).and_then(serde_json::Value::as_bool).unwrap_or(false))).collect())
    }

    /// An entertainment window is about to open: no helper for the next 20 seconds, so the two never start the browser together.
    pub fn pause(&mut self) {
        self.last_spawn = Some(Instant::now() + Duration::from_secs(14));
    }

    /// Signs the site out of Vibe Play's browser (a helper does it; the next `state` shows the result).
    pub fn log_out(&mut self, key: &str) {
        if SITES.iter().any(|s| s.0 == key) {
            self.spawn(format!("--logout={}", key));
        }
    }
}
