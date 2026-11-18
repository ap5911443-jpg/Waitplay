import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { SessionManager } from "../src/events/sessionManager.js";

describe("Session Manager & Multiple Concurrent Sessions", () => {
  test("creates and tracks multiple independent sessions", () => {
    const sm = new SessionManager();

    const resultA = sm.processEvent({
      agent: "claude-code",
      sessionId: "session-alpha",
      event: "task_started",
      timestamp: Date.now(),
    });

    const resultB = sm.processEvent({
      agent: "claude-code",
      sessionId: "session-beta",
      event: "session_started",
      timestamp: Date.now(),
    });

    assert.equal(resultA.status, "WORKING");
    assert.equal(resultB.status, "IDLE");
    assert.equal(sm.getActiveCount(), 2);

    const sessionA = sm.getSession("session-alpha");
    const sessionB = sm.getSession("session-beta");

    assert.equal(sessionA?.status, "WORKING");
    assert.equal(sessionB?.status, "IDLE");

    sm.clearAll();
  });

  test("completion of session A does not affect or close session B", () => {
    const sm = new SessionManager();

    // Start both sessions
    sm.processEvent({
      agent: "claude-code",
      sessionId: "session-A",
      event: "task_started",
      timestamp: Date.now(),
    });

    sm.processEvent({
      agent: "claude-code",
      sessionId: "session-B",
      event: "task_started",
      timestamp: Date.now(),
    });

    assert.equal(sm.getSession("session-A")?.status, "WORKING");
    assert.equal(sm.getSession("session-B")?.status, "WORKING");

    // Complete session A
    sm.processEvent({
      agent: "claude-code",
      sessionId: "session-A",
      event: "task_completed",
      timestamp: Date.now(),
    });

    // Session A is COMPLETED, but Session B MUST STILL BE WORKING!
    assert.equal(sm.getSession("session-A")?.status, "COMPLETED");
    assert.equal(sm.getSession("session-B")?.status, "WORKING");

    sm.clearAll();
  });

  test("invokes completion callback once when a task completes", () => {
    const completed: string[] = [];
    const sm = new SessionManager({
      onTaskCompleted: (session) => completed.push(session.sessionId),
    });

    sm.processEvent({
      agent: "codex",
      sessionId: "notify-session",
      event: "task_started",
      timestamp: Date.now(),
    });
    sm.processEvent({
      agent: "codex",
      sessionId: "notify-session",
      event: "task_completed",
      timestamp: Date.now(),
    });
    sm.processEvent({
      agent: "codex",
      sessionId: "notify-session",
      event: "task_completed",
      timestamp: Date.now(),
    });

    assert.deepEqual(completed, ["notify-session"]);
    sm.clearAll();
  });

  test("resetting one session does not delete or interfere with others", () => {
    const sm = new SessionManager();

    sm.processEvent({
      agent: "claude-code",
      sessionId: "session-1",
      event: "session_started",
      timestamp: Date.now(),
    });

    sm.processEvent({
      agent: "claude-code",
      sessionId: "session-2",
      event: "session_started",
      timestamp: Date.now(),
    });

    assert.equal(sm.getActiveCount(), 2);

    const deleted = sm.resetSession("session-1");
    assert.equal(deleted, true);
    assert.equal(sm.getActiveCount(), 1);
    assert.equal(sm.getSession("session-1"), undefined);
    assert.notEqual(sm.getSession("session-2"), undefined);

    sm.clearAll();
  });
});
