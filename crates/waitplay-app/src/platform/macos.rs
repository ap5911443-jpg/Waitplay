//! macOS implementation of the platform contract (see `platform/mod.rs`).
//!
//! A `WindowId` on macOS is the PID of an application. macOS exposes no per-window id to other apps without the Screen Recording
//! permission, and Vibe Play does not need one: the companion shows while the application that hosts the agent's terminal is in
//! front. Nothing here needs Accessibility or Screen Recording: the frontmost application comes from `NSWorkspace`.
//!
//! Not provided on macOS (neutral answers, by design): terminal tab tracking and "typing in the terminal steps the window aside"
//! (both need the Accessibility permission, which Vibe Play does not ask for), window rectangles of other apps.

use super::{Rect, WindowId, NO_WINDOW};
use crate::placement::{LRect, Screen};
use objc2::rc::Retained;
use objc2::MainThreadMarker;
use objc2_app_kit::{NSApplicationActivationOptions, NSApplicationActivationPolicy, NSRunningApplication, NSScreen, NSWorkspace};
use std::process::Command;

pub fn current_pid() -> u32 {
    std::process::id()
}

fn running_app(pid: u32) -> Option<Retained<NSRunningApplication>> {
    if pid == 0 || pid > i32::MAX as u32 {
        return None;
    }
    NSRunningApplication::runningApplicationWithProcessIdentifier(pid as libc::pid_t)
}

/// The application in front. `NO_WINDOW` when there is none.
pub fn foreground_window() -> WindowId {
    match NSWorkspace::sharedWorkspace().frontmostApplication() {
        Some(app) => {
            let pid = app.processIdentifier();
            if pid > 0 {
                pid as WindowId
            } else {
                NO_WINDOW
            }
        }
        None => NO_WINDOW,
    }
}

pub fn is_window(id: WindowId) -> bool {
    if id == NO_WINDOW || id > i32::MAX as u64 {
        return false;
    }
    // SAFETY: signal 0 only tests for existence; EPERM still means the process exists.
    let r = unsafe { libc::kill(id as libc::pid_t, 0) };
    r == 0 || std::io::Error::last_os_error().raw_os_error() == Some(libc::EPERM)
}

pub fn is_minimized(_id: WindowId) -> bool {
    false
}

pub fn window_rect(_id: WindowId) -> Option<Rect> {
    None
}

pub fn window_pid(id: WindowId) -> u32 {
    if id <= u32::MAX as u64 {
        id as u32
    } else {
        0
    }
}

/// Brings that application to the front (the keyboard goes back to the user's terminal).
pub fn focus_window(id: WindowId) {
    if let Some(app) = running_app(window_pid(id)) {
        #[allow(deprecated)]
        let _ = app.activateWithOptions(NSApplicationActivationOptions::ActivateAllWindows);
    }
}

/// Own windows are shown and hidden through tao on macOS.
pub fn show_window(_id: WindowId, _activate: bool) {}
pub fn hide_window(_id: WindowId) {}

fn ps_field(pid: u32, field: &str) -> Option<String> {
    let out = Command::new("/bin/ps").args(["-o", &format!("{}=", field), "-p", &pid.to_string()]).output().ok()?;
    if !out.status.success() {
        return None;
    }
    let s = String::from_utf8_lossy(&out.stdout).trim().to_string();
    if s.is_empty() {
        None
    } else {
        Some(s)
    }
}

fn exe_name_of(pid: u32) -> Option<String> {
    // `comm` is the full executable path on macOS
    let path = ps_field(pid, "comm")?;
    path.rsplit('/').next().map(str::to_string)
}

/// Our own process, or another Vibe Play process (the widget or a companion of another site).
pub fn is_waitplay_window(id: WindowId) -> bool {
    let pid = window_pid(id);
    if pid == 0 {
        return false;
    }
    if pid == std::process::id() {
        return true;
    }
    let me = std::env::current_exe().ok().and_then(|p| p.file_name().map(|n| n.to_string_lossy().to_string()));
    match (me, exe_name_of(pid)) {
        (Some(me), Some(other)) => me == other,
        _ => false,
    }
}

/// Another Vibe Play process has its companion on screen (so a shared browser must not be trimmed).
pub fn other_companion_visible() -> bool {
    let me = std::process::id();
    waitplay_core::companion_state::live().iter().any(|s| s.visible && s.pid != me)
}

