#!/usr/bin/env node
/**
 * WaitPlay Hook Dispatcher for Claude Code
 *
 * Usage:
 *   node waitplay-hook.js <event_name> [sessionId] [optionalJsonData]
 *
 * Example:
 *   node waitplay-hook.js task_started session-abc '{"prompt":"Refactor auth"}'
 */

const fs = require("node:fs");
const path = require("node:path");
const http = require("node:http");

const event = process.argv[2];
const sessionId = process.argv[3] || process.env.CLAUDE_SESSION_ID || "claude-session";
const rawData = process.argv[4];

if (!event) {
  console.error("Usage: node waitplay-hook.js <event> [sessionId] [dataJson]");
  process.exit(1);
}

// Locate .bridge-token in current directory or parent directories
function findToken() {
  let curr = process.cwd();
  for (let i = 0; i < 4; i++) {
    const candidate = path.join(curr, ".bridge-token");
    if (fs.existsSync(candidate)) {
      return fs.readFileSync(candidate, "utf-8").trim();
    }
    curr = path.dirname(curr);
  }
  return process.env.BRIDGE_AUTH_TOKEN || "";
}

const token = findToken();
let parsedData = undefined;
if (rawData) {
  try {
    parsedData = JSON.parse(rawData);
  } catch {
    parsedData = { raw: rawData };
  }
}

const payload = JSON.stringify({
  agent: "claude-code",
  sessionId,
  event,
  timestamp: Date.now(),
  data: parsedData,
});

const req = http.request(
  {
    hostname: "127.0.0.1",
    port: parseInt(process.env.BRIDGE_PORT || "3100", 10),
    path: "/events",
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Content-Length": Buffer.byteLength(payload),
      "x-bridge-token": token,
    },
    timeout: 1500,
  },
  (res) => {
    // Non-blocking fire and forget
    res.resume();
  }
);

req.on("error", () => {
  // Silent fail so agent operations are never disrupted by bridge availability
});

req.write(payload);
req.end();
