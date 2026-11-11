import { test, describe, before, after } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { SessionManager } from "../src/events/sessionManager.js";
import { createExpressApp } from "../src/server/expressApp.js";
import { initializeBridgeToken, getBridgeToken } from "../src/security/tokenAuth.js";
import { BridgeHealth } from "@waitplay/shared";

describe("Bridge HTTP API & Security Authentication", () => {
  let server: http.Server;
  let port: number;
  let baseUrl: string;
  let token: string;
  let sessionManager: SessionManager;

  before(async () => {
    token = initializeBridgeToken();
    sessionManager = new SessionManager();

    const getHealth = (): BridgeHealth => ({
      status: "ok",
      uptimeSeconds: 10,
      version: "0.1.0",
      activeSessions: sessionManager.getActiveCount(),
      clientsConnected: 0,
      port,
    });

    const app = createExpressApp(sessionManager, () => null, getHealth);
    server = http.createServer(app);

    const { promise, resolve } = Promise.withResolvers<void>();
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (address && typeof address === "object") {
        port = address.port;
        baseUrl = `http://127.0.0.1:${port}`;
      }
      resolve();
    });
    await promise;
  });

  after(async () => {
    sessionManager.clearAll();
    const { promise, resolve } = Promise.withResolvers<void>();
    server.close(() => resolve());
    await promise;
  });

  test("GET /health succeeds without authentication", async () => {
    const res = await fetch(`${baseUrl}/health`);
    assert.equal(res.status, 200);
    const body = (await res.json()) as BridgeHealth;
    assert.equal(body.status, "ok");
    assert.equal(body.version, "0.1.0");
    assert.equal(body.port, port);
  });

  test("GET /auth/token provides valid token on loopback", async () => {
    const res = await fetch(`${baseUrl}/auth/token`);
    assert.equal(res.status, 200);
    const body = (await res.json()) as { token: string };
    assert.equal(body.token, token);
  });

  test("POST /events without token returns 401 Unauthorized", async () => {
    const res = await fetch(`${baseUrl}/events`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        agent: "claude-code",
        sessionId: "s1",
        event: "task_started",
        timestamp: Date.now(),
      }),
    });

    assert.equal(res.status, 401);
    const body = (await res.json()) as { error: string };
    assert.equal(body.error, "Unauthorized");
  });

  test("POST /events with invalid token returns 401 Unauthorized", async () => {
    const res = await fetch(`${baseUrl}/events`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-bridge-token": "wrong-bogus-token-12345",
      },
      body: JSON.stringify({
        agent: "claude-code",
        sessionId: "s1",
        event: "task_started",
        timestamp: Date.now(),
      }),
    });

    assert.equal(res.status, 401);
  });

  test("POST /events with valid token via x-bridge-token succeeds", async () => {
    const res = await fetch(`${baseUrl}/events`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-bridge-token": token,
      },
      body: JSON.stringify({
        agent: "claude-code",
        sessionId: "auth-test-session",
        event: "task_started",
        timestamp: Date.now(),
      }),
    });

    assert.equal(res.status, 200);
    const body = (await res.json()) as { status: string; agentStatus: string };
    assert.equal(body.status, "received");
    assert.equal(body.agentStatus, "WORKING");
  });

  test("POST /events with valid token via Authorization Bearer succeeds", async () => {
    const res = await fetch(`${baseUrl}/events`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        agent: "claude-code",
        sessionId: "auth-test-session",
        event: "task_completed",
        timestamp: Date.now(),
      }),
    });

    assert.equal(res.status, 200);
    const body = (await res.json()) as { status: string; agentStatus: string };
    assert.equal(body.status, "received");
    assert.equal(body.agentStatus, "COMPLETED");
  });

  test("POST /events with invalid payload returns 400 Bad Request", async () => {
    const res = await fetch(`${baseUrl}/events`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-bridge-token": token,
      },
      body: JSON.stringify({
        agent: "not-claude-code",
        sessionId: "s1",
      }),
    });

    assert.equal(res.status, 400);
    const body = (await res.json()) as { error: string };
    assert.equal(body.error, "ValidationError");
  });
});
