# OpenAI Codex Integration for WaitPlay

This directory provides real-time integration between **OpenAI Codex** and the **WaitPlay** gaming companion.

## How It Works

1. **Prompt Submission & Reasoning Detection:**
   `codex-watcher.cjs` monitors Codex's local operational database (`~/.codex/logs_2.sqlite`) using read-only WAL polling. When the user submits a prompt and Codex begins reasoning or loading tools:
   - Emits `task_started` to WaitPlay Local Companion Bridge (`http://127.0.0.1:3100/events`).
   - Automatically pops a dedicated app window of WaitPlay (`--app=http://127.0.0.1:5200/?popup=1`) in Microsoft Edge or Google Chrome.
   - The game launches instantly with zero delay.

2. **Work Execution & Tool Activity:**
   As Codex executes commands, tools, and reasoning steps, `task_running` events update telemetry in real time.

3. **Turn Completion & Game Exit:**
   When Codex finishes its turn:
   - `notify` in `~/.codex/config.toml` runs `codex-notify.cjs`.
   - Emits `task_completed` to WaitPlay Bridge.
   - Forwards to original computer-use notification targets.
   - Immediately quits the game, displays a brief results summary, and closes the popup window.

## Configuration

In `~/.codex/config.toml`:

```toml
notify = [ "node", "C:\\Users\\ASUS\\AppData\\Local\\Temp\\waitplay\\integrations\\codex\\codex-notify.cjs" ]
```

## Running the Watcher

Run from the `waitplay` root directory:

```bash
npm run codex:watch
```

Or double-click `start-watcher.bat`.
