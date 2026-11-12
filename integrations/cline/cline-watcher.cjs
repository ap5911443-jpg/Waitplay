#!/usr/bin/env node
/**
 * Dedicated Cline CLI & Extension Tasks Watcher for WaitPlay
 *
 * Automatically monitors Cline prompt submissions, tools, and completions:
 * 1. Cline CLI: ~/.cline/data/sessions/<sessionId>/<sessionId>.messages.json
 * 2. VS Code Extension Tasks: AppData/Roaming/Code/.../globalStorage/.../tasks
 *
 * Emits real-time agent lifecycle events to WaitPlay Bridge (Port 3150)
 * and automatically pops the native companion game window.
 */

const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const os = require('node:os');
const { spawn } = require('node:child_process');

const CLINE_SESSIONS_DIR = path.join(os.homedir(), '.cline', 'data', 'sessions');
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

function formatModelName(raw) {
  if (!raw) return 'Claude 3.7 Sonnet';
  const lower = String(raw).toLowerCase();
  if (lower.includes('claude-sonnet') || lower.includes('sonnet')) return 'Claude 3.7 Sonnet';
  if (lower.includes('gpt-5.6') || lower.includes('luna')) return 'GPT-5.6 Luna';
  if (lower.includes('gemini-4') || lower.includes('argon')) return 'Gemini 4 Argon';
  if (lower.includes('gpt-4o')) return 'GPT-4o';
  if (lower.includes('o3')) return 'o3-mini';
  if (lower.includes('best-coding')) return 'Best Coding';
  return String(raw).split('/').pop() || raw;
}

let hasPoppedForPrompt = false;

