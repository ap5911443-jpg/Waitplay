# Vibe Play on macOS

Vibe Play for macOS is a menu-bar utility. It watches your AI coding agents; when one starts working it opens your chosen
entertainment site (Instagram, X or YouTube) in a compact floating window, and when the agent is done it hides or closes that
window.

## What runs

| Process | Binary | Job |
|---|---|---|
| Menu-bar app | `waitplay` (no arguments) | tray icon and menu, floating widget, settings window, global shortcuts, login item, starts the bridge and the agent watchers |
| Entertainment window | `waitplay --session=… / --open` | one WKWebView window (header + site), started by agent hooks or *Open Now*; one per Mac |
| Bridge | `waitplay-bridge` | loopback event hub (`127.0.0.1:3150`), session state machine |
| Hooks / watchers | `waitplay-hook` | Claude Code hooks, OpenCode / Codex / OMP / Cline watchers, MCP server |

All four are inside `VibePlay.app/Contents/MacOS/`. The app is an agent app (`LSUIElement`): no Dock icon unless
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
* `placement.rs`: pure geometry for the widget corners (and the Windows top-centre notch) and the centred 70% x 82% entertainment window; unit tested.
* `mac/login_item.rs`: launch at login = one LaunchAgent plist (`com.waitplay.app`), rewritten when the app moves.
* `mac/integrations.rs`: idempotent install/remove of Claude Code hooks in `~/.claude/settings.json` (keeps every other setting,
  never overwrites a file it cannot parse, writes a one-time `.waitplay-backup`).
* `waitplay-core::settings`: `~/Library/Application Support/WaitPlay/settings.json`, validated field by field.
* `logging.rs`: `~/Library/Logs/WaitPlay/waitplay.log`, rotating at 1 MiB.

Pages: `assets/settings.html` and `assets/mac_widget.html` are self-contained HTML/CSS/JS (system font, `prefers-color-scheme`,
reduced-motion aware) that talk to Rust over wry IPC. They are plain HTML like the existing `header.html`/`widget.html`, not a
React build: the repo's React app (`apps/web`) is the bridge's web dashboard, not part of the desktop shell.

**Widget look** (`mac_widget.html`): an opaque black shape with a moving edge light, sized to the real camera notch
(`platform::notch_size`); nothing depends on a macOS blur. To preview it without the app, open
`crates/waitplay-app/assets/mac_widget.html` in a browser (demo mode). `WAITPLAY_TEST_EXPAND_WIDGET=1` makes a `test-hooks` build
expand the widget after start (used by the CI screenshots).

## Permissions

None are requested. The frontmost application comes from `NSWorkspace` (no Accessibility), no screen is captured (no Screen
Recording), agent events use loopback. *Settings > Permissions* says so and links to the Login Items pane. Consequence: the
Windows-only "typing or scrolling in the terminal steps the window aside" and per-tab tracking are not available on macOS.

## Settings that take effect where

| Setting | Applies |
|---|---|
| Launch at login, Dock icon, widget on/off and position, appearance (menu-bar app windows), shortcuts | immediately |
| Preferred platform, enabled platforms (header tabs), Hide/Close on finish, appearance of the entertainment window | next time the entertainment window starts |

## Full-screen apps

While a full-screen app is on the widget's display the widget is hidden, as on Windows (checked about once a second). Detection uses
the window list's owner names and rectangles, which needs no permission.

## Moving the widget

The corner pills (and the floating capsule on a display without a camera notch) can be dragged; the spot is saved in
`widget-position.json` and forgotten when the position setting changes. The camera notch is fixed.

## No Permissions step in the setup guide

On purpose: Vibe Play requests no macOS permission (see *Permissions* above), so the guide does not ask anyone to grant
Accessibility or Screen Recording. *Settings > Permissions* stays as the explanation.

## Site logins before macOS 14

The app still runs on macOS 11 and later, but per-account web data stores need macOS 14. On macOS 13 and earlier **every account on
the Mac shares one set of Instagram / YouTube / X logins**; the sign-in screens and *Settings > Account* say so.

## Upgrading from `WaitPlay.app`

The app bundle is now `VibePlay.app`. The bundle id (`com.waitplay.app`) and the `WaitPlay` data folders are unchanged, so settings,
site logins and the account stay. Quit the old app, delete `WaitPlay.app`, install `VibePlay.app` and open it once (that rewrites
the login item). Claude Code hooks hold the old path: choose *Install hooks* again under *Settings > AI Agents*.

## Build

```sh
rustup target add aarch64-apple-darwin
cargo build --release --workspace
WAITPLAY_BUILD=$(git rev-parse --short HEAD) bash packaging/macos/build_app.sh aarch64-apple-darwin
# -> dist/aarch64-apple-darwin/VibePlay.app and VibePlay-<version>-arm64.dmg
```

