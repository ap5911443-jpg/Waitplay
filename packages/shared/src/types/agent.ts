export type AgentEvent =
  | "session_started"
  | "task_started"
  | "task_running"
  | "waiting_for_input"
  | "task_completed"
  | "task_failed"
  | "session_ended";

export type AgentType =
  | "claude-code"
  | "codex"
  | "omp"
  | "opencode"
  | "cline"
  | "cursor"
  | "antigravity";

export interface AgentEventPayload {
  agent: AgentType;
  sessionId: string;
  event: AgentEvent;
  timestamp: number;
  model?: string;
  terminal?: string;
  data?: Record<string, unknown>;
}

export type AgentStatus =
  | "IDLE"
  | "WORKING"
  | "GAME_ACTIVE"
  | "WAITING_FOR_INPUT"
  | "COMPLETED"
  | "FAILED";

export interface AgentSessionInfo {
  sessionId: string;
  agent: AgentType;
  status: AgentStatus;
  startedAt: number;
  lastEventAt: number;
  currentTaskStartedAt?: number;
  lastTaskDurationMs?: number;
  totalTasksCompleted: number;
  waitingForInputPrompt?: string;
  lastError?: string;
  model?: string;
  tool?: string;
  intent?: string;
  agentDisplayName?: string;
  terminal?: string;
}

export interface BridgeHealth {
  status: "ok" | "degraded";
  uptimeSeconds: number;
  version: string;
  activeSessions: number;
  clientsConnected: number;
  port: number;
}
