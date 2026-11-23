# WaitPlay on macOS

WaitPlay for macOS is a menu-bar utility. It watches your AI coding agents; when one starts working it opens your chosen
entertainment site (Instagram, X or YouTube) in a compact floating window, and when the agent is done it hides or closes that
window.

## What runs

| Process | Binary | Job |
|---|---|---|
| Menu-bar app | `waitplay` (no arguments) | tray icon and menu, floating widget, settings window, global shortcuts, login item, starts the bridge and the agent watchers |
| Entertainment window | `waitplay --session=… / --open` | one WKWebView window (header + site), started by agent hooks or *Open Now*; one per Mac |
| Bridge | `waitplay-bridge` | loopback event hub (`127.0.0.1:3150`), session state machine |
| Hooks / watchers | `waitplay-hook` | Claude Code hooks, OpenCode / Codex / OMP / Cline watchers, MCP server |

All four are inside `WaitPlay.app/Contents/MacOS/`. The app is an agent app (`LSUIElement`): no Dock icon unless
*Settings > General > Show Dock icon* is on.

Event flow: agent -> `waitplay-hook` -> bridge `POST /events` and, on a prompt, `waitplay --session=<id> --parentPid=<pid>` ->
the entertainment window registers the session with the application that hosts the terminal (the hook's nearest ancestor that is
a regular macOS app) and shows itself while that application is in front. Sessions are keyed by id; the window stays while **any**
session is still working. Claude Code now reports one session per conversation (`claude-code-<id>`), so two terminals are
independent.

## Native pieces

* `crates/waitplay-app/src/platform/macos.rs`: the platform contract on macOS. A `WindowId` is an application PID.
  Frontmost application: `NSWorkspace`. Displays: `NSScreen` (visible frame, scale; Cocoa -> top-left coordinates).
  Terminal lookup: process-tree walk to the nearest regular `NSRunningApplication`. Standard Edit/Window menus so Cmd+C/V/A work in
  the web pages (needed to paste into sign-in forms).
* `mac/app.rs`: tao event loop (Accessory activation policy), `tray-icon` status item, wry/WKWebView windows, `global-hotkey`.
* `placement.rs`: pure geometry for the three widget corners and the stacked entertainment window; unit tested.
* `mac/login_item.rs`: launch at login = one LaunchAgent plist (`com.waitplay.app`), rewritten when the app moves.
* `mac/integrations.rs`: idempotent install/remove of Claude Code hooks in `~/.claude/settings.json` (keeps every other setting,
  never overwrites a file it cannot parse, writes a one-time `.waitplay-backup`).
* `waitplay-core::settings`: `~/Library/Application Support/WaitPlay/settings.json`, validated field by field.
* `logging.rs`: `~/Library/Logs/WaitPlay/waitplay.log`, rotating at 1 MiB.

Pages: `assets/settings.html` and `assets/mac_widget.html` are self-contained HTML/CSS/JS (system font, `prefers-color-scheme`,
reduced-motion aware) that talk to Rust over wry IPC. They are plain HTML like the existing `header.html`/`widget.html`, not a
React build: the repo's React app (`apps/web`) is the bridge's web dashboard, not part of the desktop shell.

## Permissions

None are requested. The frontmost application comes from `NSWorkspace` (no Accessibility), no screen is captured (no Screen
Recording), agent events use loopback. *Settings > Permissions* says so and links to the Login Items pane. Consequence: the
Windows-only "typing or scrolling in the terminal steps the window aside" and per-tab tracking are not available on macOS.

## Settings that take effect where

| Setting | Applies |
|---|---|
| Launch at login, Dock icon, widget on/off and position, appearance (menu-bar app windows), shortcuts | immediately |
| Preferred platform, enabled platforms (header tabs), Hide/Close on finish, appearance of the entertainment window | next time the entertainment window starts |

## Build

```sh
rustup target add aarch64-apple-darwin
cargo build --release --workspace
WAITPLAY_BUILD=$(git rev-parse --short HEAD) packaging/macos/build_app.sh aarch64-apple-darwin
# -> dist/aarch64-apple-darwin/WaitPlay.app and WaitPlay-<version>-arm64.dmg
```

The script ad-hoc signs by default, so a local build never needs an Apple account. For distribution set
`APPLE_SIGNING_IDENTITY` (Hardened Runtime + timestamp) and `APPLE_ID` / `APPLE_TEAM_ID` / `APPLE_APP_PASSWORD` (notarize and
staple). The GitHub Actions workflow `.github/workflows/macos.yml` builds and tests on a macOS runner for `aarch64-apple-darwin`
and `x86_64-apple-darwin`, signs when the `APPLE_*` secrets exist, and attaches the DMGs to a `v*` tag release.

## Known limits

* Automatic updates are not implemented (the About pane says so).
* The entertainment window cannot be frozen like WebView2: when parked it is hidden and, after ten idle minutes, the process quits
  (logins are kept in the system WebKit store).
* Sites may limit embedded browsers. WaitPlay uses the standard WKWebView and does not alter the user agent or bypass any check.
