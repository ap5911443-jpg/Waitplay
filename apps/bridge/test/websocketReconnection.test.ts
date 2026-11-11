import { test, describe, before, after } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { WebSocket } from "ws";
import { SessionManager } from "../src/events/sessionManager.js";
import { BridgeWebSocketServer } from "../src/websocket/wsServer.js";
import { createExpressApp } from "../src/server/expressApp.js";
import { initializeBridgeToken } from "../src/security/tokenAuth.js";
import { BridgeClientMessage, BridgeHealth } from "@waitplay/shared";

describe("WebSocket Communication & Reconnection", () => {
  let server: http.Server;
  let wsServer: BridgeWebSocketServer;
  let sessionManager: SessionManager;
  let port: number;
  let wsUrl: string;
  let httpUrl: string;
  let token: string;

  before(async () => {
    token = initializeBridgeToken();
    sessionManager = new SessionManager();

    const getHealth = (): BridgeHealth => ({
      status: "ok",
      uptimeSeconds: 5,
      version: "0.1.0",
      activeSessions: sessionManager.getActiveCount(),
      clientsConnected: wsServer ? wsServer.getConnectedCount() : 0,
      port,
    });

    const app = createExpressApp(sessionManager, () => wsServer, getHealth);
    server = http.createServer(app);
    wsServer = new BridgeWebSocketServer(server, sessionManager, getHealth);

    sessionManager.onSessionChange((session) => {
      wsServer.broadcastSessionUpdate(session);
    });

    const { promise, resolve } = Promise.withResolvers<void>();
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (address && typeof address === "object") {
        port = address.port;
        wsUrl = `ws://127.0.0.1:${port}/ws`;
        httpUrl = `http://127.0.0.1:${port}`;
      }
      resolve();
    });
    await promise;
  });

  after(async () => {
    sessionManager.clearAll();
    await wsServer.close();
    const { promise, resolve } = Promise.withResolvers<void>();
    server.close(() => resolve());
    await promise;
  });

  test("client connects and receives initial state (health_check & session_list)", async () => {
    const ws = new WebSocket(wsUrl);
    const receivedMessages: BridgeClientMessage[] = [];

    const { promise, resolve } = Promise.withResolvers<void>();

    ws.on("message", (data) => {
      const msg = JSON.parse(data.toString()) as BridgeClientMessage;
      receivedMessages.push(msg);
      if (receivedMessages.length >= 2) {
        resolve();
      }
    });

    await promise;
    ws.close();

    const messageTypes = receivedMessages.map((m) => m.type);
    assert.ok(messageTypes.includes("health_check"), "Should receive health_check message");
    assert.ok(messageTypes.includes("session_list"), "Should receive session_list message");
  });

  test("broadcasts agent_event and session_updated when event is ingested", async () => {
    const ws = new WebSocket(wsUrl);
    const eventsReceived: BridgeClientMessage[] = [];

    const { promise: connected, resolve: resolveConnected } = Promise.withResolvers<void>();
    ws.on("open", () => resolveConnected());
    await connected;

    const { promise: gotEvent, resolve: resolveGotEvent } = Promise.withResolvers<void>();

    ws.on("message", (data) => {
      const msg = JSON.parse(data.toString()) as BridgeClientMessage;
      if (msg.type === "agent_event" && msg.payload.sessionId === "ws-test-session") {
        eventsReceived.push(msg);
        resolveGotEvent();
      }
    });

    // Ingest event via HTTP
    await fetch(`${httpUrl}/events`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-bridge-token": token,
      },
      body: JSON.stringify({
        agent: "claude-code",
        sessionId: "ws-test-session",
        event: "task_started",
        timestamp: Date.now(),
      }),
    });

    await gotEvent;
    ws.close();

    assert.equal(eventsReceived.length, 1);
    assert.equal(eventsReceived[0].type, "agent_event");
  });

  test("handles client disconnect and reconnect with latest session state synchronization", async () => {
    // Session exists from previous test
    assert.ok(sessionManager.getSession("ws-test-session"));

    // Connect second client (simulating reconnect)
    const reconnectedWs = new WebSocket(wsUrl);
    let sessionListMsg: BridgeClientMessage | null = null;

    const { promise, resolve } = Promise.withResolvers<void>();

    reconnectedWs.on("message", (data) => {
      const msg = JSON.parse(data.toString()) as BridgeClientMessage;
      if (msg.type === "session_list") {
        sessionListMsg = msg;
        resolve();
      }
    });

    await promise;
    reconnectedWs.close();

    assert.ok(sessionListMsg);
    if (sessionListMsg && sessionListMsg.type === "session_list") {
      const found = sessionListMsg.sessions.some((s) => s.sessionId === "ws-test-session");
      assert.ok(found, "Reconnected client should receive previously active session");
    }
  });

  test("responds to ping with pong", async () => {
    const ws = new WebSocket(wsUrl);
    const { promise: openPromise, resolve: resolveOpen } = Promise.withResolvers<void>();
    ws.on("open", () => resolveOpen());
    await openPromise;

    const { promise: pongPromise, resolve: resolvePong } = Promise.withResolvers<void>();
    ws.on("message", (data) => {
      const msg = JSON.parse(data.toString()) as BridgeClientMessage;
      if (msg.type === "pong") {
        resolvePong();
      }
    });

    ws.send(JSON.stringify({ type: "ping" }));
    await pongPromise;
    ws.close();
  });
});
