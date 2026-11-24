//! The Windows tray application: tray icon and menu, glass floating widget, settings window, global shortcuts, launch at login,
//! integrations. It mirrors the macOS menu-bar app (`mac`) feature for feature.
//!
//! The platform-independent logic is shared with macOS and NOT duplicated: status derivation and the tray menu content are the very
//! same source files (`mac/status.rs`, `mac/menu_model.rs`), pulled in with `#[path]` so both platforms always say the same thing.
//! Only what differs on Windows lives here: Win32 glass and frame handling, the Run-key login item, the Windows permissions page, the
//! agent folder names and hook command quoting, and the pages (`win_widget.html`, `win_settings.html`).
#![allow(dead_code)]

pub mod app;
pub mod icons;
pub mod integrations;
pub mod login_item;
pub mod native;
#[path = "../mac/menu_model.rs"]
pub mod menu_model;
pub mod permissions;
#[path = "../mac/status.rs"]
pub mod status;
