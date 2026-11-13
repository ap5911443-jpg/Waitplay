#!/usr/bin/env node
/**
 * Codex / ChatGPT Desktop Real-Time Watcher for WaitPlay
 *
 * Automatically monitors OpenAI Codex / ChatGPT Desktop prompt submissions and turns.
 * - When prompt submitted & agent starts thinking/reasoning:
 *     Emits `task_started` to WaitPlay Bridge and pops the game window directly on top.
 * - While executing tools:
 *     Emits `task_running` to WaitPlay Bridge.
 * - When turn is complete:
 *     Emits `task_completed` to WaitPlay Bridge and cleanly closes the game interface.
 */

const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const os = require('node:os');
const { spawn, execSync } = require('node:child_process');
const { DatabaseSync } = require('node:sqlite');

const CODEX_DB_PATH = path.join(os.homedir(), '.codex', 'logs_2.sqlite');
const BRIDGE_PORT = parseInt(process.env.BRIDGE_PORT || '3150', 10);
const NATIVE_APP = path.join(__dirname, '..', '..', 'apps', 'native', 'WaitPlay.exe');
const DISMISS_FILE = path.join(os.tmpdir(), 'waitplay', '.waitplay-dismissed.json');

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
      const data = JSON.parse(fs.readFileSync(DISMISS_FILE, 'utf-8'));
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
      const data = JSON.parse(fs.readFileSync(DISMISS_FILE, 'utf-8'));
      if (data[sessionId]) {
        delete data[sessionId];
        fs.writeFileSync(DISMISS_FILE, JSON.stringify(data, null, 2), 'utf-8');
      }
    }
  } catch {}
}
let isTurnActive = false;
let lastLogId = 0;
let completionTimer = null;
console.log('=======================================================');
console.log('  WaitPlay Companion Watcher for Codex & ChatGPT');
console.log(`  Codex Logs DB: ${CODEX_DB_PATH}`);
console.log(`  Bridge Target: http://127.0.0.1:${BRIDGE_PORT}`);
console.log('=======================================================');

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

function sendBridgeEvent(event, data) {
  const token = findToken();
  const payload = JSON.stringify({
    agent: 'codex',
    sessionId: 'codex-session',
    event,
    timestamp: Date.now(),
    data,
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

function popGameWindow() {
  if (!isWaitPlayEnabled()) {
    console.log('[WaitPlay Watcher] WaitPlay is turned OFF, skipping popup.');
    return;
  }
  if (isPromptDismissed('codex-session')) {
    console.log('[WaitPlay Watcher] Prompt was dismissed by user, skipping popup.');
    return;
  }
  console.log('[WaitPlay Watcher] Launching native WaitPlay desktop application...');
  try {
    const args = ['--session=codex-session', `--parentPid=${process.pid}`];
    const child = spawn(NATIVE_APP, args, {
      detached: true,
      stdio: 'ignore',
    });
    child.unref();
  } catch (err) {
    console.error('[WaitPlay Watcher] Failed to pop native app:', err.message);
  }
}

function closeGameWindow() {
  // Handled gracefully inside WaitPlay.exe
}

// Open Codex SQLite logs database
let db = null;
try {
  if (fs.existsSync(CODEX_DB_PATH)) {
    db = new DatabaseSync(CODEX_DB_PATH, { readOnly: true });
    const initialRow = db.prepare('SELECT MAX(id) as max_id FROM logs').get();
    lastLogId = (initialRow && initialRow.max_id) ? initialRow.max_id : 0;
    console.log(`[WaitPlay Watcher] Connected to Codex logs DB. Baseline log ID: ${lastLogId}`);
  } else {
    console.warn(`[WaitPlay Watcher] Codex DB not found at ${CODEX_DB_PATH}. Waiting for it to appear...`);
  }
} catch (err) {
  console.error('[WaitPlay Watcher] Failed to open Codex DB initially:', err.message);
}

// Main polling loop (200ms)
setInterval(() => {
  if (!db) {
    try {
      if (fs.existsSync(CODEX_DB_PATH)) {
        db = new DatabaseSync(CODEX_DB_PATH, { readOnly: true });
        const initialRow = db.prepare('SELECT MAX(id) as max_id FROM logs').get();
        lastLogId = (initialRow && initialRow.max_id) ? initialRow.max_id : 0;
        console.log(`[WaitPlay Watcher] Connected to Codex logs DB. Baseline log ID: ${lastLogId}`);
      }
    } catch {}
    return;
  }

  try {
    const rows = db.prepare(
      'SELECT id, ts, feedback_log_body FROM logs WHERE id > ? ORDER BY id ASC LIMIT 100'
    ).all(lastLogId);

    if (rows && rows.length > 0) {
      for (const row of rows) {
        lastLogId = Math.max(lastLogId, row.id);
        const body = row.feedback_log_body || '';

        // Check for genuine turn start / prompt submitted
        const isStartMarker =
          body.includes('operation="turn_input"') ||
          body.includes('TurnInput') ||
          body.includes('otel.name="op.dispatch.turn_input"') ||
          body.includes('codex.turn_input');

        if (isStartMarker) {
          // Cancel any pending completion from intermediate tool step!
          clearTimeout(completionTimer);
          completionTimer = null;
          if (!isTurnActive) {
            isTurnActive = true;
            clearDismissal('codex-session');
            console.log(`[WaitPlay Watcher] ChatGPT/Codex prompt started! Thinking/reasoning... (log ${row.id})`);
            sendBridgeEvent('task_started');
            popGameWindow();
          }
          continue;
        }

        // Check for tool execution / reasoning progress
        if (isTurnActive && (
          body.includes('invoke_tool') ||
          body.includes('code_mode.broker') ||
          body.includes('item/commandExecution') ||
          body.includes('item/started') ||
          body.includes('run_sampling_request')
        )) {
          clearTimeout(completionTimer);
          completionTimer = null;
          sendBridgeEvent('task_running');
        }

        // Check for genuine turn completion
        // Debounce: verify that no new step arrives within 2.5 seconds
        const isEndMarker =
          body.includes('app-server event: turn/completed targeted_connections=1') ||
          body.includes('turn/completed targeted_connections=1');

        if (isEndMarker && isTurnActive) {
          clearTimeout(completionTimer);
          const endLogId = row.id;
          completionTimer = setTimeout(() => {
            isTurnActive = false;
            completionTimer = null;
            console.log(`[WaitPlay Watcher] ChatGPT/Codex finished turn! (log ${endLogId})`);
            clearDismissal('codex-session');
            sendBridgeEvent('task_completed');
          }, 800);
        }
      }
    }
  } catch (err) {
    // Transient locks on database gracefully ignored
  }
}, 75);

process.on('SIGINT', () => {
  console.log('[WaitPlay Watcher] Shutting down cleanly...');
  if (db) {
    try { db.close(); } catch {}
  }
  process.exit(0);
});

process.on('SIGTERM', () => {
  if (db) {
    try { db.close(); } catch {}
  }
  process.exit(0);
});
