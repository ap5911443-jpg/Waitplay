#!/usr/bin/env node
/**
 * Accurate OMP (oh-my-pi) Session Watcher for WaitPlay
 *
 * Dedicated trigger architecture designed specifically for how OMP works:
 * - Detects user prompt in active .jsonl session -> Emits task_started -> Spawns native WaitPlay app
 * - Tracks tool execution start/results -> Keeps task_running active across multiple tools
 * - Only completes when assistant outputs final text with 0 pending tools and settles
 */

import fs from "node:fs";
import path from "node:path";
import http from "node:http";
import os from "node:os";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SESSIONS_DIR = "C:/Users/ASUS/.omp/agent/sessions/-tmp";
const BRIDGE_PORT = parseInt(process.env.BRIDGE_PORT || "3150", 10);
const NATIVE_APP = fs.existsSync("C:\\Users\\ASUS\\waitplay\\apps\\native\\WaitPlay.exe") ? "C:\\Users\\ASUS\\waitplay\\apps\\native\\WaitPlay.exe" : "C:\\Users\\ASUS\\AppData\\Local\\Temp\\waitplay\\apps\\native\\WaitPlay.exe";
const DISMISS_FILE = path.join(os.tmpdir(), "waitplay", ".waitplay-dismissed.json");

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
  if (now - lastPopTime < 4000) {
    // Debounce duplicate pop requests within 4 seconds
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

function sendBridgeEvent(event, data) {
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
  console.log(`[OMP Watcher] Event -> ${event}`);
}

function getLatestSessionFile() {
  if (!fs.existsSync(SESSIONS_DIR)) return null;
  const files = fs
    .readdirSync(SESSIONS_DIR)
    .filter((f) => f.endsWith(".jsonl"))
    .map((f) => {
      const p = path.join(SESSIONS_DIR, f);
      return { path: p, mtime: fs.statSync(p).mtimeMs };
    })
    .sort((a, b) => b.mtime - a.mtime);

  return files.length > 0 ? files[0].path : null;
}

let activeFile = getLatestSessionFile();
let filePosition = 0;
let remainderBuffer = "";
let isWorking = false;
let pendingTools = 0;
let finishDebounceTimer = null;
let currentPromptTimestamp = 0;
let currentModel = "Gemini 3.8 Flash";

if (activeFile) {
  const stat = fs.statSync(activeFile);
  filePosition = stat.size;
  console.log(`[OMP Watcher] Tailing session: ${path.basename(activeFile)} at byte ${filePosition}`);
}

function processLine(line) {
  if (!line || !line.trim()) return;

  try {
    const entry = JSON.parse(line.trim());

    // ANY line arriving means the session is still active.
    // Cancel any pending completion timer immediately — we re-evaluate below.
    if (finishDebounceTimer) {
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

    // 4. System/custom events (todo_hud_state, launch-completion, image-attachment, etc.)
    //    These indicate continued activity — keep isWorking true, no completion.
    if (entry.type === "custom" || entry.type === "custom_message" || entry.type === "internal") {
      isWorking = true;
      return;
    }

    // 5. Assistant message: Check stopReason and pending tools
    if (entry.type === "message" && entry.message?.role === "assistant") {
      if (entry.message.model) {
        currentModel = formatModelName(entry.message.model);
      }

      const stopReason = entry.message.stopReason;
      const content = entry.message.content || [];
      const hasToolCall = Array.isArray(content) && content.some((c) => c && c.type === "toolCall");

      if (stopReason === "toolUse" || hasToolCall) {
        // Model is requesting another tool -> CANNOT BE FINISHED!
        isWorking = true;
        sendBridgeEvent("task_running", { model: currentModel });
        return;
      }
      if ((stopReason === "stop" || stopReason === "end_turn") && pendingTools === 0) {
        // Debounce for 5s to verify OMP turn has truly settled.
        // Subagent work and system events can cause multi-second gaps
        // between JSONL writes while the agent is still active.
        finishDebounceTimer = setTimeout(() => {
          isWorking = false;
          finishDebounceTimer = null;
          console.log("[OMP Watcher] OMP turn fully settled and complete!");
          clearDismissal("omp-session");
          sendBridgeEvent("task_completed", { model: currentModel });
        }, 5000);
      } else {
        // Intermediate reasoning or thinking
        isWorking = true;
        sendBridgeEvent("task_running", { model: currentModel });
      }
    }
  } catch (err) {
    // Ignore malformed JSON line fragments
  }
}

function checkFileUpdates() {
  const latest = getLatestSessionFile();
  if (latest && latest !== activeFile) {
    activeFile = latest;
    filePosition = 0;
    remainderBuffer = "";
    console.log(`[OMP Watcher] Switched to new session file: ${path.basename(activeFile)}`);
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

// Poll session file every 150ms
setInterval(checkFileUpdates, 150);
console.log("[OMP Watcher] Started! Monitoring OMP session activity...");
