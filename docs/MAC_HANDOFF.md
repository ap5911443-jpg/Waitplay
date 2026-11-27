# Vibe Play for macOS: handoff for a Mac session

You are picking this up on a **real Mac**. Everything below was written and type-checked on Windows (`cargo check --target aarch64-apple-darwin`
with a stubbed C compiler). **Nothing in the "ported" list has ever run on macOS.** Your job: build it, run every check in section 4, fix what
fails, finish the items in section 5, and push.

- Repo: `https://github.com/ap5911443-jpg/Waitplay.git`, branch `main`. The macOS port is in commit `3b8fb8f` and the hover change in `fe6bec7`.
- Product: Vibe Play opens Instagram / YouTube / X in a small window while an AI coding agent works, with a notch-style widget, a settings
  window, an optional cloud account (Supabase) and agent hooks. One Rust workspace (`crates/`), one executable `waitplay` per platform.
- Never put a Supabase `service_role` / `sb_secret_` key anywhere. The app ships only the publishable key (see `docs/AUTH_SETUP.md`).
- Do not use `git add -A`; commit only files you changed. Do not force-push.

## 1. Set up the Mac

```sh
xcode-select --install                       # Apple command line tools
curl https://sh.rustup.rs -sSf | sh          # Rust (stable)
git clone https://github.com/ap5911443-jpg/Waitplay.git && cd Waitplay
rustup target add aarch64-apple-darwin x86_64-apple-darwin
cargo test --workspace                       # all tests must pass on macOS (~150 in waitplay-app alone)
cargo build --release --workspace            # builds waitplay, waitplay-bridge, waitplay-hook
WAITPLAY_BUILD=$(git rev-parse --short HEAD) bash packaging/macos/build_app.sh aarch64-apple-darwin   # -> dist/<target>/WaitPlay.app + .dmg
```

Useful commands while testing (all on the same binary):

| Command | What it does |
|---|---|
| `target/release/waitplay --widget` | Start the menu-bar app (tray, widget, settings). Normal way to run it. |
| `waitplay` with no args while it runs | Asks the running app to show its settings window. |
| `waitplay --open` / `--game --site=instagram` | Open the entertainment window (site = `instagram`, `x`, `youtube`). |
| `waitplay --logins` | Helper: check which sites are signed in, write `vibeplay-logins.json`, exit. |
| `waitplay --logout=x` | Helper: delete that site's cookies, rewrite the answer, exit. |
| `waitplay --toggle` | Flip automation on/off. |
| `waitplay-hook claude-code start` (etc.) | Simulate an agent event (see `docs/EVENT_PROTOCOL.md`, `waitplay-hook simulate`). |

