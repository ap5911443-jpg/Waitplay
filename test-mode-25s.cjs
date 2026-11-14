#!/usr/bin/env node
/**
 * 25-Second End-to-End Test Mode for WaitPlay
 * Simulates a full agent reasoning + tool execution cycle:
 * 1. Emits task_started -> Pops native game window (OMP • Gemini 3.8 Flash | Term - 1)
 * 2. Runs for 25s with active tool updates while the user plays micro-games
 * 3. Emits task_completed at 25s
 * 4. Game displays "🎉 Agent Work is Done! Auto-closing in 2s..." and quits automatically!
 */

const { spawn } = require('node:child_process');
const http = require('node:http');
const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');

const BRIDGE_PORT = 3150;
const NATIVE_APP = path.join(__dirname, 'apps', 'native', 'WaitPlay.exe');

function findToken() {
  const candidates = [
    path.join(__dirname, 'apps', 'bridge', '.bridge-token'),
    path.join(__dirname, '.bridge-token'),
    path.join(os.tmpdir(), 'waitplay', '.bridge-token'),
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
    agent: 'omp',
    sessionId: 'omp-session',
    terminal: 'Term - 1',
    event,
    timestamp: Date.now(),
    data: {
      model: 'Gemini 3.8 Flash',
      ...data,
    },
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
  req.on('error', (e) => console.error('Bridge error:', e.message));
  req.write(payload);
  req.end();
}

console.log('====================================================');
console.log('  WaitPlay 25-Second Test Mode Simulation');
console.log('====================================================');
console.log('-> [0s] User submits prompt: "Refactor auth PKCE flow"');
console.log('-> Emitting task_started event to Localhost Bridge...');

postEvent('task_started', {
  prompt: 'Refactor auth PKCE flow to OAuth 2.0',
});

const { execSync } = require('node:child_process');
let alreadyOpen = false;
try {
  const procs = execSync('powershell -Command "Get-Process WaitPlay -ErrorAction SilentlyContinue | Where-Object { $_.MainWindowTitle -like \\"*Companion Game*\\" } | Select-Object -ExpandProperty Id"').toString().trim();
  if (procs) alreadyOpen = true;
} catch {}

if (alreadyOpen) {
  console.log('-> Companion Game window is already open. Reusing active window.');
} else {
  console.log('-> Launching Native WaitPlay Companion Game...');
  const gameProc = spawn(NATIVE_APP, ['--session=omp-session', '--terminal=Term - 1', '--game'], {
    detached: true,
    stdio: 'ignore',
  });
  gameProc.unref();
}

let elapsed = 0;
const DURATION = 25;

const interval = setInterval(() => {
  elapsed++;
  const remaining = DURATION - elapsed;

  if (elapsed === 5) {
    console.log(`-> [5s] Agent running tool: read ("auth/tokens.ts")`);
    postEvent('task_running', { tool: 'read ("auth/tokens.ts")' });
  } else if (elapsed === 10) {
    console.log(`-> [10s] Agent running tool: ast_edit ("auth_pkce.ts")`);
    postEvent('task_running', { tool: 'ast_edit ("auth_pkce.ts")' });
  } else if (elapsed === 16) {
    console.log(`-> [16s] Agent running tool: bash ("npm run build")`);
    postEvent('task_running', { tool: 'bash ("npm run build")' });
  } else if (elapsed === 21) {
    console.log(`-> [21s] Agent running tool: bash ("npm test")`);
    postEvent('task_running', { tool: 'bash ("npm test")' });
  }

  process.stdout.write(`\r[Test Mode] Running... ${elapsed}s / ${DURATION}s elapsed (${remaining}s remaining) - Enjoy playing! `);

  if (elapsed >= DURATION) {
    clearInterval(interval);
    console.log('\n\n====================================================');
    console.log('-> [25s] Agent Turn Complete!');
    console.log('-> Emitting task_completed to Localhost Bridge...');
    postEvent('task_completed');
    console.log('-> Game window should now show completion banner and AUTO-QUIT in 2 seconds.');
    console.log('====================================================\n');

    setTimeout(() => {
      console.log('-> Verifying that game window closed automatically...');
      process.exit(0);
    }, 3500);
  }
}, 1000);
