#!/usr/bin/env node
/**
 * Codex Turn End Notify Hook for WaitPlay
 *
 * Configured in ~/.codex/config.toml under `notify`.
 * 1. Delegates to original codex-computer-use.exe turn-ended
 * 2. Emits `task_completed` to WaitPlay Local Companion Bridge
 */

const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const { spawn } = require('node:child_process');
const os = require('node:os');

const ORIGINAL_NOTIFY = 'C:\\Program Files\\WindowsApps\\OpenAI.Codex_26.1029.7803.0_x64__2p2nqsd0c76g0\\app\\resources\\cua_node\\bin\\node_modules\\@oai\\sky\\bin\\windows\\codex-computer-use.exe';
const BRIDGE_PORT = parseInt(process.env.BRIDGE_PORT || '3150', 10);

// 1. Forward to original computer-use notify if it exists
try {
  if (fs.existsSync(ORIGINAL_NOTIFY)) {
    const child = spawn(ORIGINAL_NOTIFY, ['turn-ended', ...process.argv.slice(2)], {
      stdio: 'inherit',
      windowsHide: true,
    });
    child.on('error', () => {});
    child.unref();
  }
} catch {
  // Silent fail - never block Codex
}

// 2. Locate bridge auth token
function findToken() {
  const candidates = [
    path.join(os.tmpdir(), 'waitplay', '.bridge-token'),
    path.join(process.cwd(), 'waitplay', '.bridge-token'),
    path.join(process.cwd(), '.bridge-token'),
    path.resolve(__dirname, '..', '..', '.bridge-token'),
    'C:\\Users\\ASUS\\waitplay\\.bridge-token',
    'C:\\Users\\ASUS\\AppData\\Local\\Temp\\waitplay\\.bridge-token',
  ];
  for (const p of candidates) {
    try {
      if (fs.existsSync(p)) {
        return fs.readFileSync(p, 'utf-8').trim();
      }
    } catch {}
  }
  return process.env.BRIDGE_AUTH_TOKEN || '';
}

// 3. Emit task_completed to WaitPlay Bridge
function emitCompleted() {
  const token = findToken();
  const payload = JSON.stringify({
    agent: 'codex',
    sessionId: 'codex-session',
    event: 'task_completed',
    timestamp: Date.now(),
  });

  const req = http.request(
    {
      hostname: '127.0.0.1',
      port: BRIDGE_PORT,
      path: '/events',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(payload),
        'x-bridge-token': token,
      },
      timeout: 1000,
    },
    (res) => {
      res.resume();
    }
  );

  req.on('error', () => {});
  req.write(payload);
  req.end();
}

emitCompleted();

// Widget-safe close: signal the companion (not taskkill, which would also kill the floating
// desktop widget). Per-session file, written then renamed so it is never read half-written.
try {
  const CLOSE_FILE = path.join(os.tmpdir(), 'waitplay', '.waitplay-close-codex-session.json');
  fs.mkdirSync(path.dirname(CLOSE_FILE), { recursive: true });
  const tmp = `${CLOSE_FILE}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify({ sessionId: 'codex-session', ts: Date.now() }));
  fs.renameSync(tmp, CLOSE_FILE);
} catch {}
setTimeout(() => process.exit(0), 500);
