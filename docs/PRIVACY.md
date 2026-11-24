# WaitPlay privacy policy

*Last updated: 2026-11-24. Applies to the WaitPlay desktop app (macOS and Windows), the agent hooks and the website in this repository.*

**Short version:** WaitPlay has no account, no analytics, no telemetry and no server of its own. Everything it learns about your
coding agents stays on your computer. It connects to the internet only to show you the entertainment site you opened, and, if you
set it up yourself, to send an SMS through Twilio.

## What WaitPlay handles, and where it goes

| Data | Why | Where it goes |
|---|---|---|
| Agent status events: idle / working / waiting / finished, timestamps, session id, agent name, model name, tool name, terminal name | To show the status dot and to open or close the entertainment window | Sent by the hooks to the **bridge on your own computer** (`127.0.0.1:3150`, token protected, loopback only). Kept in the bridge's memory. Not written to disk by WaitPlay, not sent anywhere |
| The first 100 characters of your prompt and, when an agent asks you something, the question | Only to label the session in your own widget and settings | Same as above. These texts are **not** included in the bridge's WebSocket broadcasts and are not sent to any server |
| Your source files, diffs, file contents, API keys | Not needed | **Not read** by WaitPlay |
| Settings (theme, widget corner, platform choice, automation switch) | To remember your choices | A local file (see *Your data on disk*) |
| Sign-ins to Instagram, X or YouTube | So you stay signed in | Stored on disk by the system web view (WebKit on macOS, WebView2 on Windows), exactly like a browser profile. WaitPlay never sees your password |
| Optional SMS (Twilio) | Only if **you** configure it: "WaitPlay: *agent* finished work for session *id*" | Sent to `api.twilio.com` with your Twilio credentials, which you supply. The message contains the agent name, a session id and the duration, **not** your prompt |

## Network connections

1. **The entertainment site you open** (instagram.com, x.com, youtube.com and their login providers). Their own privacy policies
   apply to what you do there; WaitPlay only hosts the page in a window.
2. **api.twilio.com**, only if you configured SMS.
3. **The website** (the marketing site) loads no third-party resources: its fonts are served from the site itself, there are no
   analytics, cookies or trackers.

Nothing else. In particular WaitPlay does not check for updates, report crashes or measure usage.

## Your data on disk

| What | macOS | Windows |
|---|---|---|
| Settings | `~/Library/Application Support/WaitPlay/settings.json` | `%LOCALAPPDATA%\WaitPlay\settings.json` |
| Web sign-ins and site data | managed by WebKit: `~/Library/WebKit/com.waitplay.app` and `~/Library/HTTPStorages/com.waitplay.app.binarycookies` | `%LOCALAPPDATA%\WaitPlay\webview2` |
| Log (no tokens, no prompts) | `~/Library/Logs/WaitPlay/waitplay.log` | `%LOCALAPPDATA%\WaitPlay\logs` (see `docs/WINDOWS.md`) |
| Bridge token and hand-off files (owner-only) | `$TMPDIR/waitplay/` | `%TEMP%\waitplay\` |
| Launch at login | `~/Library/LaunchAgents/com.waitplay.app.plist` | `HKCU\Software\Microsoft\Windows\CurrentVersion\Run`, value `WaitPlay` |
| Hooks WaitPlay added to your agents | `~/.claude/settings.json` (Claude Code), plus the other agents' own settings when you enabled them; a backup `settings.json.waitplay-backup` is left next to it | same, in `%USERPROFILE%` |

## Uninstalling and removing your data

**macOS**
1. In WaitPlay, open *Settings*, and under *Integrations* choose *Remove* for every agent (this takes only WaitPlay's hooks out of
   their configuration files and keeps everything else). Turn off *Launch at login*.
2. Quit WaitPlay from the menu bar item, then drag `WaitPlay.app` from *Applications* to the Trash.
3. Delete the data you no longer want:
   ```sh
   rm -rf ~/Library/Application\ Support/WaitPlay ~/Library/Logs/WaitPlay \
          ~/Library/WebKit/com.waitplay.app ~/Library/HTTPStorages/com.waitplay.app.binarycookies \
          ~/Library/LaunchAgents/com.waitplay.app.plist "${TMPDIR}waitplay"
   ```

**Windows**
1. In WaitPlay's settings, remove the agent integrations and turn off *Launch at login* (which deletes the `Run` registry value).
2. Quit WaitPlay from the tray icon and delete the folder you unpacked it to.
3. Delete the data you no longer want (PowerShell):
   ```powershell
   Remove-Item -Recurse -Force "$env:LOCALAPPDATA\WaitPlay", "$env:TEMP\waitplay"
   Remove-ItemProperty -Path HKCU:\Software\Microsoft\Windows\CurrentVersion\Run -Name WaitPlay -ErrorAction SilentlyContinue
   ```

To remove only your sign-ins, delete the *web sign-ins* folder from the table; the next window starts signed out.

## Children

WaitPlay is a developer tool and is not directed at children.

## Changes and contact

Changes to this policy are made in this file and are visible in the repository history. Questions or concerns: open an issue at
<https://github.com/ap5911443-jpg/waitplay-website/issues>. Security problems: see the repository's security policy.
