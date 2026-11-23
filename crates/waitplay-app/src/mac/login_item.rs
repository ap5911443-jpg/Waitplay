//! Launch at login through a per-user LaunchAgent (`~/Library/LaunchAgents/com.waitplay.app.plist`), the documented mechanism that
//! needs no helper process. One file named after the label means enabling twice can never create two entries; it is rewritten on
//! every start when the app was moved or updated, so the login item always points at the app that is actually installed.

use std::path::{Path, PathBuf};

pub const LABEL: &str = "com.waitplay.app";

pub fn agent_path(home: &Path) -> PathBuf {
    home.join("Library").join("LaunchAgents").join(format!("{}.plist", LABEL))
}

fn xml_escape(s: &str) -> String {
    s.replace('&', "&amp;").replace('<', "&lt;").replace('>', "&gt;").replace('"', "&quot;").replace('\'', "&apos;")
}

pub fn plist(exe: &Path) -> String {
    format!(
        "<?xml version=\"1.0\" encoding=\"UTF-8\"?>\n\
<!DOCTYPE plist PUBLIC \"-//Apple//DTD PLIST 1.0//EN\" \"http://www.apple.com/DTDs/PropertyList-1.0.dtd\">\n\
<plist version=\"1.0\">\n\
<dict>\n\
\t<key>Label</key>\n\t<string>{label}</string>\n\
\t<key>ProgramArguments</key>\n\t<array>\n\t\t<string>{exe}</string>\n\t</array>\n\
\t<key>RunAtLoad</key>\n\t<true/>\n\
\t<key>LimitLoadToSessionType</key>\n\t<string>Aqua</string>\n\
\t<key>ProcessType</key>\n\t<string>Interactive</string>\n\
</dict>\n\
</plist>\n",
        label = LABEL,
        exe = xml_escape(&exe.to_string_lossy())
    )
}

pub fn is_enabled(home: &Path) -> bool {
    agent_path(home).is_file()
}

/// Makes the login item match `enabled`. `Ok(changed)`.
pub fn sync(home: &Path, enabled: bool, exe: &Path) -> Result<bool, String> {
    let path = agent_path(home);
    if enabled {
        let want = plist(exe);
        if std::fs::read_to_string(&path).map(|t| t == want).unwrap_or(false) {
            return Ok(false);
        }
        waitplay_core::paths::write_atomic(&path, want.as_bytes()).map_err(|e| format!("cannot write {}: {}", path.display(), e))?;
        Ok(true)
    } else if path.exists() {
        std::fs::remove_file(&path).map_err(|e| format!("cannot remove {}: {}", path.display(), e))?;
        Ok(true)
    } else {
        Ok(false)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn enable_is_idempotent_and_disable_removes_the_file() {
        let home = std::env::temp_dir().join(format!("wp-login-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&home);
        let exe = Path::new("/Applications/WaitPlay.app/Contents/MacOS/waitplay");
        assert_eq!(sync(&home, true, exe), Ok(true));
        assert!(is_enabled(&home));
        assert_eq!(sync(&home, true, exe), Ok(false), "no duplicate, no rewrite");
        // the app moved: the entry follows it
        let moved = Path::new("/Users/me/Applications/WaitPlay.app/Contents/MacOS/waitplay");
        assert_eq!(sync(&home, true, moved), Ok(true));
        assert!(std::fs::read_to_string(agent_path(&home)).unwrap().contains("/Users/me/Applications"));
        assert_eq!(sync(&home, false, moved), Ok(true));
        assert!(!is_enabled(&home));
        assert_eq!(sync(&home, false, moved), Ok(false));
        let _ = std::fs::remove_dir_all(&home);
    }

    #[test]
    fn plist_escapes_the_path_and_is_well_formed_enough() {
        let p = plist(Path::new("/Apps/A&B <x>/waitplay"));
        assert!(p.contains("/Apps/A&amp;B &lt;x&gt;/waitplay"));
        assert!(p.contains("<key>RunAtLoad</key>"));
        assert_eq!(p.matches("<dict>").count(), 1);
    }
}
