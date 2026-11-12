#!/usr/bin/env node
/**
 * Google Antigravity Dedicated Task Hook for WaitPlay
 *
 * Usage:
 *   node antigravity-hook.cjs start [model] [task]
 *   node antigravity-hook.cjs tool [toolName]
 *   node antigravity-hook.cjs stop
 */

const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const { spawn } = require('node:child_process');
const os = require('node:os');

const BRIDGE_PORT = parseInt(process.env.BRIDGE_PORT || '3150', 10);
const NATIVE_APP = path.join(__dirname, '..', '..', 'apps', 'native', 'WaitPlay.exe');
const DISMISS_FILE = path.join(os.tmpdir(), 'waitplay', '.waitplay-dismissed.json');

const action = process.argv[2] || 'start';
const param1 = process.argv[3] || '';
const param2 = process.argv[4] || '';

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

function isPromptDismissed(sessionId, promptTimestamp) {
  try {
    if (fs.existsSync(DISMISS_FILE)) {
      const data = JSON.parse(fs.readFileSync(DISMISS_FILE, 'utf-8'));
      const dismissedTime = data[sessionId] || 0;
      if (promptTimestamp > 0 && dismissedTime >= promptTimestamp) {
        return true;
      }
    }
  } catch {}
  return false;
}

function popApp(promptTimestamp = 0) {
  if (isPromptDismissed('antigravity-session', promptTimestamp)) {
    console.log('[Antigravity Hook] Prompt was dismissed by user, skipping popup.');
    return;
  }
  try {
    if (fs.existsSync(NATIVE_APP)) {
      const args = ['--session=antigravity-session', `--parentPid=${process.pid}`];
      if (promptTimestamp > 0) args.push(`--promptTime=${promptTimestamp}`);
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
    agent: 'antigravity',
    sessionId: 'antigravity-session',
    event,
    timestamp: Date.now(),
    model: extra?.model || 'Gemini 3.8 Flash',
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

if (action === 'start') {
  const promptTime = Date.now();
  sendBridgeEvent('task_started', {
    model: param1 || 'Gemini 3.8 Flash',
    task: param2 || 'Antigravity IDE task',
    promptTime,
  });
  if (!isPromptDismissed('antigravity-session', promptTime)) {
    popApp(promptTime);
  }
} else if (action === 'tool') {
  sendBridgeEvent('task_running', {
    tool: param1 || 'Task',
  });
} else if (action === 'stop' || action === 'complete') {
  sendBridgeEvent('task_completed');
}

setTimeout(() => process.exit(0), 300);
