#!/usr/bin/env node
/**
 * Accurate OMP (oh-my-pi) Session Watcher for WaitPlay
 *
 * Dedicated trigger architecture designed specifically for how OMP works:
 * - Detects user prompt in active .jsonl session -> Emits task_started -> Spawns native WaitPlay app
 * - Tracks tool execution start/results -> Keeps task_running active across multiple tools
 * - Completes when the assistant stops with no pending tools; aborts and errors also end the turn after a quiet period
 * - While a turn is open, repeats task_running every 5 s so silent tool runs keep the popup
 */

import fs from "node:fs";
import path from "node:path";
import http from "node:http";
import os from "node:os";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SESSIONS_ROOT = path.join(os.homedir(), ".omp", "agent", "sessions");
const BRIDGE_PORT = parseInt(process.env.BRIDGE_PORT || "3150", 10);
const NATIVE_APP = path.resolve(__dirname, "..", "..", "apps", "native", "WaitPlay.exe");
const DISMISS_FILE = path.join(os.tmpdir(), "waitplay", ".waitplay-dismissed.json");
// Turn-end signal for the companion; works without the bridge. The name must match MainWindow.SignalFileId on the native side.
const CLOSE_FILE = path.join(os.tmpdir(), "waitplay", ".waitplay-close-omp-session.json");
const HEARTBEAT_MS = 5000;
// Silent turns stop heartbeating after this much session silence. Keep it above RETRY_SETTLE_MS or the bridge watchdog closes first.
const MAX_SILENT_TURN_MS = parseInt(process.env.OMP_WATCH_MAX_SILENT_MS || "600000", 10);
const SETTLE_MS = 1500; // stop and aborted: output has settled
const RETRY_SETTLE_MS = 120000; // error and length: OMP retries or compacts; gaps seen up to ~2 min

function isWaitPlayEnabled() {
  try {
    const candidates = [
      path.join(os.tmpdir(), 'waitplay', '.waitplay-enabled.json'),
      path.resolve(__dirname, '..', '..', '.waitplay-enabled.json'),
      'C:\\Users\\ASUS\\waitplay\\.waitplay-enabled.json',
      'C:\\Users\\ASUS\\AppData\\Local\\Temp\\waitplay\\.waitplay-enabled.json',
    ];
    for (const p of candidates) {
      if (fs.existsSync(p)) {
        const data = JSON.parse(fs.readFileSync(p, 'utf-8'));
        if (data && data.enabled === false) return false;
      }
    }
  } catch {}
  return true;
}

function isPromptDismissed(sessionId) {
  try {
    if (!sessionId) return false;
    if (fs.existsSync(DISMISS_FILE)) {
      const data = JSON.parse(fs.readFileSync(DISMISS_FILE, "utf-8"));
      const entry = data[sessionId];
      if (entry && entry.dismissed === true) {
        const now = Date.now();
        if (entry.dismissedAt && (now - entry.dismissedAt) > 300000) {
          clearDismissal(sessionId);
          return false;
        }
        return true;
      }
    }
  } catch {}
  return false;
}

function clearDismissal(sessionId) {
  try {
    if (!sessionId) return;
    if (fs.existsSync(DISMISS_FILE)) {
      const data = JSON.parse(fs.readFileSync(DISMISS_FILE, "utf-8"));
      if (data[sessionId]) {
        delete data[sessionId];
        fs.writeFileSync(DISMISS_FILE, JSON.stringify(data, null, 2), "utf-8");
      }
    }
  } catch {}
}

