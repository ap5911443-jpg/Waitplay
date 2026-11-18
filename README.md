# WaitPlay 🎮

> **The zero-interruption gaming companion for AI coding agents.**  
> Play quick micro-games while your coding agent thinks, reasons, and executes tools.

![WaitPlay Banner](docs/banner.png) *(optional preview)*

WaitPlay detects when your AI coding agent begins working and automatically opens a companion popup. By default it presents an authentic **Instagram experience** (feed, stories, and Reels) so you can scroll while the agent reasons; a **Micro-Games** tab and **YouTube** tab are one click away. When the agent finishes, WaitPlay surfaces a completion summary and returns focus to your terminal.

---

## ✨ Features

- **⚡ Instant Agent Trigger:** Hooks directly into prompt submission and tool execution events across 8 major coding agent environments.
- **🔘 Wispr Flow-Style Desktop Toggle Widget:** A sleek, always-on-top, draggable floating pill widget docked to your screen edge (with `Alt+W` global hotkey, cyan active indicator dot, and direct gamepad launcher) to toggle WaitPlay ON / OFF instantly.
- **🪟 Parent Window Synchronization:** Automatically detects when you minimize your parent terminal or IDE (Windows Terminal, VS Code, Cursor, Command Prompt) and minimizes WaitPlay off-screen. Restoring the terminal restores WaitPlay without losing your game board or score.
- **🧠 Stays in RAM, resumes where you left off, costs almost none:** The task ending, scrolling or typing in the terminal that owns the window, **X**, **Esc** and **Alt+F4** hide the companion instead of closing it. The page, the reel position, the scroll and the game board stay in memory (your login is kept on disk), the video is paused and muted while the window is hidden, and the next prompt or the widget button brings the same window back from the same spot. Instagram, X and YouTube each keep their own window. A hidden window is frozen like an Edge "sleeping tab" and its physical RAM is handed back to Windows (nothing is discarded; it pages back in on demand, about 1-2 s): measured on a loaded youtube.com page the whole companion drops from about 345 MB in Task Manager's Memory column to about 10 MB, and its commit charge shrinks by roughly 30%. Right-click the widget and choose **Quit companion** to free everything, or turn WaitPlay off with `Alt+W`.
- **🔑 Sign in once:** Instagram, YouTube and X run in WaitPlay's own browser profile, `%LOCALAPPDATA%\WaitPlay\webview2` (not `%TEMP%`, which Storage Sense and cleaner tools empty). Logins survive restarts, rebuilds and updates; a profile left in `%TEMP%\waitplay` by an older build is moved there automatically, so existing logins carry over. WaitPlay does not read your default browser's logins: Chromium browsers lock and encrypt them against other apps. Set `WAITPLAY_PROFILE_DIR` to keep the profile somewhere else.
- **🎯 Multi-Agent & Multi-Terminal Support:** Isolated state tracking across simultaneous terminal sessions, preventing agent conflicts.
- **🔒 Local Security First:** Bridge operates strictly on loopback (`127.0.0.1:3150`) with auto-generated secure token authentication and payload validation.
- **💻 Dual Interface Options:**
  - **Native Windows WPF App (`apps/native`):** Lightweight, zero-dependency C# native window with smooth animations, keyboard hotkeys, and native Win32 window docking.
  - **Modern Web HUD (`apps/web`):** Built with React 18, Vite, Tailwind CSS, Lucide icons, sound synthesis, and full-screen / floating dock modes.

---

## 🤖 Supported Agents & Integrations

| Agent | Directory | Trigger Mechanism |
| :--- | :--- | :--- |
| **Claude Code** | `integrations/claude-code/` | Session notification hook (`waitplay-hook.cjs`) |
| **OpenAI Codex** | `integrations/codex/` | Turn notification script (`codex-notify.cjs`) |
| **Cline** | `integrations/cline/` | Real-time state watcher (`cline-watcher.cjs`) |
| **Cursor** | `integrations/cursor/` | Editor trigger hook (`cursor-hook.cjs`) |
| **Google Antigravity** | `integrations/antigravity/` | Task dispatcher hook (`antigravity-hook.cjs`) |
| **OpenCode** | `integrations/opencode/` | JSON-RPC bridge watcher (`opencode-watcher.cjs`) |
| **Oh-My-Pi (OMP)** | `integrations/omp/` | Real-time session watcher & extension (`waitplay.ts`) |
| **Model Context Protocol** | `integrations/mcp/` | MCP Server tool integration (`waitplay-mcp.cjs`) |

