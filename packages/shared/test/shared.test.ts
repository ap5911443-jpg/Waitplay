import { test, describe } from "node:test";
import assert from "node:assert/strict";
import {
  validateAgentEventPayload,
  DEFAULT_PREFERENCES,
  AgentStateMachine,
} from "../dist/index.js";

describe("Shared Package Protocol & Types", () => {
  test("exports default preferences with 4s start delay", () => {
    assert.equal(DEFAULT_PREFERENCES.startDelaySeconds, 4);
    assert.equal(DEFAULT_PREFERENCES.displayMode, "compact");
    assert.equal(DEFAULT_PREFERENCES.autoLaunch, true);
  });

  test("validates agent event payload correctly", () => {
    const result = validateAgentEventPayload({
      agent: "claude-code",
      sessionId: "s1",
      event: "task_started",
      timestamp: Date.now(),
    });
    assert.equal(result.valid, true);
  });

  test("validates codex agent event payload correctly", () => {
    const result = validateAgentEventPayload({
      agent: "codex",
      sessionId: "codex-test-session",
      event: "task_started",
      timestamp: Date.now(),
    });
    assert.equal(result.valid, true);
    assert.equal(result.data?.agent, "codex");
  });

  test("state machine transitions from IDLE to WORKING", () => {
    const sm = new AgentStateMachine("session-shared");
    assert.equal(sm.getStatus(), "IDLE");
    sm.handleEvent("task_started");
    assert.equal(sm.getStatus(), "WORKING");
    sm.destroy();
  });
});