State and logs on macOS (everything under the user's own folders):

| What | Path |
|---|---|
| Log | `~/Library/Logs/WaitPlay/waitplay.log` |
| Settings | `~/Library/Application Support/WaitPlay/settings.json` |
| Setup-guide marker | `~/Library/Application Support/WaitPlay/onboarded` (delete it to see the guide again) |
| Which account's browser data is active | `.../WaitPlay/active-account` (`-` = signed out) and `.../WaitPlay/profile-owner` |
| Account cache / device id | `.../WaitPlay/account.json`, `.../WaitPlay/device.json` |
| Site login answer | `.../WaitPlay/webview2/vibeplay-logins.json` (`{"at":..,"instagram":true,"x":false,"youtube":true}`; for a non-owner account the folder is `.../WaitPlay/profiles/<account id>/webview2`) |
| Session token | macOS login Keychain (generic password, written by `waitplay-auth`; never in a file) |
| Hand-off files | `$TMPDIR/waitplay/` |

## 2. What was built (so you know what to read)

Windows was the reference implementation and was run end to end there. macOS must end up behaving the same way, minus the Windows-only
widget details listed in section 3.

### 2.1 Account-first product flow
1. **An account is required** (in builds with the account service, which is the default). While nobody is signed in: automation is off
   (`state::set_enabled(false)`), the widget title says "Sign in to continue", the tray toggle and "Open entertainment" do nothing, and the
   settings window shows only a full-window sign-in screen (`#gate` in `settings.html`).
2. **Setup guide** (`#onb` in `settings.html`, opened automatically while `onboarded` is missing): Welcome -> Sign in (required, "Next" is
   disabled until signed in, "Skip setup" hidden, moves on by itself after sign-in) -> Preferences -> Instagram/YouTube/X sign-in (per-site
   "Sign in" / "Log out", auto-detected) -> "Which coding agent do you use most?" -> "Connect <agent>" (other agents under "Other agents I
   use") -> Done. Finishing it writes `onboarded` and turns **Launch at login** on (LaunchAgent).
3. **The account keeps**: (a) *preferences* in Supabase `user_preferences` (synced keys listed in `account_sync.rs::SYNCED_KEYS`; saved 3 s
   after every change; restored on sign-in; at app start this machine's settings win unless the account has none yet); (b) the *plan* from
   `entitlements` (all accounts are Free; there is no payment provider); (c) the *Instagram/YouTube/X logins, on this Mac only* (one browser
   data store per account; never uploaded, because a session cookie is as good as a password).
4. **Settings pages**: Account (name, email, sign-in method, plan, devices, Sign out, Delete account; no name editing), Plans & Billing
   (Free / Pro "Planned" / Teams cards), General (the Account row shows the signed-in name + email with "Manage..."). The account window
   (`assets/account.html`, `account_ui.rs`) **closes by itself** after a successful sign-in (not while a sign-up waits for its emailed code,
   not for account management).
5. **Look**: the Wispr Flow design (`design.md` was the spec): cream canvas, rounded panel, EB Garamond headings + Figtree (both embedded as
   base64 in `settings.html`), ink buttons, lavender primary buttons in the guide, forest-green accents. Default appearance for new installs is
   **Light**. The real Vibe Play logo (pixel-art window with `</>` and a play triangle, from `assets/vibeplay.ico`) is embedded as a PNG.
6. **One settings page for both apps**: `crates/waitplay-app/assets/settings.html` (the old `win_settings.html` was deleted). It branches on
   `IS_MAC = /Macintosh|Mac OS X/.test(navigator.userAgent)`: macOS keeps the **Permissions pane**, the **Show Dock icon** switch, the
   transparent-title-bar drag area (`body.mac .dragzone`, `data-drag` -> `drag` / `zoom` IPC), Finder/Mac wording and the Command/Option symbols.
   The Permissions step was removed from the guide on both platforms.

### 2.2 Code map (macOS side)

| Area | Where |
|---|---|
| Mac app (tray/menu bar, widget, settings window, IPC) | `crates/waitplay-app/src/mac/app.rs`. New this round: `account_gate`, `watch_account`, `fetch_prefs`, `save_prefs`, `on_prefs`, `open_site`, `settings_default_size`, IPC arms `watchLogins`, `logoutSite`, `openSite`, `finishOnboarding`, `restartOnboarding`, `setName`/`signOut`/`signOutOthers`/`revokeDevice`, event `Ev::Prefs`. |
| Shared account helpers | `src/account_sync.rs` (onboarding marker, `synced_prefs`, `restore_patch`), `src/account_ui.rs` (account window, `user_id()`, `service()`, closes on sign-in), `crates/waitplay-auth` (Supabase client, Keychain store, `fetch_preferences` / `save_preferences`). |
| Per-account browser data | `src/profile.rs`: `set_active`, `resolve`, **`store_id()`** (16-byte WebKit data-store id; `None` = default store), `companion/webview2.rs::with_store` applies `with_data_store_identifier` on macOS. Used by the entertainment window (`companion/mod.rs`) and the login helper. |
| Login detection | `src/logins.rs`: `detect` (cookie names only), `write_state`, `run_helper` (`--logins` / `--logout=`), `Logins::{state,log_out,pause}` (tray side only reads the file). The open entertainment window also writes the file every 3 s (`companion/mod.rs::report_logins`). |
| Widget page (shared with Windows) | `assets/mac_widget.html`. Hover: `pointerenter` -> `peek` class after 120 ms (grows 5% from the top edge) -> expands after 200 ms; `pointerleave` -> collapses after 220 ms. Windows-only parts are behind `S.clip` (clip-region morph, drag, spring easing `.vn`). |
| Settings page | `assets/settings.html` |
| Packaging | `packaging/macos/build_app.sh`, `smoke.sh`, `verify_release.sh`, `Info.plist.in` (`LSMinimumSystemVersion` 11.0, `LSUIElement` true), `.github/workflows/macos.yml`, `docs/MACOS.md`, `docs/RELEASE_SIGNING.md`. |

## 3. Windows-only on purpose (do not port unless asked)
- The Venu-style fused notch with concave shoulders, spring easing and the Rust-animated window clip (`S.clip`, `win/native.rs::NotchShape`).
  macOS keeps its own widget: an opaque black shape with the moving edge light, sized to the real camera notch (`platform::notch_size`).
  Note: `mac/app.rs` still attaches a native `NSVisualEffectView` (`platform::Glass`) and has a `shape` handler for it, but the page never
  sends `shape` messages (the page header says nothing depends on macOS blur), and `docs/MACOS.md` still describes a "Liquid Glass bar".
  Verify on the Mac whether the native view shows anything; either feed it the shell rectangle or remove it and fix the doc.
- Per-account profile *folders* (`profile::account_dir`): macOS uses WebKit data stores instead.
- Windows Credential Manager, Run-key login item, fullscreen-app hiding, tray left-click = settings.

## 4. Test plan: run each, record pass/fail, fix failures

Prerequisite for all: a test Google account and (optionally) an email/password account. Use a fresh state for A-series:
`pkill waitplay; rm -rf ~/Library/Application\ Support/WaitPlay ~/Library/Logs/WaitPlay` then sign out/delete the Keychain item for the app.
Run with `target/release/waitplay --widget` from Terminal so you can see stderr, and `tail -f ~/Library/Logs/WaitPlay/waitplay.log`.

### A. Account gate and sign-in
| ID | Steps | Expected | If it fails, look at |
|---|---|---|---|
| A1 | Fresh start, nobody signed in | Settings window opens by itself on the Welcome screen of the guide; widget title "Sign in to continue"; log has no "automation enabled"; `waitplay --toggle` prints enabled False or the tray toggle does nothing | `mac/app.rs` `init` / `account_gate` |
| A2 | Guide -> "Get started" -> "Sign in or create account" | Account window opens; "Next" in the guide stays disabled | `account_ui.rs::open`, `settings.html` `buildOnb` |
| A3 | Sign in with Google (system browser -> loopback `http://127.0.0.1:<port>/auth/callback/<nonce>`) | Account window **closes by itself**; guide moves to Preferences; log "account changed: signed in"; Keychain item exists | `account_ui.rs` `__done` branch; `waitplay-auth` (`service.rs`, `callback.rs`). The Supabase redirect allow-list must contain `http://127.0.0.1:*/auth/callback/*` |
| A4 | Same with email + password; and a sign-up that needs the emailed code | Password sign-in closes the window; the code step stays open until verified, then closes | same |
| A5 | Settings -> Account | Shows name (or "Not set"), email, Verified pill, "Signed in with", initials avatar, Plan Free, **no name fields / Save**, devices list with exactly one "This device" (a duplicate row with the same name is hidden) | `settings.html` `buildAccount` |
| A6 | General -> account row | Title = name (else email), second line email, button "Manage..." | `paneGeneral` |
| A7 | Account -> Sign out | Full-window sign-in screen appears over Settings; widget "Sign in to continue"; entertainment windows closed; automation off; `active-account` contains `-` | `watch_account` |
| A8 | Quit and relaunch while signed in / while signed out | Signed in: no guide, no gate (cached login, even offline). Signed out: gate again | `init` |
| A9 | Delete account (disposable account only) | Confirmation requires typing the email; afterwards signed out and local data removed | `account.html`, `service.rs::delete_account` |

### B. Setup guide and settings page (WKWebView rendering)
| ID | Steps | Expected |
|---|---|---|
| B1 | Open every settings pane in Light and Dark appearance | Cream (light) / warm-dark (dark) Flow look, EB Garamond headings, no layout overflow, no console errors (enable Safari Web Inspector if needed). **Check `color-mix()` pills** (green/orange/red/accent): if they render untinted on your macOS version, replace `color-mix(in srgb, X N%, transparent)` with explicit `rgba()` fallbacks in `settings.html` |
| B2 | Window chrome | Window opens at about 1380x850 (max 92% of the screen, min 760x540); the traffic lights do not overlap the "Vibe Play" brand (`body.mac .dragzone` is 40 px); dragging the sidebar top / title area moves the window; double-click zooms |
| B3 | Sidebar | Account, Plans & Billing, General, Sessions, Entertainment, AI Agents, Widget, Sounds & Alerts, Insights, Shortcuts, **Permissions**, About. General has the **Show Dock icon** switch |
| B4 | Guide step Preferences | Site toggles, "Open first", widget position (Notch / Top right / Bottom right / Bottom left), "When the agent finishes", Notifications, Sounds. **No "Start with Windows/Mac" switch** (launch at login is on by default) |
| B5 | Guide step coding agent | Agent cards (detected first) -> "Connect <agent>" with a Connect button; Claude Code writes hooks into `~/.claude/settings.json`; Cursor/Antigravity show their manual hook commands |
| B6 | Finish the guide | `onboarded` written; `settings.json` has `"launchAtLogin": true`; `~/Library/LaunchAgents/com.waitplay.app.plist` exists (`mac/login_item.rs`); log "login item installed" |
| B7 | About | Real logo, version, Website/Support, "Check for updates", Quit; **no** "Show log file" or "Run setup again" buttons (the Agents pane still has "Show log file in Finder") |
| B8 | Permissions pane | Accessibility / Screen Recording cards open the right System Settings pane (`mac/permissions.rs`) |

### C. Per-account site logins (the riskiest new logic)
Needs **macOS 14+** for isolation (check `sw_vers`). On macOS 13 and earlier every account shares one store; document that.
| ID | Steps | Expected |
|---|---|---|
| C1 | Account 1 signs in, signs in to Instagram in the entertainment window (`waitplay --game --site=instagram`), quits | `profile-owner` = account 1's id; the default WebKit store holds the Instagram cookie (so logins from before this update survive) |
| C2 | Sign out, sign back in with account 1 | Instagram still signed in; `active-account` toggles `-` then the id |
| C3 | Sign out, sign in with **account 2** | Entertainment window shows Instagram signed **out**; account 2 gets its own store (`store_id()` non-nil); signing in to a site as account 2 does not affect account 1 |
| C4 | Guide "sites" step | Rows show "Signed in ✓ / Sign in" automatically (no "I'm signed in" button); signing in inside the window flips the row within ~3 s |
| C5 | "Log out" on a site | `waitplay --logout=<site>` runs; row flips to "Sign in"; cookies are gone in the entertainment window |
| C6 | Open a site window **while** the guide's sites step is showing | The window renders normally (no blank/black page) and no second web view fights it. (On Windows an earlier version opened a second web view on the same profile and every site window turned black; the tray app must never open a web view on the entertainment store; it only reads `vibeplay-logins.json` and starts the helper when no window is open) |
| C7 | Helper process | `waitplay --logins` exits by itself, shows no Dock icon, and writes a fresh `vibeplay-logins.json`. **Unknown:** whether a `WKWebView` inside an `ActivationPolicy::Prohibited` process can load `about:blank` and return cookies. If not, switch the helper to `Accessory`, or read cookies from the tray process behind a `pause` window, or read the WebKit cookie file directly |
| C8 | Cross-process cookie freshness | Sign in to X in the window, check the file within 3-6 s. The window process writes it itself, so it should be right; the helper process may see stale cookies until WebKit flushes. If stale, add a short wait/`WKHTTPCookieStore` flush before `detect` |

### D. Preferences sync
| ID | Steps | Expected |
|---|---|---|
| D1 | Change widget position / sounds / appearance | 3 s later the log has no "preferences could not be saved"; Supabase `user_preferences.data` row for the user updated (dashboard) |
| D2 | Sign out and in again, or sign in on another machine (Windows build works) | Preferences restored; log "restoring N saved preferences"; widget moves to the saved position |
| D3 | Settings that must NOT sync | `launchAtLogin`, `soundCustomFile`, `watchers`, `showDockIcon` are not in the saved row |
| D4 | Cross-platform | A Windows-saved `widgetPosition` of `top-center` shows as "Notch" on Mac and works with and without a camera notch |

### E. Widget and hover
| ID | Steps | Expected | Notes |
|---|---|---|---|
| E1 | Move the pointer slowly onto the closed widget | After ~120 ms it grows ~5% (top-centre: from the top edge), after ~200 ms it expands to the panel; leaving collapses it ~220 ms later and removes the grow | **Main risk.** The widget window is created with `with_focusable(false)` at window level 25 in an `Accessory` app (`mac/app.rs`, `platform::set_window_level`). WKWebView normally delivers `pointerenter`/`pointermove` only to the key window unless the tracking area is `NSTrackingActiveAlways`. If hover never fires: add a native fix in `platform/macos.rs` (e.g. install an `NSTrackingArea` with `ActiveAlways | MouseEnteredAndExited | MouseMoved` on the widget window's content view and forward `mouseMoved` into the page, or poll `NSEvent.mouseLocation` from the 1 s/100 ms tick and call `wpWidget.hover(bool)`), keeping `with_accept_first_mouse(true)`. Add `window.wpWidget.hover = on => ...` in `mac_widget.html` that sets `pointerIn` and runs the same code as `pointerenter`/`pointerleave` |
| E2 | Fast pass over the widget | No grow, no expansion | |
| E3 | Click toggles expansion; Escape closes | | |
| E4 | Camera-notch Mac vs external display / pre-2021 Mac | Camera notch: shape starts exactly the size of the hardware notch (`platform::notch_size`), flush with the display top; no notch: floating capsule under the menu bar | Check the 5% grow does not clip at the screen edge (`PAD_X`/`PAD_B` in the page) |
| E5 | Status states | Idle / Working (timer, bars) / Waiting / Done / Error colours; toasts; session list; mascot | |
| E7 | Native glass view | Look closely behind the widget: is there any blur/tint from the attached `NSVisualEffectView`? If not (expected), decide: feed it (`reportShape`-style message from the page) or delete `platform::Glass` and update `docs/MACOS.md` | |
| E6 | Corner positions | Top right / Bottom right / Bottom left pills render and expand; (drag is Windows-only, see 5.5) | |

### F. Agent integration end to end (smoke, per agent you have)
Install Claude Code hooks from the guide, then run a real prompt: the notch shows "<Agent> is working" with a timer, the entertainment window opens on the preferred site, hides/closes when the agent finishes (per "When the agent finishes"). Also run `waitplay-hook simulate` and `bash packaging/macos/smoke.sh` (see 5.1; it needs the fix there first).

### G. Build, install, update
`build_app.sh` produces `.app` + `.dmg` for both architectures; install the DMG on a clean user account; Gatekeeper behaviour (unsigned: right-click Open); LaunchAgent starts the app at login and the app starts silently into the menu bar; installing a newer build over the old one keeps settings, logins and account. Keychain access prompts after an update are expected for ad-hoc signed builds.

## 5. Work left to complete (do these, then re-run section 4)

1. **Fix the macOS smoke test / CI (it will break).** `packaging/macos/smoke.sh` starts the app and expects a prompt to open the
   entertainment window and a widget at `bottom-right`. The app now starts **signed out**, so the gate keeps automation off and the guide
   opens. Add a test-only bypass: in the `test-hooks` feature build only (`crates/waitplay-app/Cargo.toml`: `test-hooks = []`), make
   `account_gate()` return false and skip the gate in `init` when `WAITPLAY_TEST_SKIP_ACCOUNT=1` (do the same in `win/app.rs`), have
   `smoke.sh`'s `new_env` create `.../WaitPlay/onboarded`, and set the env var. Re-check the smoke expectations against current defaults
   (the default widget position is the notch / `top-center`, not `bottom-right`; the settings window is larger; screenshots 02/06 changed).
   Update `.github/workflows/macos.yml` accordingly. Keep a shipped binary unable to skip the gate.
2. **Rename macOS artifacts to Vibe Play.** `build_app.sh`, `verify_release.sh`, `.github/workflows/macos.yml`, `docs/MACOS.md`,
   `docs/RELEASING.md`, `docs/RELEASE_SIGNING.md`: `WaitPlay.app` -> `VibePlay.app` (keep the bundle id `com.waitplay.app` and the data
   folder `WaitPlay`, which hold users' logins) and `WaitPlay-<version>-<arch>.dmg` -> `VibePlay-<version>-<arch>.dmg`. Windows already
   ships `VibePlay-<version>-windows-x64-setup.exe`. Check `mac/login_item.rs` (LaunchAgent label) and `Info.plist.in` display name.
3. **Fix whatever section 4 finds**, most likely E1 (hover), C7/C8 (login helper), B1 (`color-mix`), C3 (store isolation).
4. **macOS < 14**: `with_data_store_identifier` does not exist, so accounts share one store. Decide: raise `LSMinimumSystemVersion` to 14,
   or keep 11 and show a note in Settings -> Account ("Sites stay signed in for everyone who uses this Mac"), or implement a
   cookie-swap fallback. Do not claim isolation where it does not exist.
5. **Parity gaps that predate this work:** corner-pill dragging (the page enables drag only with `S.clip`; implement macOS drag via
   `window.drag_window()`/`drag` IPC and a saved anchor like `win/app.rs` does), hide the widget over native-fullscreen apps (Windows:
   `native::fullscreen_app_active`), a Permissions step in the guide (macOS has real permissions: Accessibility, Screen Recording).
6. **Signing / notarization** (needs the Apple Developer ID the owner does not have yet): follow `docs/RELEASE_SIGNING.md`. Until then
   builds are ad-hoc signed `*-UNSIGNED.dmg`. "Sign in with Apple" stays disabled (`appleEnabled: false`).
7. **Not Mac-specific but still open:** no payment provider (Pro/Teams cards are "Planned" and Upgrade is disabled), real-email flows
   (sign-up code, password reset) never run with real mail, no updater.

## 6. Definition of done
- `cargo test --workspace` green on macOS; `cargo build --release --workspace` for both targets; `build_app.sh` produces a DMG.
- Every row in section 4 passes, or has a documented, intentional limitation in `docs/MACOS.md`.
- `smoke.sh` passes in CI with the bypass; shipped binary cannot bypass the gate.
- Artifacts renamed; docs updated (`docs/MACOS.md`, `docs/RELEASING.md`); changes pushed to `main` in small commits.
- No secrets committed; no changes to the Windows behaviour (re-run `cargo test --workspace` and `cargo check` for the Windows target if you
  can, or leave Windows files alone).