---

## 📁 Repository Structure

```
waitplay/
├── apps/
│   ├── bridge/           # Node.js WebSocket & REST event bridge (port 3150)
│   ├── native/           # Native Windows WPF companion app (WaitPlay.cs / .exe)
│   └── web/              # React 18 + Vite web companion frontend (port 5200)
├── packages/
│   └── shared/           # Event protocol, state machine, and TypeScript types
├── integrations/         # Dedicated hooks and watchers for all supported agents
├── docs/                 # Architecture, event protocols, and guides
├── package.json          # Root workspace configuration
└── tsconfig.base.json    # Shared TypeScript compiler config
```

---

## 🚀 Quick Start

### 1. Install Dependencies

```bash
git clone https://github.com/your-username/waitplay.git
cd waitplay
npm install
```

### 2. Build the Project

```bash
# Build shared library, bridge service, and web UI
npm run build

# (Optional) Recompile the native Windows application
npm run build:native
```

> **Companion UI:** The native Windows app embeds a **WebView2** (Chromium) control that acts as a browser: on agent start it opens the live **[instagram.com](https://www.instagram.com/)** with a slim toolbar (back / forward / reload / editable address bar / home). Your logins persist in `%LOCALAPPDATA%\WaitPlay\webview2` (see "Sign in once" above). The WebView2 runtime ships with modern Windows; no extra install is required. (A separate React companion with an Instagram clone, micro-games, and YouTube still lives in `apps/web` and runs via `npm run dev:web`.)

### 3. Run the Test Suite

```bash
npm test
```
*Executes all 31 unit and integration tests across the event protocol, state machine, and bridge security.*

---

### Phone completion notifications (optional)

The bridge can send an SMS through Twilio whenever an agent transitions to `COMPLETED`. Set these environment variables before starting the bridge:

```bash
TWILIO_ACCOUNT_SID=AC...
TWILIO_AUTH_TOKEN=...
TWILIO_FROM_NUMBER=+15550001111
WAITPLAY_NOTIFICATION_PHONE=+15550002222
```

If any variable is missing, phone notifications stay disabled and WaitPlay continues normally. Notification failures are logged without blocking agent events.

## 🕹️ Running WaitPlay

### Mode A: Wispr Flow Floating Widget (Desktop Overlay)

Run the floating desktop widget on your screen (draggable, always on top):
```bash
npm run widget
# Or run WaitPlay.exe directly
./apps/native/WaitPlay.exe --widget
```
- Click the **ON/OFF** pill or press **Alt+W** anywhere to toggle WaitPlay.
- Click the **🎮 Gamepad** button to open the companion game.
- Right-click the widget → **Quit companion (free RAM)** to really close the parked windows (X only hides them). They exit cleanly, so the browser saves your logins first, and nothing is left running.
- Toggle state instantly via CLI: `npm run toggle`

### Mode B: Native Desktop Companion Window

Run the native companion directly:
```bash
./apps/native/WaitPlay.exe
```
Or start the bridge and watcher for your preferred agent:
```bash
# Start OMP watcher
npm run omp:watch

# Start Codex watcher
npm run codex:watch

# Start OpenCode watcher
npm run opencode:watch
```

### Mode B: Browser Web HUD

```bash
# Terminal 1: Start Bridge Service (port 3150)
npm run dev:bridge

# Terminal 2: Start Web Application (port 5200)
npm run dev:web
```
Open `http://localhost:5200` to interact with the game dashboard, live event stream, and game simulator.

---

## 📖 Documentation

- [System Architecture](docs/ARCHITECTURE.md)
- [Event Protocol Specification](docs/EVENT_PROTOCOL.md)
- [Getting Started Guide](docs/GETTING_STARTED.md)

---

## 📄 License

MIT License. Free to use and modify.
