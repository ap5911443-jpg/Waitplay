#!/usr/bin/env node
/**
 * Universal WaitPlay Model Context Protocol (MCP) Server
 *
 * Provides native integration for any MCP-compatible coding agent:
 * - Cursor
 * - Cline / Kilo Code
 * - OpenCode
 * - Google Antigravity IDE
 * - Claude Code
 *
 * Implements standard JSON-RPC 2.0 protocol over stdio.
 */

const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const { spawn } = require('node:child_process');
const os = require('node:os');
const readline = require('node:readline');

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

function popApp(sessionId, promptTimestamp = 0) {
  if (isPromptDismissed(sessionId || 'agent-session', promptTimestamp)) {
    return;
  }
  try {
    if (fs.existsSync(NATIVE_APP)) {
      const args = [`--session=${sessionId || 'agent-session'}`, `--parentPid=${process.pid}`];
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

function sendBridgeEvent(agent, sessionId, event, data) {
  const token = findToken();
  const payload = JSON.stringify({
    agent: agent || 'coding-agent',
    sessionId: sessionId || `${agent}-session`,
    event,
    timestamp: Date.now(),
    model: data?.model,
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
    (res) => res.resume()
  );
  req.on('error', () => {});
  req.write(payload);
  req.end();
}

function sendJsonRpcResponse(id, result, error) {
  const response = { jsonrpc: '2.0', id };
  if (error) {
    response.error = error;
  } else {
    response.result = result;
  }
  process.stdout.write(JSON.stringify(response) + '\n');
}

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
  terminal: false,
});

rl.on('line', (line) => {
  if (!line || !line.trim()) return;

  try {
    const msg = JSON.parse(line.trim());
    const id = msg.id;

    if (msg.method === 'initialize') {
      sendJsonRpcResponse(id, {
        protocolVersion: '2024-11-05',
        capabilities: { tools: {} },
        serverInfo: {
          name: 'waitplay-mcp',
          version: '0.1.0',
        },
      });
      return;
    }

    if (msg.method === 'notifications/initialized') {
      return;
    }

    if (msg.method === 'tools/list') {
      sendJsonRpcResponse(id, {
        tools: [
          {
            name: 'waitplay_start_game',
            description: 'Pops up the native WaitPlay companion game window on the user screen while the coding agent is thinking, researching, or running long tasks.',
            inputSchema: {
              type: 'object',
              properties: {
                agent: {
                  type: 'string',
                  description: 'Name of the coding agent (e.g. cursor, cline, opencode, antigravity, claude-code)',
                },
                model: {
                  type: 'string',
                  description: 'Name of the AI model currently generating the response',
                },
                task: {
                  type: 'string',
                  description: 'Brief summary of the active task',
                },
              },
            },
          },
          {
            name: 'waitplay_update_status',
            description: 'Updates live telemetry and tool execution state in the WaitPlay companion game window.',
            inputSchema: {
              type: 'object',
              properties: {
                agent: { type: 'string' },
                tool: { type: 'string', description: 'Name of the tool currently executing (e.g. read, edit, bash)' },
                step: { type: 'string', description: 'Description of the current operation' },
              },
            },
          },
          {
            name: 'waitplay_finish_game',
            description: 'Notifies WaitPlay that the coding agent has completed its task, showing the completion summary and closing the game.',
            inputSchema: {
              type: 'object',
              properties: {
                agent: { type: 'string' },
                summary: { type: 'string', description: 'Brief summary of task results' },
              },
            },
          },
        ],
      });
      return;
    }

    if (msg.method === 'tools/call') {
      const toolName = msg.params?.name;
      const args = msg.params?.arguments || {};
      const agent = args.agent || 'coding-agent';
      const sessionId = `${agent}-session`;

      if (toolName === 'waitplay_start_game') {
        popApp(sessionId);
        sendBridgeEvent(agent, sessionId, 'task_started', {
          model: args.model,
          task: args.task,
        });
        sendJsonRpcResponse(id, {
          content: [
            {
              type: 'text',
              text: `WaitPlay game window popped up on user's screen for ${agent} (${args.model || 'active model'}).`,
            },
          ],
        });
        return;
      }

      if (toolName === 'waitplay_update_status') {
        sendBridgeEvent(agent, sessionId, 'task_running', {
          tool: args.tool,
          step: args.step,
        });
        sendJsonRpcResponse(id, {
          content: [
            {
              type: 'text',
              text: `WaitPlay status updated with tool: ${args.tool || 'running'}.`,
            },
          ],
        });
        return;
      }

      if (toolName === 'waitplay_finish_game') {
        sendBridgeEvent(agent, sessionId, 'task_completed', {
          summary: args.summary,
        });
        sendJsonRpcResponse(id, {
          content: [
            {
              type: 'text',
              text: `WaitPlay notified that ${agent} finished. Game completion banner displayed.`,
            },
          ],
        });
        return;
      }

      sendJsonRpcResponse(id, null, {
        code: -32601,
        message: `Unknown tool: ${toolName}`,
      });
      return;
    }

    // Default response for other notifications / pings
    if (id !== undefined) {
      sendJsonRpcResponse(id, {});
    }
  } catch (err) {
    // Ignore malformed JSON-RPC frames
  }
});
