//! The macOS menu-bar application: tray icon, floating widget, settings window, hotkeys, login item, integrations.
//!
//! Everything that is pure logic (status derivation, menu content, settings of integrations, geometry) lives in modules that also
//! compile and run their unit tests on other systems; the AppKit-facing code is macOS only.
#![allow(dead_code)]

pub mod icons;
pub mod integrations;
pub mod login_item;
pub mod menu_model;
pub mod permissions;
pub mod status;

#[cfg(target_os = "macos")]
pub mod app;
