#!/usr/bin/env bash
# Runtime smoke test for a built WaitPlay.app on a real macOS session (CI, or any Mac).
#
#   bash packaging/macos/smoke.sh path/to/WaitPlay.app [output-dir]
#
# Runs the app with an isolated HOME and TMPDIR, then drives the real flow: start, menu-bar item, bridge, widget, settings window,
# a Claude Code prompt through the real hook (entertainment window opens), a second concurrent session, finishing them one by one
# (the window must stay while one is still working), idle CPU. Logs and screenshots go to the output directory.
# Exit status 1 when any check failed; every check prints "ok:" or "FAIL:".
set -u

APP="${1:?usage: smoke.sh path/to/WaitPlay.app [output-dir]}"
OUT="${2:-smoke-out}"
mkdir -p "$OUT"
OUT="$(cd "$OUT" && pwd)"
ROOT="$(mktemp -d)"
export HOME="$ROOT/home"
export TMPDIR="$ROOT/tmp/"
mkdir -p "$HOME/.claude" "$HOME/Library" "$TMPDIR"
BIN="$APP/Contents/MacOS"
LOG="$HOME/Library/Logs/WaitPlay/waitplay.log"
SIG="${TMPDIR}waitplay"
STATE="$SIG/.waitplay-companion-instagram.json"
fail=0

ok() { echo "ok: $1"; }
bad() { echo "FAIL: $1"; fail=1; }

# wait_for <description> <seconds> <command...>
wait_for() {
  local what="$1" secs="$2"
  shift 2
  local i
  for i in $(seq 1 $((secs * 2))); do
    if "$@" >/dev/null 2>&1; then ok "$what"; return 0; fi
    sleep 0.5
  done
  bad "$what (gave up after ${secs}s)"
  return 1
}

shot() { screencapture -x "$OUT/$1.png" 2>/dev/null || echo "note: screencapture unavailable for $1"; }
state_visible() { grep -q "\"visible\":$1" "$STATE"; }
hook() { printf '%s' "$2" | "$BIN/waitplay-hook" claude-code "$1"; }
prompt_json() { printf '{"session_id":"%s","hook_event_name":"UserPromptSubmit","prompt":"smoke","model":"m"}' "$1"; }
stop_json() { printf '{"session_id":"%s","hook_event_name":"Stop","model":"m"}' "$1"; }
tool_json() { printf '{"session_id":"%s","hook_event_name":"PreToolUse","tool_name":"Bash","model":"m"}' "$1"; }
# a real agent keeps reporting tool use; without it the bridge's 20 s watchdog completes a silent session
keepalive() { while :; do hook tool "$(tool_json "$1")"; sleep 4; done; }

echo "== WaitPlay smoke test: $APP"
sw_vers 2>/dev/null | sed 's/^/   /'

"$BIN/waitplay" >"$OUT/app.stdout" 2>&1 &
APP_PID=$!

wait_for "app logged its start" 30 grep -q "started;" "$LOG"
wait_for "menu bar item created" 10 grep -q "menu bar item created" "$LOG"
wait_for "bridge listening on 3150" 30 nc -z 127.0.0.1 3150
wait_for "widget shown" 20 grep -q "widget shown" "$LOG"
kill -0 "$APP_PID" 2>/dev/null && ok "app still running" || bad "app exited early"
sleep 2
shot 01-widget

# a second launch asks the running app to show its settings
"$BIN/waitplay" >/dev/null 2>&1 &
wait_for "settings window opened" 15 grep -q "settings window opened" "$LOG"
sleep 3
shot 02-settings

# idle CPU of the app itself (sampled over ~10 s)
sleep 5
cpu_before="$(ps -o time= -p "$APP_PID" | tr -d ' ')"
sleep 10
cpu_after="$(ps -o time= -p "$APP_PID" | tr -d ' ')"
echo "note: app CPU time $cpu_before -> $cpu_after over 10 s; rss(KB)=$(ps -o rss= -p "$APP_PID" | tr -d ' ')"

# Claude Code prompt through the real hook: the entertainment window must open
hook start "$(prompt_json aaaaaaaa-1111)"
keepalive aaaaaaaa-1111 >/dev/null 2>&1 &
KA_A=$!
wait_for "entertainment window visible" 60 state_visible true
sleep 8
shot 03-entertainment
curl -s http://127.0.0.1:3150/sessions >"$OUT/sessions-1.json" || true
grep -q 'claude-code-aaaaaaaa1111' "$OUT/sessions-1.json" && ok "bridge tracks session claude-code-aaaaaaaa1111" || bad "bridge does not list claude-code-aaaaaaaa1111"

# second concurrent conversation: its own session
hook start "$(prompt_json bbbbbbbb-2222)"
keepalive bbbbbbbb-2222 >/dev/null 2>&1 &
KA_B=$!
sleep 4
curl -s http://127.0.0.1:3150/sessions >"$OUT/sessions-2.json" || true
grep -q 'claude-code-bbbbbbbb2222' "$OUT/sessions-2.json" && ok "second conversation is a separate session" || bad "second session missing"

# first one finishes: the window must stay (the second still works)
kill "$KA_A" 2>/dev/null
hook stop "$(stop_json aaaaaaaa-1111)"
sleep 5
state_visible true && ok "window stays while another session still works" || bad "window hid although a session is still working"
shot 04-one-session-left

# second finishes: now it hides
kill "$KA_B" 2>/dev/null
hook stop "$(stop_json bbbbbbbb-2222)"
wait_for "window hides when the last session finished" 30 state_visible false
sleep 1
shot 05-after-finish
curl -s http://127.0.0.1:3150/sessions >"$OUT/sessions-3.json" || true

echo "== checking the log for errors"
if grep -E ' ERROR ' "$LOG" >"$OUT/errors.log"; then
  bad "the log contains errors:"
  sed 's/^/   /' "$OUT/errors.log"
else
  ok "no errors in the log"
fi

# clean up
kill "$APP_PID" 2>/dev/null
pkill -f "$BIN/waitplay" 2>/dev/null
pkill -f "waitplay-bridge" 2>/dev/null
pkill -f "waitplay-hook" 2>/dev/null
sleep 1
cp "$LOG" "$OUT/waitplay.log" 2>/dev/null
rm -f "$SIG/.bridge-token"
cp -R "$SIG" "$OUT/signals" 2>/dev/null
ps -axo pid,command | grep -i waitplay | grep -v grep >"$OUT/leftover-processes.txt"

if [ "$fail" -eq 0 ]; then echo "== SMOKE TEST PASSED"; else echo "== SMOKE TEST FAILED"; fi
exit "$fail"
