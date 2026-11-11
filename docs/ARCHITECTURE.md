# WaitPlay Architecture

WaitPlay is a browser-based interactive gaming companion for users of AI coding agents (initial focus: Claude Code).

## System Architecture

```
+------------------------------------------------------------------+
| Browser (Web Application: React + Vite + Tailwind CSS)           |
|                                                                  |
|  +--------------------+  +------------------+  +---------------+ |
|  | Dashboard          |  | Game Interface   |  | Simulator     | |
|  | - Agent Telemetry  |  | - Memory Match   |  | - Automated   | |
|  | - Connection Card  |  | - Reusable API   |  |   Scenarios   | |
|  | - Score History    |  | - Compact Dock   |  | - Manual Step | |
|  | - Preferences      |  | - Fullscreen     |  |   Events      | |
|  +--------------------+  +------------------+  +---------------+ |
|                                                                  |
|             ^ (WebSocket ws://127.0.0.1:3001/ws)                 |
|             | (HTTP POST /events)                                |
+-------------|----------------------------------------------------+
              |
              v
+------------------------------------------------------------------+
| Local Node.js Companion Bridge (Express + WS Server)             |
|                                                                  |
|  - Token Authentication & Loopback Protection (127.0.0.1 only)    |
|  - Event Protocol Validation (32 KB limit, strict schema)        |
|  - Session Manager & Agent State Machine (Concurrent Sessions)   |
|  - Real-time Broadcast to Connected Browser Tabs                |
+------------------------------------------------------------------+
              ^
              | (HTTP POST /events with x-bridge-token)
+-------------|----------------------------------------------------+
| Coding Agent Hooks (Claude Code)                                 |
|                                                                  |
|  - Hooks: session_start, pre_tool_use, notification, stop        |
+------------------------------------------------------------------+
```

## Security Model

1. **Loopback Only:** All network sockets listen exclusively on `127.0.0.1` and reject non-loopback clients. Host header validation prevents DNS rebinding.
2. **Local Token Authentication:** On startup, the bridge generates a cryptographic token persisted to `.bridge-token` with restricted permissions (`0o600`).
3. **Payload Sanitization:** No prompts, source code, reasoning tokens, credentials, or keys are captured or transmitted.
4. **No Remote Backend / Cloud Dependencies:** Works completely offline and locally on the developer's laptop.

## State Lifecycle Flow

```
   [ IDLE ]
      |
      | task_started
      v
  [ WORKING ] ---- (Completes before start delay) ---> [ COMPLETED ] (Game never opens)
      |
      | Start delay expires (default 4s)
      v
[ GAME_ACTIVE ]
      |
      +--- waiting_for_input ---> [ WAITING_FOR_INPUT ] (Game paused, user alerted)
      |                                  |
      |                                  | task_running (User accepted prompt)
      |                                  v
      +<---------------------------------+
      |
      +--- task_completed -------> [ COMPLETED ] (Game stops, result modal displayed)
      |
      +--- task_failed ----------> [ FAILED ] (Game stops, error banner displayed)
```