// Locate bridge security token
function getBridgeToken() {
  const candidates = [
    "C:/Users/ASUS/waitplay/apps/bridge/.bridge-token",
    path.resolve(__dirname, "..", "..", "apps", "bridge", ".bridge-token"),
    path.resolve(__dirname, "..", "..", ".bridge-token"),
    "C:/Users/ASUS/waitplay/.bridge-token",
    path.join(os.tmpdir(), "waitplay", ".bridge-token"),
  ];
  for (const p of candidates) {
    try {
      if (fs.existsSync(p)) {
        return fs.readFileSync(p, "utf-8").trim();
      }
    } catch {}
  }
  return process.env.BRIDGE_AUTH_TOKEN || "";
}
let lastPopTime = 0;
function popApp() {
  if (!isWaitPlayEnabled()) {
    return;
  }
  if (isPromptDismissed("omp-session")) {
    console.log("[OMP Watcher] Prompt was dismissed by user, skipping popApp.");
    return;
  }
  const now = Date.now();
  if (now - lastPopTime < 1500) {
    // Debounce duplicate pop requests within 1.5 seconds
    return;
  }
  lastPopTime = now;
  try {
    if (fs.existsSync(NATIVE_APP)) {
      const args = ["--session=omp-session", `--parentPid=${process.pid}`];
      const child = spawn(NATIVE_APP, args, {
        detached: true,
        stdio: "ignore",
      });
      child.unref();
    }
  } catch {}
}

function formatModelName(raw) {
  if (!raw) return "Gemini 3.8 Flash";
  if (raw.includes("gemini-3.8-flash") || raw.includes("gemini-3.8")) return "Gemini 3.8 Flash";
  if (raw.includes("sonnet")) return "Claude 3.7 Sonnet";
  if (raw.includes("opus")) return "Claude 3 Opus";
  if (raw.includes("haiku")) return "Claude 3.5 Haiku";
  if (raw.includes("gpt-4o")) return "GPT-4o";
  if (raw.includes("o3")) return "o3-mini";
  return raw.split("/").pop() || raw;
}

function sendBridgeEvent(event, data, { quiet = false } = {}) {
  const token = getBridgeToken();
  const payload = JSON.stringify({
    agent: "omp",
    sessionId: "omp-session",
    event,
    timestamp: Date.now(),
    data,
  });

  const req = http.request(
    {
      hostname: "127.0.0.1",
      port: BRIDGE_PORT,
      path: "/events",
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Content-Length": Buffer.byteLength(payload),
        "x-bridge-token": token,
      },
      timeout: 1000,
    },
    (res) => {
      res.resume();
    }
  );

  req.on("error", () => {});
  req.write(payload);
  req.end();
  if (!quiet) console.log(`[OMP Watcher] Event -> ${event}`);
}

// OMP writes sessions/<project-slug>/<timestamp>_<id>.jsonl. The newest file across all projects is the active session.
function getLatestSessionFile() {
  if (!fs.existsSync(SESSIONS_ROOT)) return null;
  let latest = null;
  for (const slug of fs.readdirSync(SESSIONS_ROOT)) {
    const dir = path.join(SESSIONS_ROOT, slug);
    let names;
    try {
      names = fs.readdirSync(dir);
    } catch {
      continue; // loose file in the sessions root, not a project dir
    }
    for (const name of names) {
      if (!name.endsWith(".jsonl")) continue;
      const p = path.join(dir, name);
      let mtime;
      try {
        mtime = fs.statSync(p).mtimeMs;
      } catch {
        continue; // deleted mid-scan
      }
      if (!latest || mtime > latest.mtime) latest = { path: p, mtime };
    }
  }
  return latest ? latest.path : null;
}

const startedAt = Date.now();
const resumeOffsets = new Map(); // session file -> first byte not yet processed
let lastDiscoveryAt = 0;
let activeFile = null;
let filePosition = 0;
let remainderBuffer = "";
let isWorking = false;
let pendingTools = 0;
let finishDebounceTimer = null;
let currentPromptTimestamp = 0;
let currentModel = "Gemini 3.8 Flash";
let lastOutputAt = 0; // last session line; a turn silent for MAX_SILENT_TURN_MS stops heartbeating