The script ad-hoc signs by default, so a local build never needs an Apple account. For distribution set
`APPLE_SIGNING_IDENTITY` (Hardened Runtime + timestamp) and `APPLE_ID` / `APPLE_TEAM_ID` / `APPLE_APP_PASSWORD` (notarize and
staple). The GitHub Actions workflow `.github/workflows/macos.yml` builds and tests on a macOS runner for `aarch64-apple-darwin`
and `x86_64-apple-darwin`, signs when the `APPLE_*` secrets exist, and attaches the DMGs to a `v*` tag release.

## The island, sounds and insights

* **Sessions.** The island lists every live session (working, waiting for you, just finished or failed) with its own timer. Sessions are
  independent: one finishing never ends another, and the single shared entertainment window stays open until the last one is done.
  The line under the status says what Vibe Play is doing with it (opening, active, hidden, closing, paused). "Active" is shown only
  once the window is really open.
* **Notifications.** Short messages in the island when agents start, finish, fail, or entertainment opens. Events within about a second
  are grouped ("3 AI coding sessions are now active"). Rules live in `crates/waitplay-app/src/island.rs` (unit tested); nothing fires
  for what was already running when the app started. Settings > Sounds & Alerts turns them off and sets how long they stay.
* **Controls.** Open or hide the entertainment window, switch platform, pause automation and mute from the expanded island. Hiding
  uses the same path as the window's own close button, so it does not pop straight back for that prompt.
* **Sounds.** Six built-in sounds are synthesized by the app (`sound.rs`, nothing to license); "Classic" plays the system Glass sound.
  The user can also pick a WAV/AIFF/CAF/MP3/M4A file (up to 5 MB; copied to `~/Library/Application Support/WaitPlay/sounds/`),
  preview, set the volume, mute, and choose which events play. Several finishes in one group play one sound.
* **Insights.** `insights.jsonl` in the app-support folder holds timings only (agent, start/end, working and waiting time, which
  platform was open); no prompts, code or terminal text. Settings > Insights shows today, 7 days, 30 days or all time. "Waiting for
  you" is the time an agent reported it was waiting for input. Work still running when the app quits is recorded as abandoned.

* **Companion.** A small original character (`assets/mascot.js`, inline SVG + CSS transforms, no images) lives in the island and shows
  the real state: it sleeps when nothing runs, wakes with a bounce when an agent starts, works with focused eyes (glances, a keyboard
  now and then), tilts with a question mark when an agent needs you, cheers with sparkles when one finishes (then goes back to work if
  others are still running) and looks worried on an error. Settings > Widget > Companion: on/off, Subtle/Playful, idle animations,
  pointer eyes, reduce motion (the system setting is always honoured). The same page code, notifications, sounds and insights run on
  Windows too (WAV only for custom sounds there). The character only draws state; detection stays in the app.

## Known limits

* Automatic updates are not implemented (the About pane says so).
* The entertainment window cannot be frozen like WebView2: when parked it is hidden and, after ten idle minutes, the process quits
  (logins are kept in the system WebKit store).
* Sites may limit embedded browsers. Vibe Play uses the standard WKWebView and does not alter the user agent or bypass any check.

## Verification status