pub fn parent_pid(pid: u32) -> u32 {
    ps_field(pid, "ppid").and_then(|s| s.parse().ok()).unwrap_or(0)
}

/// `root` plus every descendant, from one `ps` snapshot.
pub fn process_tree(root: u32) -> Vec<u32> {
    let Ok(out) = Command::new("/bin/ps").args(["-axo", "pid=,ppid="]).output() else { return vec![root] };
    descendants(&String::from_utf8_lossy(&out.stdout), root)
}

pub(crate) fn descendants(ps_output: &str, root: u32) -> Vec<u32> {
    let pairs: Vec<(u32, u32)> = ps_output
        .lines()
        .filter_map(|l| {
            let mut it = l.split_whitespace();
            Some((it.next()?.parse().ok()?, it.next()?.parse().ok()?))
        })
        .collect();
    let mut tree = vec![root];
    let mut i = 0;
    while i < tree.len() {
        let parent = tree[i];
        for (pid, ppid) in &pairs {
            if *ppid == parent && !tree.contains(pid) {
                tree.push(*pid);
            }
        }
        i += 1;
    }
    tree
}

/// The application that hosts the agent: `pid` or its nearest ancestor that is a regular (Dock-capable) application, so a hook
/// run by `zsh` inside Terminal.app, iTerm2 or VS Code resolves to that app. `NO_WINDOW` when there is none.
pub fn find_top_window_for_pid(pid: u32) -> WindowId {
    let mut cur = pid;
    for _ in 0..32 {
        if cur <= 1 {
            break;
        }
        if let Some(app) = running_app(cur) {
            if app.activationPolicy() == NSApplicationActivationPolicy::Regular {
                return cur as WindowId;
            }
        }
        let parent = parent_pid(cur);
        if parent == 0 || parent == cur {
            break;
        }
        cur = parent;
    }
    NO_WINDOW
}

pub fn find_window_for_agent(_agent_name: &str) -> WindowId {
    NO_WINDOW
}

/// What to do to bring one agent session's place to the front.
#[derive(Debug, PartialEq)]
enum JumpPlan {
    /// Select the tab with this terminal device in Terminal.app or iTerm2 (AppleScript).
    Script(String),
    /// A code editor: opening its folder again focuses the window that already shows it.
    OpenFolder(String),
    /// Anything else: just the application.
    Activate,
}

fn jump_plan(bundle: &str, cwd: &str, tty: &str) -> JumpPlan {
    // the device name reaches an AppleScript: only the characters a device path has
    let tty_ok = !tty.is_empty() && tty.len() <= 40 && tty.chars().all(|c| c.is_ascii_alphanumeric() || matches!(c, '/' | '_' | '-' | '.'));
    match bundle {
        "com.apple.Terminal" if tty_ok => JumpPlan::Script(format!(
            "tell application \"Terminal\"\nactivate\nrepeat with w in windows\nrepeat with t in tabs of w\nif tty of t is \"{tty}\" then\nset selected of t to true\nset index of w to 1\nreturn\nend if\nend repeat\nend repeat\nend tell"
        )),
        "com.googlecode.iterm2" if tty_ok => JumpPlan::Script(format!(
            "tell application \"iTerm\"\nactivate\nrepeat with w in windows\nrepeat with t in tabs of w\nrepeat with s in sessions of t\nif tty of s is \"{tty}\" then\nselect t\nselect s\nreturn\nend if\nend repeat\nend repeat\nend repeat\nend tell"
        )),
        b if !cwd.is_empty() && (b.starts_with("com.microsoft.VSCode") || b.starts_with("com.todesktop.") || b.starts_with("com.exafunction.windsurf") || b == "dev.zed.Zed" || b.starts_with("com.jetbrains.")) => {
            JumpPlan::OpenFolder(b.to_string())
        }
        _ => JumpPlan::Activate,
    }
}

