#!/usr/bin/env node
/**
 * Dedicated OpenCode DB Watcher for WaitPlay
 *
 * Monitors ~/.local/share/opencode/opencode.db:
 * - Detects new user messages -> Emits task_started -> Spawns native WaitPlay app
 * - Tracks reasoning / tool parts -> Emits task_running
 * - Detects assistant response finish -> Emits task_completed
 */

const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const os = require('node:os');
const { spawn } = require('node:child_process');
const { DatabaseSync } = require('node:sqlite');

const OPENCODE_DB_PATH = path.join(os.homedir(), '.local', 'share', 'opencode', 'opencode.db');
const BRIDGE_PORT = parseInt(process.env.BRIDGE_PORT || '3150', 10);
const NATIVE_APP = path.join(__dirname, '..', '..', 'apps', 'native', 'WaitPlay.exe');
const DISMISS_FILE = path.join(os.tmpdir(), 'waitplay', '.waitplay-dismissed.json');

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
let isWorking = false;
let lastMessageTime = 0;
let lastPartTime = 0;
let finishTimer = null;
let currentModel = 'GLM 5.3 Flash';

function formatModelName(raw) {
  if (!raw) return 'GLM 5.3 Flash';
  const lower = String(raw).toLowerCase();
  if (lower.includes('glm-5.3') || lower.includes('glm')) return 'GLM 5.3 Flash';
  if (lower.includes('muse-spark') || lower.includes('spark')) return 'Muse Spark 1.3';
  if (lower.includes('mimo')) return 'Mimo v2.6 Flash';
  if (lower.includes('claude-3-7-sonnet') || lower.includes('sonnet')) return 'Claude 3.7 Sonnet';
  if (lower.includes('deepseek-r1') || lower.includes('deepseek')) return 'DeepSeek R1';
  if (lower.includes('gpt-4o')) return 'GPT-4o';
  return String(raw).split('/').pop() || raw;
}
function findToken() {
  const candidates = [
    path.join(os.tmpdir(), 'waitplay', '.bridge-token'),
    path.join(process.cwd(), 'waitplay', '.bridge-token'),
    path.resolve(__dirname, '..', '..', '.bridge-token'),
    'C:\\Users\\ASUS\\waitplay\\.bridge-token',
    'C:\\Users\\ASUS\\AppData\\Local\\Temp\\waitplay\\.bridge-token',
  ];
  for (const p of candidates) {
    try {
      if (fs.existsSync(p)) return fs.readFileSync(p, 'utf-8').trim();
    } catch {}
  }
  return '';
}

function popApp() {
  if (isPromptDismissed('opencode-session')) {
    console.log('[OpenCode Watcher] Prompt was dismissed by user, skipping popup.');
    return;
  }
  try {
    if (fs.existsSync(NATIVE_APP)) {
      const args = ['--session=opencode-session', `--parentPid=${process.pid}`];
      const child = spawn(NATIVE_APP, args, {
        detached: true,
        stdio: 'ignore',
      });
      child.unref();
    }
  } catch {}
}

