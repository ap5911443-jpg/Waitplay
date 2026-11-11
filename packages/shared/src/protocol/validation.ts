import { AgentEventPayload, AgentType } from "../types/agent.js";
import { VALID_AGENT_EVENTS } from "./events.js";

export const VALID_AGENTS: readonly AgentType[] = [
  "claude-code",
  "codex",
  "omp",
  "opencode",
  "cline",
  "cursor",
  "antigravity",
];

export interface ValidationResult<T> {
  valid: boolean;
  error?: string;
  data?: T;
}

export const MAX_PAYLOAD_BYTES = 32 * 1024; // 32 KB safety limit

export function validateAgentEventPayload(raw: unknown): ValidationResult<AgentEventPayload> {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return { valid: false, error: "Payload must be a non-null JSON object" };
  }

  const obj = raw as Record<string, unknown>;

  if (typeof obj.agent !== "string" || !(VALID_AGENTS as readonly string[]).includes(obj.agent)) {
    return {
      valid: false,
      error: `Invalid agent "${String(obj.agent)}". Expected one of: ${VALID_AGENTS.join(", ")}`,
    };
  }

  if (typeof obj.sessionId !== "string" || obj.sessionId.trim().length === 0) {
    return { valid: false, error: "sessionId must be a non-empty string" };
  }

  if (obj.sessionId.length > 128) {
    return { valid: false, error: "sessionId exceeds maximum length of 128 characters" };
  }

  const isKnownEvent = (e: string): e is AgentEventPayload["event"] =>
    (VALID_AGENT_EVENTS as readonly string[]).includes(e);

  if (typeof obj.event !== "string" || !isKnownEvent(obj.event)) {
    return {
      valid: false,
      error: `Invalid event "${String(obj.event)}". Valid events: ${VALID_AGENT_EVENTS.join(", ")}`,
    };
  }
  const validatedEvent = obj.event;
  if (typeof obj.timestamp !== "number" || !Number.isFinite(obj.timestamp) || obj.timestamp <= 0) {
    return { valid: false, error: "timestamp must be a positive finite unix timestamp in ms" };
  }

  if (obj.data !== undefined && (typeof obj.data !== "object" || obj.data === null || Array.isArray(obj.data))) {
    return { valid: false, error: "data field if present must be an object" };
  }

  return {
    valid: true,
    data: {
      agent: obj.agent as AgentType,
      sessionId: obj.sessionId.trim(),
      event: validatedEvent,
      timestamp: obj.timestamp,
      model: typeof obj.model === "string" ? obj.model : undefined,
      data: obj.data as Record<string, unknown> | undefined,
    },
  };
}
