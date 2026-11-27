# Vibe Play on Windows

The Windows app is the same product as the macOS menu-bar app, built natively for Windows: a tray icon with the same menu, the same
glass floating widget, the same Settings window, per-conversation sessions and one entertainment window that serves them all.
Status derivation and the tray menu content are literally the same source files as on macOS (`mac/status.rs`, `mac/menu_model.rs`).

## Parts

| macOS | Windows | Where |
|---|---|---|
| Menu-bar item and menu | Notification-area (tray) icon with the same menu: status, *Disable/Enable Automation*, detected AI agents, *Entertainment* platform, *Show Floating Widget*, *Settings…*, *Quit Vibe Play* | `src/win/app.rs`, `src/mac/menu_model.rs` |
| Liquid Glass widget (NSVisualEffectView) | **The notch**: the same page as macOS (`mac_widget.html`), in its camera-notch layout: a black shape flush with the top edge of the display, 200 × 34 pt at rest, that grows out of the notch while an agent works (status, agent, running timer, entertainment sites, moving edge light in the agent's state colour); hovering or clicking opens the same panel as on macOS. Bottom-right, top-right and bottom-left stay available in Settings → Widget, and it can still be dragged. It hides while a fullscreen app (game, F11 video, presentation) is in front. The window is clipped to the pill, so the empty corners are click-through | `assets/mac_widget.html`, `src/win/native.rs` (`NotchShape`, `fullscreen_app_active`) |
| Settings window (General, Entertainment, AI Agents, Widget, Shortcuts, Permissions, About) | The same pages | `assets/win_settings.html` |
| Entertainment window (WKWebView) | WebView2 window, centred 70% × 82% (macOS: compact beside the widget). Its header sits on real blurred glass (DWM blur-behind); with Windows' *Transparency effects* off it falls back to a solid dark bar | `src/companion/` |
| Launch at login (LaunchAgent) | `HKCU\Software\Microsoft\Windows\CurrentVersion\Run`, value `Vibe Play` | `src/win/login_item.rs` |
| Privacy permissions page | Windows has no per-app prompts for what Vibe Play does; the page says so and links to *Startup apps* | `src/win/permissions.rs` |
| Agent integrations installer | Same installer (Claude Code hooks in `%USERPROFILE%\.claude\settings.json`, watchers for the other agents) | `src/win/integrations.rs` |

Start it with `waitplay.exe` (no arguments). The older flags still work: `--game --site=instagram|youtube|x`, `--dock`, `--toggle`.

**First run.** Until it has been finished or skipped once, Vibe Play opens its settings window (1380 x 850, never more than 92% of the display) on a setup guide: welcome, a required sign-in (opens the account window; the guide notices by itself when you are signed in and moves on), preferences (sites, widget position, start with Windows, notifications, sounds), signing in to Instagram / YouTube / X, choosing the coding agent you use most, then connecting it (Claude Code hooks, or the Codex / OMP / OpenCode / Cline watchers; Cursor and Antigravity show their hook commands; the other agents sit under "Other agents I use"). The three sites are checked automatically: a hidden webview on the same browser profile looks for each site's session cookie (names only), and *Log out* deletes the site's cookies. The marker is `%LOCALAPPDATA%\WaitPlay\onboarded`; delete it to see the guide again.

**The account holds everything.** Vibe Play needs an account (in builds that have the account service): while nobody is signed in, automation is off and the settings window shows only a sign-in screen. The account keeps (1) the preferences (`user_preferences` in Supabase: sites, widget, sounds, shortcuts; not start-with-Windows, custom sound file or agent watchers), restored on sign-in and saved 3 s after every change, (2) the plan, which is the server's `entitlements` row and so is there again after signing back in, and (3) the Instagram / YouTube / X logins, which live in a browser profile per account on this PC (`%LOCALAPPDATA%\\WaitPlay\\profiles\\<account id>`; the first account to sign in keeps the original `webview2` profile, and `active-account` / `profile-owner` record who is who). The site logins are never uploaded: a session cookie is as good as a password, so on another PC the sites are signed in again.

**Account and Plans & Billing** are the first two Settings pages: the signed-in profile (name, email, sign-in method, plan, devices, sign out, delete) and the plan cards. Paid plans do not exist yet, so every account shows Free and *Upgrade* is disabled.


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
