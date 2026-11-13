import { AgentEvent, AgentEventPayload, AgentSessionInfo, BridgeHealth } from "../types/agent.js";

export const VALID_AGENT_EVENTS: readonly AgentEvent[] = [
  "session_started",
  "task_started",
  "task_running",
  "waiting_for_input",
  "task_completed",
  "task_failed",
  "session_ended",
] as const;

export type BridgeClientMessage =
  | { type: "agent_event"; payload: AgentEventPayload }
  | { type: "session_updated"; session: AgentSessionInfo }
  | { type: "session_list"; sessions: AgentSessionInfo[] }
  | { type: "health_check"; health: BridgeHealth }
  | { type: "state_change"; enabled: boolean }
  | { type: "pong"; timestamp: number };

export type BridgeServerMessage =
  | { type: "ping"; timestamp: number }
  | { type: "subscribe_session"; sessionId?: string }
  | { type: "request_state" };