/// Brings the place of the agent running as `pid` to the front: the exact tab in Terminal.app and iTerm2, the project's window in a
/// code editor, otherwise the hosting application. `false` when no application hosts it.
pub fn jump_to_session(pid: u32, cwd: &str, tty: &str) -> bool {
    let target = find_top_window_for_pid(pid);
    if target == NO_WINDOW {
        return false;
    }
    let bundle = running_app(target as u32).and_then(|a| a.bundleIdentifier()).map(|b| b.to_string()).unwrap_or_default();
    match jump_plan(&bundle, cwd, tty) {
        JumpPlan::Script(script) => {
            focus_window(target);
            let _ = Command::new("/usr/bin/osascript").arg("-e").arg(script).status();
        }
        JumpPlan::OpenFolder(b) => {
            if Command::new("/usr/bin/open").args(["-b", &b, cwd]).status().map(|s| !s.success()).unwrap_or(true) {
                focus_window(target);
            }
        }
        JumpPlan::Activate => focus_window(target),
    }
    true
}

fn lrect(r: objc2_foundation::NSRect) -> LRect {
    LRect::new(r.origin.x, r.origin.y, r.size.width, r.size.height)
}

/// Every display in logical points with a top-left origin (primary display first). Main thread only; empty elsewhere.
pub fn screens() -> Vec<Screen> {
    let Some(mtm) = MainThreadMarker::new() else { return Vec::new() };
    let list = NSScreen::screens(mtm).to_vec();
    let primary_height = list.first().map(|s| s.frame().size.height).unwrap_or(0.0);
    // Cocoa measures y upwards from the bottom of the primary display; everything else here measures downwards from its top
    let flip = |r: LRect| LRect::new(r.x, primary_height - (r.y + r.h), r.w, r.h);
    list.iter().map(|s| Screen { frame: flip(lrect(s.frame())), work: flip(lrect(s.visibleFrame())), scale: s.backingScaleFactor() }).collect()
}

/// Size in points (width, height) of the camera notch of the display whose top-left corner is (`frame_x`, `frame_y`) in the
/// coordinates of [`screens`]; `None` for a display without one (external monitors, Macs before 2021, macOS before 12). The notch
/// is the strip the display reserves at the top (`safeAreaInsets.top`) and its width is what the two usable top areas leave free.
pub fn notch_size(frame_x: f64, frame_y: f64) -> Option<(f64, f64)> {
    use objc2::runtime::Bool;
    let mtm = MainThreadMarker::new()?;
    let list = NSScreen::screens(mtm).to_vec();
    let primary_height = list.first()?.frame().size.height;
    for s in list.iter() {
        let f = s.frame();
        let (x, y) = (f.origin.x, primary_height - (f.origin.y + f.size.height));
        if (x - frame_x).abs() > 1.0 || (y - frame_y).abs() > 1.0 {
            continue;
        }
        // SAFETY: a plain selector query on a live NSScreen; the three notch accessors below exist from macOS 12
        let known: Bool = unsafe { objc2::msg_send![&**s, respondsToSelector: objc2::sel!(auxiliaryTopLeftArea)] };
        if !known.as_bool() {
            return None;
        }
        let top = s.safeAreaInsets().top;
        if top <= 0.0 {
            return None;
        }
        let (left, right) = (s.auxiliaryTopLeftArea(), s.auxiliaryTopRightArea());
        let width = f.size.width - left.size.width - right.size.width;
        return if width > 20.0 { Some((width, top)) } else { None };
    }
    None
}

/// Primary display's usable area in physical pixels (the contract's unit).
pub fn work_area() -> Rect {
    match screens().first() {
        Some(s) => Rect {
            left: (s.work.x * s.scale).round() as i32,
            top: (s.work.y * s.scale).round() as i32,
            right: (s.work.right() * s.scale).round() as i32,
            bottom: (s.work.bottom() * s.scale).round() as i32,
        },
        None => Rect { left: 0, top: 0, right: 1440, bottom: 900 },
    }
}

pub fn cursor_position() -> (i32, i32) {
    (0, 0)
}

/// The mouse pointer in logical points with a top-left origin (the same space as [`screens`]). Main thread only.
pub fn cursor_logical() -> Option<(f64, f64)> {
    let primary_height = screens().first()?.frame.h;
    let p = objc2_app_kit::NSEvent::mouseLocation();
    Some((p.x, primary_height - p.y))
}

pub fn attach_parent_console() {}

