import { AgentEvent, AgentStatus, AgentSessionInfo, AgentType } from "../types/agent.js";
export interface StateMachineListener {
  onStatusChange?: (
    newStatus: AgentStatus,
    prevStatus: AgentStatus,
    session: AgentSessionInfo
  ) => void;
  onGameLaunchRequested?: (session: AgentSessionInfo) => void;
  onGameStopRequested?: (session: AgentSessionInfo, reason: "completed" | "failed" | "ended") => void;
  onGamePauseRequested?: (session: AgentSessionInfo, reason: "input_required") => void;
  onGameResumeRequested?: (session: AgentSessionInfo) => void;
}

export interface StateMachineOptions {
  agent?: AgentType;
  startDelayMs?: number; // default 4000ms
  autoLaunch?: boolean;
}

export class AgentStateMachine {
  private session: AgentSessionInfo;
  private launchTimer: NodeJS.Timeout | number | null = null;
  private completionTimer: NodeJS.Timeout | number | null = null;
  private options: Required<StateMachineOptions>;
  private listeners: Set<StateMachineListener> = new Set();

  constructor(sessionId: string, options?: StateMachineOptions) {
    this.options = {
      agent: options?.agent ?? "claude-code",
      startDelayMs: options?.startDelayMs ?? 4000,
      autoLaunch: options?.autoLaunch ?? true,
    };
    const now = Date.now();
    this.session = {
      sessionId,
      agent: options?.agent ?? "claude-code",
      status: "IDLE",
      startedAt: now,
      lastEventAt: now,
      totalTasksCompleted: 0,
    };
  }

  public setAgent(agent: AgentType): void {
    this.session.agent = agent;
  }

  public getSession(): Readonly<AgentSessionInfo> {
    return { ...this.session };
  }

  public getStatus(): AgentStatus {
    return this.session.status;
  }

  public updateOptions(options: Partial<StateMachineOptions>): void {
    if (options.startDelayMs !== undefined) {
      this.options.startDelayMs = options.startDelayMs;
    }
    if (options.autoLaunch !== undefined) {
      this.options.autoLaunch = options.autoLaunch;
    }
  }

  public subscribe(listener: StateMachineListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private setStatus(newStatus: AgentStatus): void {
    const prevStatus = this.session.status;
    if (prevStatus === newStatus) return;

    this.session.status = newStatus;
    this.session.lastEventAt = Date.now();

    for (const listener of this.listeners) {
      try {
        listener.onStatusChange?.(newStatus, prevStatus, this.getSession());
      } catch (err) {
        console.error("Error in state machine listener:", err);
      }
    }
  }

  private clearLaunchTimer(): void {
    if (this.launchTimer !== null) {
      clearTimeout(this.launchTimer);
      this.launchTimer = null;
    }
  }

  private clearCompletionTimer(): void {
    if (this.completionTimer !== null) {
      clearTimeout(this.completionTimer);
      this.completionTimer = null;
    }
  }

  public handleEvent(
    event: AgentEvent,
    timestamp: number = Date.now(),
    data?: Record<string, unknown>,
    agent?: AgentType
  ): AgentStatus {
    this.session.lastEventAt = timestamp;
    if (agent) {
      this.session.agent = agent;
    }
    if (data?.tool) {
      this.session.tool = String(data.tool);
    }
    if (data?.model) {
      this.session.model = String(data.model);
    }
    if (data?.intent) {
      this.session.intent = String(data.intent);
    }
    if (data?.terminal) {
      this.session.terminal = String(data.terminal);
    }
    switch (event) {
      case "session_started": {
        this.clearLaunchTimer();
        this.clearCompletionTimer();
        this.session.startedAt = timestamp;
        this.setStatus("IDLE");
        break;
      }

      case "task_started": {
        // A new task cancels any pending completion or launch transitions
        this.clearLaunchTimer();
        this.clearCompletionTimer();

        this.session.currentTaskStartedAt = timestamp;
        this.session.waitingForInputPrompt = undefined;
        this.session.lastError = undefined;

        this.setStatus("WORKING");

        // Schedule game launch if autoLaunch is enabled and delay > 0
        if (this.options.autoLaunch) {
          if (this.options.startDelayMs <= 0) {
            this.triggerGameActive();
          } else {
            this.launchTimer = setTimeout(() => {
              this.launchTimer = null;
              // Only launch if STILL in WORKING status!
              if (this.session.status === "WORKING") {
                this.triggerGameActive();
              }
            }, this.options.startDelayMs);
          }
        }
        break;
      }

      case "task_running": {
        if (this.session.status === "IDLE" || this.session.status === "COMPLETED") {
          // If task_running arrives directly or resumes after intermediate completion
          this.handleEvent("task_started", timestamp, data);
        } else if (this.session.status === "WAITING_FOR_INPUT") {
          // Resumed from waiting for input
          if (this.launchTimer === null && this.options.autoLaunch) {
            this.triggerGameActive();
          } else {
            this.setStatus("WORKING");
          }
          for (const listener of this.listeners) {
            listener.onGameResumeRequested?.(this.getSession());
          }
        }
        break;
      }

      case "waiting_for_input": {
        // Pause launch timer if it hasn't fired yet
        this.clearLaunchTimer();

        const wasGameActive = this.session.status === "GAME_ACTIVE";
        const prompt = typeof data?.prompt === "string" ? data.prompt : undefined;
        this.session.waitingForInputPrompt = prompt;

        this.setStatus("WAITING_FOR_INPUT");

        if (wasGameActive) {
          for (const listener of this.listeners) {
            listener.onGamePauseRequested?.(this.getSession(), "input_required");
          }
        }
        break;
      }

      case "task_completed": {
        // If task completed before launch timer expires, game never opens!
        const hadActiveGame = this.session.status === "GAME_ACTIVE";
        this.clearLaunchTimer();

        if (this.session.currentTaskStartedAt) {
          this.session.lastTaskDurationMs = timestamp - this.session.currentTaskStartedAt;
        }
        this.session.totalTasksCompleted += 1;
        this.session.waitingForInputPrompt = undefined;

        this.setStatus("COMPLETED");

        if (hadActiveGame) {
          for (const listener of this.listeners) {
            listener.onGameStopRequested?.(this.getSession(), "completed");
          }
        }
        break;
      }

      case "task_failed": {
        const hadActiveGame = this.session.status === "GAME_ACTIVE";
        this.clearLaunchTimer();

        if (this.session.currentTaskStartedAt) {
          this.session.lastTaskDurationMs = timestamp - this.session.currentTaskStartedAt;
        }
        const errorMsg = typeof data?.error === "string" ? data.error : "Task encountered an error";
        this.session.lastError = errorMsg;

        this.setStatus("FAILED");

        if (hadActiveGame) {
          for (const listener of this.listeners) {
            listener.onGameStopRequested?.(this.getSession(), "failed");
          }
        }
        break;
      }

      case "session_ended": {
        const hadActiveGame = this.session.status === "GAME_ACTIVE";
        this.clearLaunchTimer();
        this.clearCompletionTimer();

        this.setStatus("IDLE");

        if (hadActiveGame) {
          for (const listener of this.listeners) {
            listener.onGameStopRequested?.(this.getSession(), "ended");
          }
        }
        break;
      }
    }

    return this.session.status;
  }

  private triggerGameActive(): void {
    this.setStatus("GAME_ACTIVE");
    for (const listener of this.listeners) {
      listener.onGameLaunchRequested?.(this.getSession());
    }
  }

  public destroy(): void {
    this.clearLaunchTimer();
    this.clearCompletionTimer();
    this.listeners.clear();
  }
}
