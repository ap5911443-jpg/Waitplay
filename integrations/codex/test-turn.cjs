#!/usr/bin/env node
/**
 * Test Simulator for Codex / ChatGPT -> WaitPlay Turn
 */

const { spawn } = require('node:child_process');
const http = require('node:http');
const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');

const BRIDGE_PORT = 3150;
const NATIVE_APP = path.join(__dirname, '..', '..', 'apps', 'native', 'WaitPlay.exe');

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

function postEvent(event, data) {
  const token = findToken();
  const payload = JSON.stringify({
    agent: 'codex',
    sessionId: 'codex-session',
    event,
    timestamp: Date.now(),
    data,
  });

  const req = http.request({
    hostname: '127.0.0.1',
    port: BRIDGE_PORT,
    path: '/events',
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(payload),
      'x-bridge-token': token,
    },
  });
  req.on('error', () => {});
  req.write(payload);
  req.end();
}

console.log('>>> [1/3] Simulating: User gives prompt to ChatGPT / Codex...');
console.log('>>> ChatGPT starts reasoning and searching...');
postEvent('task_started');

console.log('>>> Popping Native WaitPlay game window and forcing to top-most...');
spawn(NATIVE_APP, [], { detached: true, stdio: 'ignore' });
setTimeout(() => {
  console.log('>>> [2/3] Agent is still thinking and running tools (game stays open)...');
  postEvent('task_running', { tool: 'WebSearch' });
}, 3000);

setTimeout(() => {
  console.log('>>> [3/3] ChatGPT completed response! Quitting game & closing window...');
  postEvent('task_completed');
  // App automatically listens to Bridge and shows victory banner then closes
  setTimeout(() => {
    console.log('>>> Test completed cleanly.');
    process.exit(0);
  }, 1000);
}, 7000);