**Unit tests** (Windows dev machine and the macOS CI job): settings validation, status derivation, tray menu model, placement geometry
(three corners, offset and secondary displays), Claude Code hook install/remove/outdated/corrupt-file handling, launch-at-login plist
sync, logging format, per-conversation Claude sessions, watcher idle polling, companion visibility rules (including "step aside
while the agent asks a question"), macOS process-tree and PID helpers.

**Runtime smoke test on a real macOS session** (`packaging/macos/smoke.sh`, run by CI on macOS 15 / x86_64 against the packaged
`VibePlay.app`; screenshots and logs are uploaded as the `smoke-output` artifact of every run). It passed for:

- app starts, menu-bar item created, bridge started by the app, widget shown bottom-right, settings window opened by a second launch
- idle app: ~0.02 s CPU per 10 s, ~44 MB resident
- a Claude Code prompt through the real hook opens the Instagram window (native title bar, header tabs, page loads and shows the
  login form); a second conversation becomes its own session served by the same window (no second window process)
- finishing one of two sessions keeps the window; finishing the last hides it
- second configuration (dark appearance, widget top-right, YouTube preferred, X off, close on finish): dark windows, the window opens
  on YouTube below the widget, and the window process exits when the agent finishes; the WebKit cookie store is written to disk
- no `ERROR` lines in the app log

The arm64 build is cross-compiled and packaged by CI. An extra job runs the same smoke test on an Apple Silicon runner when GitHub
has capacity (it is allowed to be cancelled); check the latest run for its result.

**Not verified (needs a real Mac and a person):**

- [ ] Sign in to Instagram / X / YouTube, then quit and reopen Vibe Play and confirm you are still signed in
- [ ] Retina display scaling, a second display, display plug/unplug, sleep/wake
- [ ] Launch at login actually starting Vibe Play after a real login; no duplicate entry after moving the app
- [ ] Global shortcuts firing, and conflict messages in Settings > Shortcuts
- [ ] OpenCode / Codex / OMP / Cline watchers with real sessions; Install Hooks button against a real Claude Code
- [ ] Terminal.app / iTerm2 / VS Code: the window follows the terminal that ran the prompt
- [ ] Reduce Motion, VoiceOver, keyboard navigation of the settings window
- [ ] Gatekeeper behaviour of a Developer ID signed and notarized DMG (the CI build is ad-hoc signed)

## Account-first setup (same as Windows)

The settings page (`assets/settings.html`) is now one page for both apps (macOS adds the Permissions pane, the Dock-icon switch, the title-bar drag area and Mac wording), and the account logic is shared (`account_sync.rs`, `logins.rs`, `profile.rs`):

- **An account is required** (in builds with the account service): while nobody is signed in, automation is off and Settings shows only the sign-in screen. The setup guide (sign in, preferences, Instagram / YouTube / X, your main coding agent, connect it) opens on first run and moves on by itself after sign-in; Launch at login (a LaunchAgent) is switched on when it is finished.
- **The account keeps** the preferences (`user_preferences`, saved 3 s after every change, restored on sign-in), the plan (server `entitlements`) and the site logins *on this Mac*: each account has its own WebKit data store (`with_data_store_identifier`, macOS 14 and later; the first account to sign in keeps the original store, so nothing is lost; on macOS 13 and earlier every account shares one store). Site logins are never uploaded.
- **Login detection:** the open entertainment window writes `vibeplay-logins.json` (cookie names only); with no window open, a hidden helper (`waitplay --logins`, `--logout=<site>`) does it. The tray app never opens a web view on the entertainment store itself.
- **Not tested on a Mac yet:** this was written on Windows and type-checked for `aarch64-apple-darwin`; run it on a real Mac before releasing (sign-in, the guide, the per-account store, the hover peek).

## Real-Mac run of the handoff test plan (macOS 27.2.1, Apple Silicon, notched display)

Run from a terminal without Accessibility or Screen Recording permission, so nothing could be clicked, hovered or captured on
screen. **Pass** = checked as written. **Partial** = only what the note says was checked. **Not run** = needs a person.
"Page" means the real HTML was run in an off-screen WKWebView with sample data, not inside the app.

| Row | Result | What was checked |
|---|---|---|
| A1 | Pass (after fix) | Isolated fresh start: guide window and widget appear; `--toggle`, `--open`, agent prompt are blocked. Widget title not seen |
| A2 | Partial | Page: Next disabled while signed out. Opening the window from the guide not clicked |
| A3 | Partial | Log of a real sign-in: account window opened, "account changed: signed in". Method, window closing, Keychain item not checked |
| A4 | Not run | |
| A5 | Partial | Page: name "Not set", Verified, Free, no inputs, duplicate device hidden |
| A6, A7 | Not run | |
| A8 | Partial | Signed-in relaunch: no guide or gate window logged. Offline and signed-out relaunch not run |
| A9 | Not run | |
| B1 | Pass (page) | All panes, light and dark: no script errors or sideways overflow, `color-mix()` pills tinted. A few screenshots were reviewed by eye |
| B2 | Partial | Size is 92% of the screen. Traffic lights, drag, zoom not checked |
| B3, B4 | Pass (page) | |
| B5 | Partial | Claude Code hooks present and "claude-code connected" logged. Other agents' instructions not checked |
| B6 | Pass | Real setup: marker, `launchAtLogin`, LaunchAgent, "login item installed". First-start default fixed |
| B7 | Pass (page) | Buttons as specified |
| B8 | Not run | |
| C1-C4, C6, C8 | Not run | Need real site and account sign-ins. Store-id logic is unit tested only |
| C5 | Partial | `--logout=x` exits and rewrites the file on an empty store; deleting a real cookie not checked |
| C7 | Partial | Exits by itself and writes the file; never appeared as a running app. Reading a signed-in cookie not proven |
| D1, D4 | Not run | |
| D2 | Partial | Real log: "restoring 21 saved preferences" after sign-in |
| D3 | Pass (unit test) | |
| E1-E3 | Partial | Page logic passes. **Whether macOS delivers hover to the unfocusable widget window is not tested** |
| E4 | Partial | Centred at the top of a notched display. External / no-notch display not run |
| E5, E6 | Pass (page) | States, pills and expansion; colours not reviewed |
| E7 | Resolved in code | The native glass view stayed 1x1 point because the page never sent `shape`; it and the handler were removed. Not inspected by eye |
| F | Partial | A real Claude Code prompt opened the window; on this Mac `smoke.sh` passed 25/25 and `simulate` opened and hid the window. **On the GitHub runners the smoke test fails** (see below) |
| G | Partial | Both DMGs verify and the ad-hoc signatures are valid. x86_64 not run; clean install, Gatekeeper, login start, upgrade not run |

**CI, commit `d43e050`:** the macOS, Windows and dependency-audit workflows finished green, but on both macOS runners (x86_64,
macOS 15.7.9; arm64, macOS 26.7.2) the smoke step, which may fail without failing the workflow, reported *FAIL: window hides when
the last session finished*. Cause not yet known. It passes on this Mac, also when started detached from any terminal. On a failure
`smoke.sh` now writes `diag.txt`.

Not verified: dragging with a real mouse, and the older-than-14 note on a real older Mac.
