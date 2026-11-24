# WaitPlay on Windows

The Windows app is the same product as the macOS menu-bar app, built natively for Windows: a tray icon with the same menu, the same
glass floating widget, the same Settings window, per-conversation sessions and one entertainment window that serves them all.
Status derivation and the tray menu content are literally the same source files as on macOS (`mac/status.rs`, `mac/menu_model.rs`).

## Parts

| macOS | Windows | Where |
|---|---|---|
| Menu-bar item and menu | Notification-area (tray) icon with the same menu: status, *Disable/Enable Automation*, detected AI agents, *Entertainment* platform, *Show Floating Widget*, *Settings…*, *Quit WaitPlay* | `src/win/app.rs`, `src/mac/menu_model.rs` |
| Liquid Glass widget (NSVisualEffectView) | Floating pill with an Acrylic backdrop, rounded corners, bottom-right (or top-right) of the screen the cursor is on; expands to the same panel | `assets/win_widget.html`, `src/win/native.rs` |
| Settings window (General, Entertainment, AI Agents, Widget, Shortcuts, Permissions, About) | The same pages | `assets/win_settings.html` |
| Entertainment window (WKWebView) | WebView2 window, compact and docked beside the widget like on macOS | `src/companion/` |
| Launch at login (LaunchAgent) | `HKCU\Software\Microsoft\Windows\CurrentVersion\Run`, value `WaitPlay` | `src/win/login_item.rs` |
| Privacy permissions page | Windows has no per-app prompts for what WaitPlay does; the page says so and links to *Startup apps* | `src/win/permissions.rs` |
| Agent integrations installer | Same installer (Claude Code hooks in `%USERPROFILE%\.claude\settings.json`, watchers for the other agents) | `src/win/integrations.rs` |

Start it with `waitplay.exe` (no arguments). The older flags still work: `--game --site=instagram|youtube|x`, `--dock`, `--toggle`.

## Where things live

| What | Location |
|---|---|
| Settings | `%LOCALAPPDATA%\WaitPlay\settings.json` |
| Web sign-ins | `%LOCALAPPDATA%\WaitPlay\webview2` |
| Log (no tokens, no prompts) | `%LOCALAPPDATA%\WaitPlay\logs` |
| Bridge token, hand-off files | `%TEMP%\waitplay\` (token in `.bridge-token`, never printed) |

## Install

Unpack `WaitPlay-windows-x86_64.zip` from a release into a folder you keep (it contains `waitplay.exe`, `waitplay-bridge.exe` and
`waitplay-hook.exe`, which must stay together). Check the download against `SHA256SUMS-windows.txt` (`Get-FileHash`) and, for a
release built by GitHub Actions, `gh attestation verify WaitPlay-windows-x86_64.zip --repo ap5911443-jpg/waitplay-website`.
The executables are **not code-signed yet**, so Windows SmartScreen shows "unknown publisher" the first time.

## Uninstall and remove your data

See *Uninstalling and removing your data* in `docs/PRIVACY.md`: remove the integrations and *Launch at login* in Settings, quit from
the tray icon, delete the folder, then delete `%LOCALAPPDATA%\WaitPlay` and `%TEMP%\waitplay`.

## Build and test

```powershell
cargo build --release --workspace
cargo test --workspace
.\target\release\waitplay.exe
```

CI (`.github/workflows/windows.yml`) builds, tests, smoke-tests the real bridge binary and packages the zip.
