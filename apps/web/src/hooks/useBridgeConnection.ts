import { useState, useEffect, useRef, useCallback } from "react";
import {
  AgentEventPayload,
  AgentSessionInfo,
  BridgeClientMessage,
  BridgeHealth,
} from "@waitplay/shared";

export type BridgeStatus = "connected" | "connecting" | "disconnected";

export interface UseBridgeConnectionResult {
  status: BridgeStatus;
  sessions: AgentSessionInfo[];
  activeSession: AgentSessionInfo | null;
  health: BridgeHealth | null;
  latencyMs: number | null;
  bridgeToken: string;
  setBridgeToken: (token: string) => void;
  sendEventToBridge: (event: AgentEventPayload) => Promise<boolean>;
  selectSession: (sessionId: string) => void;
  reconnect: () => void;
}

function getDefaultWsUrl(): string {
  if (typeof window !== "undefined") {
    const proto = window.location.protocol === "https:" ? "wss:" : "ws:";
    return `${proto}//${window.location.host}/ws`;
  }
  return "ws://127.0.0.1:3150/ws";
}

function getDefaultHttpUrl(): string {
  if (typeof window !== "undefined") {
    return window.location.origin;
  }
  return "http://127.0.0.1:3150";
}

export function useBridgeConnection(options?: {
  wsUrl?: string;
  httpUrl?: string;
  onEvent?: (payload: AgentEventPayload, session: AgentSessionInfo) => void;
}): UseBridgeConnectionResult {
  const wsUrl = options?.wsUrl ?? getDefaultWsUrl();
  const httpUrl = options?.httpUrl ?? getDefaultHttpUrl();
  const onEventRef = useRef(options?.onEvent);
  onEventRef.current = options?.onEvent;

  const [status, setStatus] = useState<BridgeStatus>("connecting");
  const [sessions, setSessions] = useState<AgentSessionInfo[]>([]);
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null);
  const [health, setHealth] = useState<BridgeHealth | null>(null);
  const [latencyMs, setLatencyMs] = useState<number | null>(null);
  const [bridgeToken, setBridgeToken] = useState<string>("");

  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimerRef = useRef<NodeJS.Timeout | number | null>(null);
  const pingStartRef = useRef<number | null>(null);
  const pingIntervalRef = useRef<NodeJS.Timeout | number | null>(null);

  // Auto-fetch local bridge token if available
  useEffect(() => {
    let cancelled = false;
    async function fetchToken() {
      try {
        const res = await fetch(`${httpUrl}/auth/token`);
        if (res.ok) {
          const data = (await res.json()) as { token?: string };
          if (!cancelled && data.token) {
            setBridgeToken(data.token);
          }
        }
      } catch {
        // Bridge may not be started yet; ignore
      }
    }
    void fetchToken();
    return () => {
      cancelled = true;
    };
  }, [httpUrl]);

  const connect = useCallback(() => {
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }

    setStatus("connecting");

    try {
      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      ws.onopen = () => {
        setStatus("connected");
        // Start pinging for latency
        clearInterval(pingIntervalRef.current as NodeJS.Timeout);
        pingIntervalRef.current = setInterval(() => {
          if (ws.readyState === WebSocket.OPEN) {
            pingStartRef.current = performance.now();
            ws.send(JSON.stringify({ type: "ping" }));
          }
        }, 5000);
      };

      ws.onmessage = (evt) => {
        try {
          const msg = JSON.parse(evt.data as string) as BridgeClientMessage;
          switch (msg.type) {
            case "pong": {
              if (pingStartRef.current !== null) {
                const elapsed = Math.round(performance.now() - pingStartRef.current);
                setLatencyMs(elapsed);
                pingStartRef.current = null;
              }
              break;
            }
            case "health_check": {
              setHealth(msg.health);
              break;
            }
            case "session_list": {
              setSessions(msg.sessions);
              if (msg.sessions.length > 0 && !selectedSessionId) {
                setSelectedSessionId(msg.sessions[0].sessionId);
              }
              break;
            }
            case "session_updated": {
              setSessions((prev) => {
                const next = prev.filter((s) => s.sessionId !== msg.session.sessionId);
                return [msg.session, ...next];
              });
              break;
            }
            case "agent_event": {
              // Retrieve matching session
              setSessions((prev) => {
                const found = prev.find((s) => s.sessionId === msg.payload.sessionId);
                if (found && onEventRef.current) {
                  onEventRef.current(msg.payload, found);
                }
                return prev;
              });
              break;
            }
          }
        } catch (err) {
          console.error("Failed to parse websocket message:", err);
        }
      };

      ws.onclose = () => {
        setStatus("disconnected");
        setLatencyMs(null);
        if (pingIntervalRef.current) {
          clearInterval(pingIntervalRef.current);
          pingIntervalRef.current = null;
        }
        // Auto-reconnect after 3 seconds
        if (!reconnectTimerRef.current) {
          reconnectTimerRef.current = setTimeout(() => {
            reconnectTimerRef.current = null;
            connect();
          }, 3000);
        }
      };

      ws.onerror = () => {
        ws.close();
      };
    } catch {
      setStatus("disconnected");
      if (!reconnectTimerRef.current) {
        reconnectTimerRef.current = setTimeout(() => {
          reconnectTimerRef.current = null;
          connect();
        }, 3000);
      }
    }
  }, [wsUrl, selectedSessionId]);

  useEffect(() => {
    connect();
    return () => {
      clearTimeout(reconnectTimerRef.current as NodeJS.Timeout);
      clearInterval(pingIntervalRef.current as NodeJS.Timeout);
      if (wsRef.current) {
        wsRef.current.close();
      }
    };
  }, [connect]);

  const sendEventToBridge = useCallback(
    async (payload: AgentEventPayload): Promise<boolean> => {
      try {
        const headers: Record<string, string> = {
          "Content-Type": "application/json",
        };
        if (bridgeToken) {
          headers["x-bridge-token"] = bridgeToken;
        }

        const res = await fetch(`${httpUrl}/events`, {
          method: "POST",
          headers,
          body: JSON.stringify(payload),
        });

        return res.ok;
      } catch (err) {
        console.error("Failed to send event to bridge:", err);
        return false;
      }
    },
    [httpUrl, bridgeToken]
  );

  const activeSession =
    sessions.find((s) => s.sessionId === selectedSessionId) ||
    (sessions.length > 0 ? sessions[0] : null);

  const selectSession = useCallback((sessionId: string) => {
    setSelectedSessionId(sessionId);
  }, []);

  return {
    status,
    sessions,
    activeSession,
    health,
    latencyMs,
    bridgeToken,
    setBridgeToken,
    sendEventToBridge,
    selectSession,
    reconnect: connect,
  };
}
