//! What an account carries from one sign-in to the next, shared by the macOS and Windows apps.
//!
//! - the setup-guide marker (`onboarded`): the guide shows until it was finished or skipped once on this PC;
//! - the preferences saved to the account (`user_preferences`): which settings follow an account to another PC, and how a saved copy
//!   is applied. Device-specific settings (start at login, the custom sound file, which agent watchers run) and anything secret (a
//!   password, a token, a site login) never go into it.

use serde_json::{Map, Value};
use std::path::PathBuf;
use waitplay_core::settings::Settings;

/// Whether this run may use the app without an account. Only the separate `--features test-hooks` build can ever say yes (the smoke
/// test cannot sign in); the shipped binary does not even contain the variable's name.
pub fn skip_account_gate() -> bool {
    #[cfg(feature = "test-hooks")]
    {
        std::env::var("WAITPLAY_TEST_SKIP_ACCOUNT").is_ok_and(|v| v == "1")
    }
    #[cfg(not(feature = "test-hooks"))]
    {
        false
    }
}

fn onboarded_file() -> PathBuf {
    waitplay_core::paths::app_support_dir().join("onboarded")
}

/// The setup guide was finished or skipped on this PC.
pub fn load_onboarded() -> bool {
    onboarded_file().exists()
}

pub fn save_onboarded(done: bool) {
    if done {
        let _ = waitplay_core::paths::write_atomic(&onboarded_file(), b"1");
    } else {
        let _ = std::fs::remove_file(onboarded_file());
    }
}

/// The settings that follow an account (see the module doc).
pub const SYNCED_KEYS: [&str; 21] = [
    "appearance", "widgetPosition", "widgetCompact", "widgetShowStatus", "platforms", "preferredPlatform", "onFinish", "shortcuts", "notifications",
    "notificationSecs", "soundMuted", "soundVolume", "soundName", "soundEvents", "mascot", "mascotIntensity", "mascotIdle", "mascotPointer",
    "reduceMotion", "autoStartAutomation", "showWidget",
];

pub fn synced_prefs(settings: &Settings) -> Value {
    let all = settings.to_json();
    let mut out = Map::new();
    for k in SYNCED_KEYS {
        if let Some(v) = all.get(k) {
            out.insert(k.to_string(), v.clone());
        }
    }
    Value::Object(out)
}

/// The part of a saved copy that may be applied: only keys that are synced settings (a saved copy from a newer or hostile source
/// cannot reach any other setting).
pub fn restore_patch(saved: &Value) -> Map<String, Value> {
    saved.as_object().into_iter().flatten().filter(|(k, _)| SYNCED_KEYS.contains(&k.as_str())).map(|(k, v)| (k.clone(), v.clone())).collect()
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn a_saved_copy_can_only_touch_synced_settings() {
        let saved = json!({"appearance": "light", "platforms": {"x": false}, "launchAtLogin": true, "soundCustomFile": "custom.wav", "watchers": ["codex"], "bogus": 1});
        let patch = restore_patch(&saved);
        assert_eq!(patch.len(), 2);
        assert!(patch.contains_key("appearance") && patch.contains_key("platforms"));
        assert!(restore_patch(&json!("not an object")).is_empty());
    }

    #[test]
    fn the_synced_copy_leaves_device_specific_settings_out() {
        let copy = synced_prefs(&Settings::default());
        let obj = copy.as_object().unwrap();
        for k in ["launchAtLogin", "soundCustomFile", "watchers"] {
            assert!(!obj.contains_key(k), "{k} must not sync");
        }
        assert!(obj.contains_key("appearance") && obj.contains_key("preferredPlatform"));
    }
}