function popApp() {
  if (hasPoppedForPrompt) return;
  if (isPromptDismissed('cline-session')) {
    console.log('[Cline Watcher] Prompt was dismissed by user, skipping popup.');
    return;
  }
  hasPoppedForPrompt = true;
  try {
    if (fs.existsSync(NATIVE_APP)) {
      const args = ['--session=cline-session', `--parentPid=${process.pid}`];
      const child = spawn(NATIVE_APP, args, {
        detached: true,
        stdio: 'ignore',
      });
      child.unref();
    }
  } catch {}
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

function sendBridgeEvent(event, extra) {
  const token = findToken();
  const payload = JSON.stringify({
    agent: 'cline',
    sessionId: 'cline-session',
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

console.log('=======================================================');
console.log('  WaitPlay Dedicated Watcher for Cline');
console.log(`  Cline Sessions Dir: ${CLINE_SESSIONS_DIR}`);
console.log(`  Bridge Target: http://127.0.0.1:${BRIDGE_PORT}`);
console.log('=======================================================');

let isWorking = false;
let finishTimer = null;
let currentModel = 'Claude 3.7 Sonnet';
let activeSessionId = '';
let lastMessagesCount = 0;
let lastFileMtime = 0;

function getLatestSessionDir() {
  if (!fs.existsSync(CLINE_SESSIONS_DIR)) return null;
  try {
    const dirs = fs.readdirSync(CLINE_SESSIONS_DIR)
      .map(d => path.join(CLINE_SESSIONS_DIR, d))
      .filter(p => {
        try { return fs.statSync(p).isDirectory(); } catch { return false; }
      })
      .sort((a, b) => {
        try { return fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs; } catch { return 0; }
      });
    return dirs.length > 0 ? dirs[0] : null;
  } catch {
    return null;
  }
}

// Initialize baseline
const initialSessionDir = getLatestSessionDir();
if (initialSessionDir) {
  activeSessionId = path.basename(initialSessionDir);
  const metaFile = path.join(initialSessionDir, `${activeSessionId}.json`);
  const msgsFile = path.join(initialSessionDir, `${activeSessionId}.messages.json`);
  if (fs.existsSync(metaFile)) {
    try {
      const meta = JSON.parse(fs.readFileSync(metaFile, 'utf-8'));
      if (meta.model) currentModel = formatModelName(meta.model);
    } catch {}
  }
  if (fs.existsSync(msgsFile)) {
    try {
      lastFileMtime = fs.statSync(msgsFile).mtimeMs;
      const data = JSON.parse(fs.readFileSync(msgsFile, 'utf-8'));
      lastMessagesCount = (data.messages || []).length;
    } catch {}
  }
  console.log(`[Cline Watcher] Connected to Cline sessions. Baseline: ${activeSessionId} (${currentModel}), msgs: ${lastMessagesCount}`);
}

function checkUpdates() {
  const latestDir = getLatestSessionDir();
  if (!latestDir) return;

  const currentSessionId = path.basename(latestDir);
  if (currentSessionId !== activeSessionId) {
    activeSessionId = currentSessionId;
    lastMessagesCount = 0;
    lastFileMtime = 0;
    hasPoppedForPrompt = false;

    const metaFile = path.join(latestDir, `${activeSessionId}.json`);
    if (fs.existsSync(metaFile)) {
      try {
        const meta = JSON.parse(fs.readFileSync(metaFile, 'utf-8'));
        if (meta.model) currentModel = formatModelName(meta.model);
      } catch {}
    }
    console.log(`[Cline Watcher] Detected new Cline session: ${activeSessionId} (${currentModel})`);
  }

  const msgsFile = path.join(latestDir, `${activeSessionId}.messages.json`);
  if (!fs.existsSync(msgsFile)) return;

  try {
    const stat = fs.statSync(msgsFile);
    if (stat.mtimeMs <= lastFileMtime) return;
    lastFileMtime = stat.mtimeMs;

    const data = JSON.parse(fs.readFileSync(msgsFile, 'utf-8'));
    const messages = data.messages || [];
    if (messages.length === 0 || messages.length < lastMessagesCount) {
      lastMessagesCount = messages.length;
      return;
    }

    // Process new messages
    for (let i = lastMessagesCount; i < messages.length; i++) {
      const m = messages[i];
      const role = m.role;
      const content = m.content || [];

      // Check if user submitted a real prompt (not tool_result)
      if (role === 'user') {
        const hasToolResult = Array.isArray(content) && content.some(c => c && c.type === 'tool_result');
        if (hasToolResult) {
          // Tool output returned -> Cline is working!
          clearTimeout(finishTimer);
          finishTimer = null;
          isWorking = true;
          sendBridgeEvent('task_running', { model: currentModel });
        } else {
          // Genuine human user prompt!
          clearTimeout(finishTimer);
          finishTimer = null;
          isWorking = true;
          hasPoppedForPrompt = false;
          clearDismissal('cline-session');

          let promptText = '';
          if (Array.isArray(content)) {
            for (const c of content) {
              if (c && c.text) promptText += c.text;
            }
          } else if (typeof content === 'string') {
            promptText = content;
          }
          if (promptText.includes('<user_input')) {
            promptText = promptText.replace(/<user_input[^>]*>/, '').replace(/<\/user_input>/, '').trim();
          }
          if (promptText.length > 80) promptText = promptText.slice(0, 80) + '...';

          console.log(`[Cline Watcher] User prompt submitted (${promptText})!`);
          sendBridgeEvent('task_started', { model: currentModel, prompt: promptText });
          popApp();
        }
      } else if (role === 'assistant') {
        let hasToolUse = false;
        let toolName = 'tool';
        let hasText = false;

        if (Array.isArray(content)) {
          for (const c of content) {
            if (c && c.type === 'tool_use') {
              hasToolUse = true;
              if (c.name) toolName = c.name;
            } else if (c && c.type === 'text' && c.text && c.text.trim()) {
              hasText = true;
            }
          }
        }

        if (hasToolUse) {
          // Tool execution in flight
          clearTimeout(finishTimer);
          finishTimer = null;
          isWorking = true;
          console.log(`[Cline Watcher] Tool active: ${toolName}`);
          sendBridgeEvent('task_running', { tool: toolName, model: currentModel });
        } else if (hasText && !hasToolUse) {
          // Assistant output final text! Candidate for completion
          clearTimeout(finishTimer);
          finishTimer = setTimeout(() => {
            isWorking = false;
            finishTimer = null;
            hasPoppedForPrompt = false;
            clearDismissal('cline-session');
            console.log(`[Cline Watcher] Cline task completed (${currentModel})!`);
            sendBridgeEvent('task_completed', { model: currentModel });
          }, 800);
        }
      }
    }

    lastMessagesCount = messages.length;
  } catch (err) {
    // Transient file reads during streaming safely ignored
  }
}

// Poll every 75ms
setInterval(checkUpdates, 75);
console.log('[Cline Watcher] Service active and monitoring Cline CLI...');
