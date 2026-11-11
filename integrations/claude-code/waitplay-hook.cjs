#!/usr/bin/env node
/**
 * WaitPlay Dedicated Native Hook for Claude Code
 *
 * Configured in ~/.claude/settings.json
 * Reads stdin JSON from Claude Code lifecycle events.
 */

const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const { spawn } = require('node:child_process');
const os = require('node:os');

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

function popApp(promptTimestamp = 0) {
  try {
    if (fs.existsSync(NATIVE_APP)) {
      const args = ['--session=claude-code-session', `--parentPid=${process.pid}`];
      if (promptTimestamp > 0) {
        args.push(`--promptTime=${promptTimestamp}`);
      }
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
    path.join(process.cwd(), '.bridge-token'),
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
    agent: 'claude-code',
    sessionId: 'claude-code-session',
    event,
    timestamp: Date.now(),
    model: extra?.model || 'Claude 3.7 Sonnet',
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

let input = '';
process.stdin.setEncoding('utf8');

process.stdin.on('data', (chunk) => {
  input += chunk;
});

process.stdin.on('end', () => {
  let eventType = process.argv[2] || 'unknown';
  let data = {};

  try {
    if (input.trim()) {
      data = JSON.parse(input);
    }
  } catch {}

  const hookName = data.hook_event_name || eventType;

  if (hookName === 'UserPromptSubmit' || hookName === 'user_prompt_submit' || eventType === 'start') {
    const promptTime = Date.now();
    clearDismissal('claude-code-session');
    sendBridgeEvent('task_started', {
      model: data.model || 'Claude 3.7 Sonnet',
      prompt: data.prompt ? data.prompt.slice(0, 100) : '',
      promptTime,
    });
    if (!isPromptDismissed('claude-code-session')) {
      popApp(promptTime);
    }
  } else if (hookName === 'PreToolUse' || hookName === 'pre_tool_use' || eventType === 'tool') {
    const tool = data.tool_name || data.tool || 'Tool';
    sendBridgeEvent('task_running', {
      tool,
      model: data.model || 'Claude 3.7 Sonnet',
    });
  } else if (hookName === 'Stop' || hookName === 'stop' || eventType === 'stop') {
    clearDismissal('claude-code-session');
    sendBridgeEvent('task_completed', {
      model: data.model || 'Claude 3.7 Sonnet',
    });
  } else if (hookName === 'Notification' || eventType === 'notify') {
    const msg = data.message || '';
    if (msg.includes('permission') || msg.includes('approve') || msg.includes('allow')) {
      sendBridgeEvent('waiting_for_input', { prompt: msg });
    }
  } else if (hookName === 'SessionEnd' || eventType === 'end') {
    clearDismissal('claude-code-session');
    sendBridgeEvent('session_ended');
  }

  process.exit(0);
});

// Fallback in case stdin is closed immediately
setTimeout(() => {
  process.exit(0);
}, 1000);