/// Liquid glass behind a whole window: an `NSVisualEffectView` (real behind-window blur and vibrancy, follows light/dark, Reduce
/// Transparency and Increase Contrast by itself) filling the content view under the transparent header page; the opaque site view
/// covers the middle. The window itself must be non-opaque (tao's `with_transparent`). Main thread only.
pub fn fill_with_glass(content_view: *mut std::ffi::c_void) {
    use objc2_app_kit::{NSAutoresizingMaskOptions, NSVisualEffectBlendingMode, NSVisualEffectMaterial, NSVisualEffectState, NSVisualEffectView, NSView, NSWindowOrderingMode};
    let Some(mtm) = MainThreadMarker::new() else { return };
    if content_view.is_null() {
        return;
    }
    // SAFETY: tao hands out the window's live content view
    let content: &NSView = unsafe { &*(content_view as *const NSView) };
    let fx = NSVisualEffectView::initWithFrame(mtm.alloc(), content.bounds());
    fx.setMaterial(NSVisualEffectMaterial::Popover);
    fx.setBlendingMode(NSVisualEffectBlendingMode::BehindWindow);
    fx.setState(NSVisualEffectState::Active);
    fx.setAutoresizingMask(NSAutoresizingMaskOptions::ViewWidthSizable | NSAutoresizingMaskOptions::ViewHeightSizable);
    content.addSubview_positioned_relativeTo(&fx, NSWindowOrderingMode::Below, None);
}

/// Sets an `NSWindow`'s level (tao's always-on-top is the floating level; the widget sits above it so its expanded panel is never
/// covered by the entertainment window).
pub fn set_window_level(ns_window: *mut std::ffi::c_void, level: isize) {
    if ns_window.is_null() {
        return;
    }
    // SAFETY: tao hands out the window's live NSWindow; setLevel: takes an NSInteger
    unsafe {
        let w = ns_window as *mut objc2::runtime::AnyObject;
        let _: () = objc2::msg_send![w, setLevel: level];
    }
}

/// One on-screen window as the window server lists it (top-left coordinates, front to back).
#[derive(Clone, Debug, PartialEq)]
struct ListedWindow {
    owner: String,
    layer: i64,
    alpha: f64,
    rect: LRect,
}

#[link(name = "CoreGraphics", kind = "framework")]
extern "C" {
    fn CGWindowListCopyWindowInfo(option: u32, relative_to: u32) -> *mut objc2_foundation::NSArray<objc2::runtime::AnyObject>;
}

/// Owner names and rectangles only: neither needs the Screen Recording permission (window titles and contents would).
fn on_screen_windows() -> Vec<ListedWindow> {
    use objc2::runtime::AnyObject;
    use objc2_foundation::NSString;
    const ON_SCREEN_ONLY: u32 = 1;
    // SAFETY: the function returns a +1 CFArray of CFDictionaries, which are toll-free bridged to NSArray / NSDictionary
    let Some(list) = (unsafe { Retained::from_raw(CGWindowListCopyWindowInfo(ON_SCREEN_ONLY, 0)) }) else { return Vec::new() };
    let value = |w: &AnyObject, path: &str| -> Option<Retained<AnyObject>> {
        let path = NSString::from_str(path);
        // SAFETY: valueForKeyPath: on a dictionary returns nil for a missing key
        unsafe { objc2::msg_send![w, valueForKeyPath: &*path] }
    };
    // SAFETY: only ever called on the NSNumber values of the window dictionaries
    let number = |w: &AnyObject, path: &str| -> f64 { value(w, path).map_or(0.0, |v| unsafe { objc2::msg_send![&*v, doubleValue] }) };
    list.iter()
        .map(|w| ListedWindow {
            owner: value(&w, "kCGWindowOwnerName").and_then(|v| v.downcast::<NSString>().ok()).map(|s| s.to_string()).unwrap_or_default(),
            layer: number(&w, "kCGWindowLayer") as i64,
            alpha: number(&w, "kCGWindowAlpha"),
            rect: LRect::new(
                number(&w, "kCGWindowBounds.X"),
                number(&w, "kCGWindowBounds.Y"),
                number(&w, "kCGWindowBounds.Width"),
                number(&w, "kCGWindowBounds.Height"),
            ),
        })
        .collect()
}

/// Whether the display with this frame is showing a full-screen app.
pub fn fullscreen_app_on(frame: LRect) -> bool {
    shows_fullscreen_app(&on_screen_windows(), frame)
}

