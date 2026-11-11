import { Server as HttpServer } from "node:http";
import { WebSocketServer, WebSocket } from "ws";
import {
  AgentEventPayload,
  AgentSessionInfo,
  BridgeClientMessage,
  BridgeHealth,
} from "@waitplay/shared";
import { SessionManager } from "../events/sessionManager.js";

export class BridgeWebSocketServer {
  private wss: WebSocketServer;
  private clients: Set<WebSocket> = new Set();
  private heartbeatInterval: NodeJS.Timeout | null = null;
  private sessionManager: SessionManager;
  private getHealthFn: () => BridgeHealth;

  constructor(
    server: HttpServer,
    sessionManager: SessionManager,
    getHealthFn: () => BridgeHealth
  ) {
    this.sessionManager = sessionManager;
    this.getHealthFn = getHealthFn;

    this.wss = new WebSocketServer({
      server,
      path: "/ws",
      maxPayload: 64 * 1024,
    });

    this.setupListeners();
    this.startHeartbeat();
  }

  private setupListeners(): void {
    this.wss.on("connection", (ws: WebSocket, req) => {
      // Loopback verification for WebSocket connection
      const remoteIp = req.socket.remoteAddress || "";
      const allowedIps: Record<string, true> = {
        "127.0.0.1": true,
        "::1": true,
        "::ffff:127.0.0.1": true,
      };

      if (!allowedIps[remoteIp]) {
        ws.close(1008, "Forbidden: Non-loopback client");
        return;
      }

      this.clients.add(ws);

      // On initial connection, send current state snapshot
      this.sendToClient(ws, {
        type: "health_check",
        health: this.getHealthFn(),
      });

      this.sendToClient(ws, {
        type: "session_list",
        sessions: this.sessionManager.getAllSessions(),
      });

      ws.on("message", (raw: string | Buffer) => {
        try {
          const str = raw.toString();
          const message = JSON.parse(str);
          if (message.type === "ping") {
            this.sendToClient(ws, {
              type: "pong",
              timestamp: Date.now(),
            });
          } else if (message.type === "request_state") {
            this.sendToClient(ws, {
              type: "session_list",
              sessions: this.sessionManager.getAllSessions(),
            });
            this.sendToClient(ws, {
              type: "health_check",
              health: this.getHealthFn(),
            });
          }
        } catch {
          // Ignore malformed client messages
        }
      });

      ws.on("close", () => {
        this.clients.delete(ws);
      });

      ws.on("error", () => {
        this.clients.delete(ws);
      });
    });
  }

  private startHeartbeat(): void {
    this.heartbeatInterval = setInterval(() => {
      for (const client of this.clients) {
        if (client.readyState === WebSocket.OPEN) {
          client.ping();
        } else if (
          client.readyState === WebSocket.CLOSING ||
          client.readyState === WebSocket.CLOSED
        ) {
          this.clients.delete(client);
        }
      }
    }, 15000);
  }

  public broadcast(message: BridgeClientMessage): void {
    const payload = JSON.stringify(message);
    for (const client of this.clients) {
      if (client.readyState === WebSocket.OPEN) {
        client.send(payload);
      }
    }
  }

  public broadcastEvent(payload: AgentEventPayload, session: AgentSessionInfo): void {
    this.broadcast({
      type: "agent_event",
      payload,
    });
    this.broadcast({
      type: "session_updated",
      session,
    });
  }

  public broadcastSessionUpdate(session: AgentSessionInfo): void {
    this.broadcast({
      type: "session_updated",
      session,
    });
  }

  public getConnectedCount(): number {
    return this.clients.size;
  }

  private sendToClient(ws: WebSocket, message: BridgeClientMessage): void {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(message));
    }
  }

  public close(): Promise<void> {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }
    const { promise, resolve } = Promise.withResolvers<void>();
    this.wss.close(() => resolve());
    return promise;
  }
}
