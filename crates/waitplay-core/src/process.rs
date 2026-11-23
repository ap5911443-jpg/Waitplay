//! Starting helper processes without a console window or a tie to the caller's lifetime.

use std::path::Path;
use std::process::{Child, Command, Stdio};

#[cfg(windows)]
const DETACHED_PROCESS: u32 = 0x0000_0008;
#[cfg(windows)]
const CREATE_NEW_PROCESS_GROUP: u32 = 0x0000_0200;
#[cfg(windows)]
const CREATE_NO_WINDOW: u32 = 0x0800_0000;

/// Runs `exe args...` in the background: no console, no inherited stdio, survives the parent.
pub fn spawn_detached(exe: &Path, args: &[String]) -> std::io::Result<Child> {
    let mut cmd = Command::new(exe);
    cmd.args(args).stdin(Stdio::null()).stdout(Stdio::null()).stderr(Stdio::null());
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        cmd.creation_flags(DETACHED_PROCESS | CREATE_NEW_PROCESS_GROUP | CREATE_NO_WINDOW);
    }
    #[cfg(unix)]
    {
        use std::os::unix::process::CommandExt;
        cmd.process_group(0);
    }
    cmd.spawn()
}
