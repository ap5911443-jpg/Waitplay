import {
  AgentEventPayload,
  AgentSessionInfo,
  AgentStateMachine,
  AgentStatus,
  AgentType,
} from "@waitplay/shared";

export type SessionChangeCallback = (session: AgentSessionInfo) => void;
export type TaskCompletedCallback = (session: AgentSessionInfo) => void | Promise<void>;

export interface SessionManagerOptions {
  defaultStartDelayMs?: number;
  onTaskCompleted?: TaskCompletedCallback;
}

export class SessionManager {
  private sessions: Map<string, AgentStateMachine> = new Map();
  private defaultStartDelayMs: number;
  private changeCallbacks: Set<SessionChangeCallback> = new Set();
  private onTaskCompleted?: TaskCompletedCallback;

  constructor(options?: SessionManagerOptions) {
    this.defaultStartDelayMs = options?.defaultStartDelayMs ?? 4000;
    this.onTaskCompleted = options?.onTaskCompleted;
  }

  public onSessionChange(callback: SessionChangeCallback): () => void {
    this.changeCallbacks.add(callback);
    return () => this.changeCallbacks.delete(callback);
  }

  private notify(session: AgentSessionInfo): void {
    for (const cb of this.changeCallbacks) {
      try {
        cb(session);
      } catch (err) {
        console.error("Error in session change callback:", err);
      }
    }
  }

  private notifyTaskCompleted(session: AgentSessionInfo): void {
    if (!this.onTaskCompleted) return;
    try {
      void Promise.resolve(this.onTaskCompleted(session)).catch((err) => {
        console.error("Error in task completion callback:", err);
      });
    } catch (err) {
      console.error("Error in task completion callback:", err);
    }
  }


  public getOrCreateSession(sessionId: string, agent?: AgentType): AgentStateMachine {
    let machine = this.sessions.get(sessionId);
    if (!machine) {
      machine = new AgentStateMachine(sessionId, {
        agent: agent ?? "claude-code",
        startDelayMs: this.defaultStartDelayMs,
        autoLaunch: true,
      });

      machine.subscribe({
        onStatusChange: (newStatus, _prevStatus, session) => {
          this.notify(session);
          if (newStatus === "COMPLETED") {
            this.notifyTaskCompleted(session);
          }
        },
      });

      this.sessions.set(sessionId, machine);
    } else if (agent) {
      machine.setAgent(agent);
    }
    return machine;
  }
  public processEvent(payload: AgentEventPayload): {
    session: AgentSessionInfo;
    status: AgentStatus;
  } {
    const machine = this.getOrCreateSession(payload.sessionId, payload.agent);
    const eventData = { ...payload.data };
    if (payload.model && !eventData.model) {
      eventData.model = payload.model;
    }
    if (payload.terminal && !eventData.terminal) {
      eventData.terminal = payload.terminal;
    }
    const newStatus = machine.handleEvent(payload.event, payload.timestamp, eventData, payload.agent);
    const sessionInfo = machine.getSession();
    return {
      session: sessionInfo,
      status: newStatus,
    };
  }

  public getSession(sessionId: string): AgentSessionInfo | undefined {
    const machine = this.sessions.get(sessionId);
    return machine ? machine.getSession() : undefined;
  }

  public getAllSessions(): AgentSessionInfo[] {
    const now = Date.now();
    for (const machine of this.sessions.values()) {
      const s = machine.getSession();
      if ((s.status === "WORKING" || s.status === "GAME_ACTIVE") && (now - s.lastEventAt > 20000)) {
        machine.handleEvent("task_completed", now);
      }
    }
    return Array.from(this.sessions.values()).map((machine) => machine.getSession());
  }

  public resetSession(sessionId: string): boolean {
    const machine = this.sessions.get(sessionId);
    if (!machine) return false;

    machine.destroy();
    this.sessions.delete(sessionId);
    return true;
  }

  public clearAll(): void {
    for (const machine of this.sessions.values()) {
      machine.destroy();
    }
    this.sessions.clear();
  }

  public getActiveCount(): number {
    return this.sessions.size;
  }
}
