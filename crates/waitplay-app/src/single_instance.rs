//! One companion process per site. The lock is an exclusive file lock held for the life of the process, so the OS frees it on any
//! exit (crash included) and an isolated `TEMP` gives a fully isolated instance. Replaces the C# named mutex.

use std::fs::{File, OpenOptions};
use waitplay_core::paths;

pub struct Guard {
    _file: File,
}

/// `Some(guard)` when this process is now the only holder of `name`, `None` when another process already is.
pub fn acquire(name: &str) -> Option<Guard> {
    let dir = paths::ensure_signal_dir();
    let file = OpenOptions::new().create(true).read(true).write(true).truncate(false).open(dir.join(format!(".instance-{}.lock", name))).ok()?;
    match file.try_lock() {
        Ok(()) => Some(Guard { _file: file }),
        Err(_) => None,
    }
}

/// Instance name for a site: the default site keeps the plain name, as the C# mutex did.
pub fn name_for_site(site_key: &str) -> String {
    if site_key == crate::sites::DEFAULT_KEY {
        "companion".to_string()
    } else {
        format!("companion_{}", site_key)
    }
}