// Sessions created after this watcher started are read from byte 0; older ones start at EOF so old prompts never replay.
function startOffsetFor(file) {
  if (resumeOffsets.has(file)) return resumeOffsets.get(file);
  const stat = fs.statSync(file);
  return stat.birthtimeMs >= startedAt ? 0 : stat.size;
}

function discoverSessionFile() {
  lastDiscoveryAt = Date.now();
  const latest = getLatestSessionFile();
  if (!latest || latest === activeFile) return;
  const offset = startOffsetFor(latest);
  if (activeFile) {
    resumeOffsets.set(activeFile, filePosition - Buffer.byteLength(remainderBuffer, "utf-8"));
  }
  activeFile = latest;
  filePosition = offset;
  remainderBuffer = "";
  console.log(`[OMP Watcher] Tailing session: ${path.basename(activeFile)} at byte ${filePosition}`);
}

// Write-then-rename, so the companion never reads a half-written file
function writeCloseSignal() {
  try {
    fs.mkdirSync(path.dirname(CLOSE_FILE), { recursive: true });
    const tmp = `${CLOSE_FILE}.${process.pid}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify({ sessionId: "omp-session", ts: Date.now() }));
    fs.renameSync(tmp, CLOSE_FILE);
  } catch {}
}

// Ends the open turn after delayMs with no agent activity. Any activity cancels it (see processLine).
function scheduleTurnEnd(delayMs) {
  clearTimeout(finishDebounceTimer);
  finishDebounceTimer = setTimeout(() => {
    isWorking = false;
    finishDebounceTimer = null;
    console.log("[OMP Watcher] OMP turn fully settled and complete!");
    clearDismissal("omp-session");
    writeCloseSignal();
    sendBridgeEvent("task_completed", { model: currentModel });
  }, delayMs);
}

function processLine(line) {
  if (!line || !line.trim()) return;
  lastOutputAt = Date.now();

  try {
    const entry = JSON.parse(line.trim());

    // Agent activity re-opens the turn: cancel a pending completion, then re-evaluate below.
    // Session metadata and injected messages (model_change, session_exit, todo_hud_state…) do not.
    const isActivity =
      (entry.type === "message" && ["user", "assistant", "toolResult"].includes(entry.message?.role)) ||
      (entry.type === "custom" && entry.customType === "tool_execution_start");
    if (isActivity && finishDebounceTimer) {
      clearTimeout(finishDebounceTimer);
      finishDebounceTimer = null;
      console.log("[OMP Watcher] Completion timer cancelled — new activity detected");
    }

    // 1. User Prompt Submitted: Task Starts!
    if (entry.type === "message" && entry.message?.role === "user") {
      isWorking = true;
      pendingTools = 0;
      const promptTimestamp = Date.now();
      currentPromptTimestamp = promptTimestamp;

      let promptText = "";
      if (typeof entry.message.content === "string") {
        promptText = entry.message.content;
      } else if (Array.isArray(entry.message.content)) {
        promptText = entry.message.content
          .filter((p) => p && p.type === "text")
          .map((p) => p.text)
          .join(" ");
      }
      if (promptText.length > 100) promptText = promptText.slice(0, 100) + "...";

      console.log(`[OMP Watcher] User prompt submitted! Starting task... (${promptText})`);
      sendBridgeEvent("task_started", {
        model: currentModel,
        prompt: promptText,
        promptTime: promptTimestamp,
      });

      clearDismissal("omp-session");
      if (!isPromptDismissed("omp-session")) {
        popApp(promptTimestamp);
      } else {
        console.log("[OMP Watcher] Prompt was dismissed by user, skipping popApp.");
      }
      return;
    }

    // 2. Tool Execution Start: Increment pending tools count
    if (entry.type === "custom" && entry.customType === "tool_execution_start") {
      isWorking = true;
      pendingTools++;
      const toolName = entry.data?.toolName || "tool";
      console.log(`[OMP Watcher] Tool started: ${toolName} (pending: ${pendingTools})`);
      sendBridgeEvent("task_running", { tool: toolName, model: currentModel });
      return;
    }

    // 3. Tool Result Returned: Decrement pending tools count
    if (entry.type === "message" && entry.message?.role === "toolResult") {
      pendingTools = Math.max(0, pendingTools - 1);
      isWorking = true;
      console.log(`[OMP Watcher] Tool finished (pending: ${pendingTools})`);
      sendBridgeEvent("task_running", { model: currentModel });
      return;
    }

    // 4. Session metadata and injected messages are not agent output: they never open or close a turn.
    //    A session_exit ends an open turn, so it settles at once.
    if (entry.type === "custom" && entry.customType === "session_exit") {
      if (isWorking) scheduleTurnEnd(SETTLE_MS);
      return;
    }
    if (entry.type === "custom" || entry.type === "custom_message" || entry.type === "internal") return;

    // 5. Assistant message: its stopReason decides whether the turn can end.
    if (entry.type === "message" && entry.message?.role === "assistant") {
      if (entry.message.model) {
        currentModel = formatModelName(entry.message.model);
      }
      isWorking = true;

      const stopReason = entry.message.stopReason;
      const content = entry.message.content || [];
      const hasToolCall = Array.isArray(content) && content.some((c) => c && c.type === "toolCall");
      // error and aborted cut the turn off: the tools they requested never run, so pendingTools does not gate them.
      const cutOff = stopReason === "error" || stopReason === "aborted";

      if (!cutOff && (stopReason === "toolUse" || hasToolCall)) {
        // Model is requesting another tool -> CANNOT BE FINISHED!
        sendBridgeEvent("task_running", { model: currentModel });
        return;
      }
      if (cutOff || ((stopReason === "stop" || stopReason === "end_turn" || stopReason === "length") && pendingTools === 0)) {
        // OMP retries errors and compacts after length, usually within tens of seconds, so those wait longer.
        scheduleTurnEnd(stopReason === "error" || stopReason === "length" ? RETRY_SETTLE_MS : SETTLE_MS);
      } else {
        // Intermediate reasoning or thinking
        sendBridgeEvent("task_running", { model: currentModel });
      }
    }
  } catch (err) {
    // Ignore malformed JSON line fragments
  }
}

function checkFileUpdates() {
  if (Date.now() - lastDiscoveryAt >= 1000) {
    try {
      discoverSessionFile();
    } catch {
      // sessions root briefly unreadable; retry next tick
    }
  }

  if (!activeFile || !fs.existsSync(activeFile)) return;

  try {
    const stat = fs.statSync(activeFile);
    if (stat.size <= filePosition) return;

    const fd = fs.openSync(activeFile, "r");
    const bufferLength = stat.size - filePosition;
    const buffer = Buffer.alloc(bufferLength);
    fs.readSync(fd, buffer, 0, bufferLength, filePosition);
    fs.closeSync(fd);

    filePosition = stat.size;
    const chunkText = remainderBuffer + buffer.toString("utf-8");
    const lines = chunkText.split(/\r?\n/);
    remainderBuffer = lines.pop() || "";

    for (const line of lines) {
      processLine(line);
    }
  } catch (err) {
    // File I/O transient errors ignored
  }
}

// While a turn is open, repeat task_running so the bridge's 20 s watchdog does not close a silent tool run.
function sendHeartbeat() {
  if (!isWorking || Date.now() - lastOutputAt > MAX_SILENT_TURN_MS) return;
  sendBridgeEvent("task_running", { model: currentModel }, { quiet: true });
}
setInterval(sendHeartbeat, HEARTBEAT_MS);

// Poll session file every 50ms for low-latency open detection
setInterval(checkFileUpdates, 50);
console.log("[OMP Watcher] Started! Monitoring OMP session activity...");