/// The rule behind [`fullscreen_app_on`]. A full-screen space has neither the Dock nor the desktop picture on that display, and an
/// app window reaches from (just under) the top edge to the bottom edge over the whole width. A merely maximized window has the
/// desktop behind it, even when the Dock hides itself and the window reaches the bottom.
fn shows_fullscreen_app(windows: &[ListedWindow], frame: LRect) -> bool {
    const MENU_BAR_OR_NOTCH: f64 = 40.0;
    let near = |a: f64, b: f64| (a - b).abs() < 1.5;
    let spans_width = |w: &ListedWindow| near(w.rect.x, frame.x) && near(w.rect.w, frame.w);
    let desktop = windows.iter().any(|w| spans_width(w) && (w.owner == "Wallpaper" || (w.owner == "Dock" && w.rect.h >= frame.h - 1.5)));
    !desktop
        && windows.iter().any(|w| {
            w.layer == 0
                && w.alpha > 0.0
                && w.owner != "Vibe Play"
                && spans_width(w)
                && w.rect.y <= frame.y + MENU_BAR_OR_NOTCH
                && near(w.rect.bottom(), frame.bottom())
        })
}

#[cfg(test)]
mod fullscreen_tests {
    use super::*;

    fn w(owner: &str, layer: i64, alpha: f64, y: f64, h: f64) -> ListedWindow {
        ListedWindow { owner: owner.into(), layer, alpha, rect: LRect::new(0.0, y, 1470.0, h) }
    }
    const FRAME: LRect = LRect { x: 0.0, y: 0.0, w: 1470.0, h: 956.0 };

    // the three lists below are what a notched MacBook on macOS 27 reported
    #[test]
    fn a_normal_or_maximized_window_is_not_full_screen() {
        let desktop = [w("Dock", 20, 1.0, 0.0, 956.0), w("Wallpaper", -2147483625, 1.0, 0.0, 956.0)];
        for app in [w("Safari", 0, 1.0, 33.0, 840.0), w("Safari", 0, 1.0, 33.0, 843.0)] {
            assert!(!shows_fullscreen_app(&[desktop[0].clone(), app, desktop[1].clone()], FRAME));
        }
        // the Dock hides itself and the maximized window reaches the bottom: the desktop picture is still there
        assert!(!shows_fullscreen_app(&[w("Safari", 0, 1.0, 33.0, 923.0), desktop[1].clone()], FRAME));
    }

    #[test]
    fn a_full_screen_space_is_detected_per_display() {
        let list = [w("MenuBarAgent", 25, 1.0, 0.0, 33.0), w("Safari", 0, 0.0, 33.0, 32.0), w("Safari", 0, 1.0, 33.0, 923.0)];
        assert!(shows_fullscreen_app(&list, FRAME));
        assert!(!shows_fullscreen_app(&list, LRect::new(1470.0, 0.0, 1920.0, 1080.0)), "another display");
    }

    #[test]
    fn an_empty_list_or_our_own_window_never_counts() {
        assert!(!shows_fullscreen_app(&[], FRAME));
        assert!(!shows_fullscreen_app(&[w("Vibe Play", 0, 1.0, 0.0, 956.0)], FRAME));
    }
}

/// Before macOS 14 WebKit has no per-account data stores (wry then uses the default one), so every account shares the site logins.
pub fn shared_site_logins() -> bool {
    logins_are_shared_on(objc2_foundation::NSProcessInfo::processInfo().operatingSystemVersion().majorVersion)
}

fn logins_are_shared_on(major: isize) -> bool {
    major < 14
}

#[cfg(test)]
mod login_store_tests {
    #[test]
    fn only_macos_14_and_later_separate_the_site_logins() {
        assert!(super::logins_are_shared_on(11));
        assert!(super::logins_are_shared_on(13));
        assert!(!super::logins_are_shared_on(14));
        assert!(!super::logins_are_shared_on(27));
    }
}

pub mod memory {
    pub fn park(_browser_pid: u32) {}
    pub fn wake(_browser_pid: u32) {}
    pub fn trim_self() {}
}

/// Terminal tab tracking needs the Accessibility permission, which Vibe Play does not request.
pub struct TabTracker;

impl TabTracker {
    pub fn capture(_hwnd: WindowId) -> Option<TabTracker> {
        None
    }
    pub fn own_tab_selected(&mut self) -> Option<bool> {
        None
    }
    pub fn gone(&self) -> bool {
        false
    }
}

/// Input observation needs Accessibility / Input Monitoring: not requested, so the callback never fires.
pub struct InputWatcher;

impl InputWatcher {
    pub fn new(_on_interaction: impl Fn() + Send + Sync + 'static) -> InputWatcher {
        InputWatcher
    }
    pub fn set_target(&self, _hwnd: WindowId) {}
}