function sendBridgeEvent(event, extra) {
  const token = findToken();
  const payload = JSON.stringify({
    agent: 'opencode',
    sessionId: 'opencode-session',
    event,
    timestamp: Date.now(),
    model: extra?.model || currentModel,
    data: extra,
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
    (res) => res.resume()
  );
  req.on('error', () => {});
  req.write(payload);
  req.end();
}

let db = null;
try {
  if (fs.existsSync(OPENCODE_DB_PATH)) {
    db = new DatabaseSync(OPENCODE_DB_PATH, { readOnly: true });
    const mRow = db.prepare('SELECT MAX(time_created) as max_time FROM message').get();
    const pRow = db.prepare('SELECT MAX(time_created) as max_time FROM part').get();
    lastMessageTime = (mRow && mRow.max_time) ? mRow.max_time : Date.now();
    lastPartTime = (pRow && pRow.max_time) ? pRow.max_time : Date.now();

    try {
      const sRow = db.prepare('SELECT model FROM session ORDER BY time_updated DESC LIMIT 1').get();
      if (sRow && sRow.model) {
        const sm = JSON.parse(sRow.model);
        if (sm.id) currentModel = formatModelName(sm.id);
      }
    } catch {}

    console.log(`[OpenCode Watcher] Connected to opencode.db. Baseline msg: ${lastMessageTime}, part: ${lastPartTime}, model: ${currentModel}`);
  }
} catch (err) {
  console.warn('[OpenCode Watcher] opencode.db waiting...');
}

setInterval(() => {
  if (!db) {
    try {
      if (fs.existsSync(OPENCODE_DB_PATH)) {
        db = new DatabaseSync(OPENCODE_DB_PATH, { readOnly: true });
        const mRow = db.prepare('SELECT MAX(time_created) as max_time FROM message').get();
        const pRow = db.prepare('SELECT MAX(time_created) as max_time FROM part').get();
        lastMessageTime = (mRow && mRow.max_time) ? mRow.max_time : Date.now();
        lastPartTime = (pRow && pRow.max_time) ? pRow.max_time : Date.now();
      }
    } catch {}
    return;
  }

  // 1. Monitor user messages in message table
  try {
    const msgRows = db.prepare(
      'SELECT id, time_created, data FROM message WHERE time_created > ? ORDER BY time_created ASC LIMIT 20'
    ).all(lastMessageTime);

    if (msgRows && msgRows.length > 0) {
      for (const row of msgRows) {
        lastMessageTime = Math.max(lastMessageTime, row.time_created);
        const data = JSON.parse(row.data || '{}');

        if (data.role === 'user') {
          // Check associated parts to see if this is a synthetic continuation or compaction message
          let isSynthetic = false;
          try {
            const partRows = db.prepare('SELECT data FROM part WHERE message_id = ?').all(row.id);
            for (const pr of partRows) {
              const pd = JSON.parse(pr.data || '{}');
              if (
                pd.synthetic === true ||
                pd.type === 'compaction' ||
                (pd.metadata && pd.metadata.compaction_continue === true) ||
                (pd.text && pd.text.includes('Continue if you have next steps'))
              ) {
                isSynthetic = true;
                break;
              }
            }
          } catch {}

          if (isSynthetic) {
            // Internal synthetic continuation / compaction step:
            // Keep current turn running, do NOT pop a new window!
            if (isWorking) {
              clearTimeout(finishTimer);
              finishTimer = null;
              sendBridgeEvent('task_running', { model: currentModel });
            }
            continue;
          }

          // Genuine human user prompt!
          clearTimeout(finishTimer);
          finishTimer = null;

          if (data.model && (data.model.modelID || data.model.id)) {
            currentModel = formatModelName(data.model.modelID || data.model.id);
          }

          const promptTime = row.time_created || Date.now();
          console.log(`[OpenCode Watcher] Genuine user prompt started (${currentModel})!`);
          sendBridgeEvent('task_started', { model: currentModel, promptTime });

          // Pop window only ONCE at the start of this prompt
          if (!isWorking) {
            isWorking = true;
            clearDismissal('opencode-session');
            if (!isPromptDismissed('opencode-session')) {
              popApp(promptTime);
            }
          }
        }
      }
    }
  } catch (err) {}

  // 2. Monitor parts in part table (reasoning, tools, completion)
  try {
    const partRows = db.prepare(
      'SELECT id, time_created, data FROM part WHERE time_created > ? ORDER BY time_created ASC LIMIT 50'
    ).all(lastPartTime);

    if (partRows && partRows.length > 0) {
      for (const row of partRows) {
        lastPartTime = Math.max(lastPartTime, row.time_created);
        const partData = JSON.parse(row.data || '{}');

        if (partData.type === 'tool' || partData.type === 'patch') {
          clearTimeout(finishTimer);
          finishTimer = null;
          isWorking = true;
          const toolName = partData.tool || 'tool';
          console.log(`[OpenCode Watcher] Tool active: ${toolName}`);
          sendBridgeEvent('task_running', { tool: toolName, model: currentModel });
        } else if (partData.type === 'reasoning' || partData.type === 'step-start') {
          clearTimeout(finishTimer);
          finishTimer = null;
          isWorking = true;
          sendBridgeEvent('task_running', { model: currentModel });
        } else if (partData.type === 'step-finish') {
          if (partData.reason === 'stop') {
            clearTimeout(finishTimer);
            // Debounce for 4500ms to verify that OpenCode has truly finished all steps
            finishTimer = setTimeout(() => {
              isWorking = false;
              finishTimer = null;
              console.log(`[OpenCode Watcher] OpenCode turn fully settled and complete (${currentModel})!`);
              clearDismissal('opencode-session');
              sendBridgeEvent('task_completed', { model: currentModel });
            }, 1200);
          } else if (partData.reason === 'tool-calls') {
            clearTimeout(finishTimer);
            finishTimer = null;
            isWorking = true;
            sendBridgeEvent('task_running', { model: currentModel });
          }
        }
      }
    }
  } catch (err) {}
}, 75);

console.log('[OpenCode Watcher] Service active and monitoring OpenCode...');
