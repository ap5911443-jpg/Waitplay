import { test, describe } from "node:test";
import assert from "node:assert/strict";
import {
  validateAgentEventPayload,
  VALID_AGENT_EVENTS,
  MAX_PAYLOAD_BYTES,
} from "@waitplay/shared";
import { validateEventInput } from "../src/events/eventValidator.js";

describe("Event Validation Protocol", () => {
  test("accepts valid AgentEventPayload for all valid event types", () => {
    for (const event of VALID_AGENT_EVENTS) {
      const payload = {
        agent: "claude-code",
        sessionId: "session-123",
        event,
        timestamp: Date.now(),
        data: { test: true },
      };

      const result = validateAgentEventPayload(payload);
      assert.equal(result.valid, true, `Event ${event} should be valid`);
      assert.equal(result.data?.event, event);
      assert.equal(result.data?.sessionId, "session-123");
      assert.equal(result.data?.agent, "claude-code");
    }
  });

  test("rejects invalid agents", () => {
    const payload = {
      agent: "unknown-agent-xyz",
      sessionId: "session-123",
      event: "task_started",
      timestamp: Date.now(),
    };

    const result = validateAgentEventPayload(payload);
    assert.equal(result.valid, false);
    assert.match(result.error ?? "", /Invalid agent/);
  });

  test("rejects missing or empty sessionId", () => {
    const emptyResult = validateAgentEventPayload({
      agent: "claude-code",
      sessionId: "   ",
      event: "task_started",
      timestamp: Date.now(),
    });
    assert.equal(emptyResult.valid, false);

    const missingResult = validateAgentEventPayload({
      agent: "claude-code",
      event: "task_started",
      timestamp: Date.now(),
    });
    assert.equal(missingResult.valid, false);
  });

  test("rejects excessive sessionId length (> 128 chars)", () => {
    const longId = "a".repeat(129);
    const result = validateAgentEventPayload({
      agent: "claude-code",
      sessionId: longId,
      event: "task_started",
      timestamp: Date.now(),
    });
    assert.equal(result.valid, false);
    assert.match(result.error ?? "", /maximum length/);
  });

  test("rejects unknown event types", () => {
    const result = validateAgentEventPayload({
      agent: "claude-code",
      sessionId: "session-123",
      event: "unknown_event_type",
      timestamp: Date.now(),
    });
    assert.equal(result.valid, false);
    assert.match(result.error ?? "", /Invalid event/);
  });

  test("rejects non-positive or non-finite timestamp", () => {
    const negativeResult = validateAgentEventPayload({
      agent: "claude-code",
      sessionId: "session-123",
      event: "task_started",
      timestamp: -100,
    });
    assert.equal(negativeResult.valid, false);

    const zeroResult = validateAgentEventPayload({
      agent: "claude-code",
      sessionId: "session-123",
      event: "task_started",
      timestamp: 0,
    });
    assert.equal(zeroResult.valid, false);
  });

  test("rejects payload exceeding MAX_PAYLOAD_BYTES size ceiling", () => {
    const result = validateEventInput(
      { agent: "claude-code", sessionId: "1", event: "task_started", timestamp: 1 },
      MAX_PAYLOAD_BYTES + 500
    );
    assert.equal(result.valid, false);
    assert.match(result.error ?? "", /exceeds maximum limit/);
  });
});