/// The macOS companion keeps polling; there is no foreground event source it needs.
pub struct ForegroundWatcher;

impl ForegroundWatcher {
    pub fn new(_on_change: impl Fn() + Send + Sync + 'static) -> ForegroundWatcher {
        ForegroundWatcher
    }
}

/// Standard application menu (Vibe Play, Edit, Window) so the usual shortcuts work inside the web pages: without an Edit menu
/// WKWebView ignores Cmd+C / Cmd+V / Cmd+A, and signing in to a site needs paste. Call once on the main thread.
pub fn install_main_menu(app_name: &str) {
    use tray_icon::menu::{Menu, PredefinedMenuItem, Submenu};
    let build = || -> Result<(Menu, Submenu), tray_icon::menu::Error> {
        let menu = Menu::new();
        let app = Submenu::with_items(
            app_name,
            true,
            &[
                &PredefinedMenuItem::hide(None),
                &PredefinedMenuItem::hide_others(None),
                &PredefinedMenuItem::show_all(None),
                &PredefinedMenuItem::separator(),
                &PredefinedMenuItem::quit(None),
            ],
        )?;
        let edit = Submenu::with_items(
            "Edit",
            true,
            &[
                &PredefinedMenuItem::undo(None),
                &PredefinedMenuItem::redo(None),
                &PredefinedMenuItem::separator(),
                &PredefinedMenuItem::cut(None),
                &PredefinedMenuItem::copy(None),
                &PredefinedMenuItem::paste(None),
                &PredefinedMenuItem::select_all(None),
            ],
        )?;
        let window = Submenu::with_items("Window", true, &[&PredefinedMenuItem::minimize(None), &PredefinedMenuItem::close_window(None)])?;
        menu.append_items(&[&app, &edit, &window])?;
        Ok((menu, window))
    };
    match build() {
        Ok((menu, window)) => {
            menu.init_for_nsapp();
            window.set_as_windows_menu_for_nsapp();
            // both must outlive the app
            std::mem::forget(window);
            std::mem::forget(menu);
        }
        Err(e) => eprintln!("waitplay: could not build the main menu: {}", e),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn descendants_walks_the_whole_subtree_once() {
        let ps = "  1     0\n 10     1\n 11    10\n 12    10\n 13    11\n 99     1\ngarbage\n";
        let mut t = descendants(ps, 10);
        t.sort();
        assert_eq!(t, vec![10, 11, 12, 13]);
        assert_eq!(descendants(ps, 77), vec![77]);
    }

    #[test]
    fn own_process_is_a_waitplay_window_and_exists() {
        let me = std::process::id() as WindowId;
        assert!(is_window(me));
        assert!(is_waitplay_window(me));
        assert!(!is_window(NO_WINDOW));
        assert_eq!(window_pid(me), std::process::id());
    }

    #[test]
    fn parent_of_this_process_is_known() {
        assert!(parent_pid(std::process::id()) > 0);
    }
}

#[cfg(test)]
mod jump_tests {
    use super::*;

    #[test]
    fn terminals_select_the_tab_by_device_and_editors_open_the_folder() {
        assert!(matches!(jump_plan("com.apple.Terminal", "/p", "/dev/ttys003"), JumpPlan::Script(s) if s.contains("/dev/ttys003") && s.contains("\"Terminal\"")));
        assert!(matches!(jump_plan("com.googlecode.iterm2", "", "/dev/ttys010"), JumpPlan::Script(s) if s.contains("iTerm")));
        assert_eq!(jump_plan("com.microsoft.VSCode", "/Users/a/shop", ""), JumpPlan::OpenFolder("com.microsoft.VSCode".into()));
        assert_eq!(jump_plan("com.microsoft.VSCode", "", ""), JumpPlan::Activate, "no folder known");
        assert_eq!(jump_plan("com.mitchellh.ghostty", "/p", "/dev/ttys001"), JumpPlan::Activate);
    }

    #[test]
    fn a_device_name_that_could_break_out_of_the_script_is_not_used() {
        assert_eq!(jump_plan("com.apple.Terminal", "/p", "\" & do shell script \"x\" & \""), JumpPlan::Activate);
        assert_eq!(jump_plan("com.apple.Terminal", "/p", ""), JumpPlan::Activate);
    }
}
