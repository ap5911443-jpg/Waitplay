import { Router, Request, Response } from "express";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { BridgeHealth } from "@waitplay/shared";
import { SessionManager } from "../events/sessionManager.js";
import { BridgeWebSocketServer } from "../websocket/wsServer.js";
import { requireBridgeAuth, getBridgeToken } from "../security/tokenAuth.js";
import { validateEventInput } from "../events/eventValidator.js";

export function createRouter(
  sessionManager: SessionManager,
  getWsServer: () => BridgeWebSocketServer | null,
  getHealth: () => BridgeHealth
): Router {
  const router = Router();

  // Health endpoint (public on loopback)
  router.get("/health", (_req: Request, res: Response) => {
    res.json(getHealth());
  });

  // Local token endpoint (loopback only, allows local web UI / dev to read current active token)
  router.get("/auth/token", (_req: Request, res: Response) => {
    res.json({ token: getBridgeToken() });
  });

  function getEnabledState(): boolean {
    try {
      const candidates = [
        path.join(os.tmpdir(), "waitplay", ".waitplay-enabled.json"),
        path.resolve(process.cwd(), ".waitplay-enabled.json"),
        "C:\\Users\\ASUS\\waitplay\\.waitplay-enabled.json",
        "C:\\Users\\ASUS\\AppData\\Local\\Temp\\waitplay\\.waitplay-enabled.json",
      ];
      for (const p of candidates) {
        if (fs.existsSync(p)) {
          const data = JSON.parse(fs.readFileSync(p, "utf-8"));
          if (data && typeof data.enabled === "boolean") return data.enabled;
        }
      }
    } catch {}
    return true;
  }

  function setEnabledState(enabled: boolean): void {
    const data = JSON.stringify({ enabled, updatedAt: Date.now() }, null, 2);
    const targets = [
      path.join(os.tmpdir(), "waitplay", ".waitplay-enabled.json"),
      path.resolve(process.cwd(), ".waitplay-enabled.json"),
      "C:\\Users\\ASUS\\waitplay\\.waitplay-enabled.json",
      "C:\\Users\\ASUS\\AppData\\Local\\Temp\\waitplay\\.waitplay-enabled.json",
    ];
    for (const t of targets) {
      try {
        const dir = path.dirname(t);
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
        fs.writeFileSync(t, data, "utf-8");
      } catch {}
    }
  }

  // Companion enabled state query (loopback only)
  router.get("/state", (_req: Request, res: Response) => {
    res.json({ enabled: getEnabledState() });
  });

  // Companion enabled state toggle/set (loopback only)
  router.post("/state", (req: Request, res: Response) => {
    const requested = typeof req.body?.enabled === "boolean" ? req.body.enabled : !getEnabledState();
    setEnabledState(requested);

    const ws = getWsServer();
    if (ws) {
      ws.broadcast({
        type: "state_change",
        enabled: requested,
      });
    }

    res.json({ status: "ok", enabled: requested });
  });

  // Active sessions list
  router.get("/sessions", (_req: Request, res: Response) => {
    res.json({
      sessions: sessionManager.getAllSessions(),
    });
  });

  // Specific session lookup
  router.get("/sessions/:id", (req: Request, res: Response) => {
    const session = sessionManager.getSession(req.params.id);
    if (!session) {
      res.status(404).json({ error: "SessionNotFound", message: `Session ${req.params.id} not found` });
      return;
    }
    res.json({ session });
  });

  // Reset session
  router.post("/sessions/:id/reset", requireBridgeAuth, (req: Request, res: Response) => {
    const success = sessionManager.resetSession(req.params.id);
    if (!success) {
      res.status(404).json({ error: "SessionNotFound", message: `Session ${req.params.id} not found` });
      return;
    }

    const ws = getWsServer();
    if (ws) {
      ws.broadcast({
        type: "session_list",
        sessions: sessionManager.getAllSessions(),
      });
    }

    res.json({ status: "reset", sessionId: req.params.id });
  });

  // Ingest agent lifecycle event
  router.post("/events", requireBridgeAuth, (req: Request, res: Response) => {
    const contentLength = req.headers["content-length"]
      ? parseInt(req.headers["content-length"], 10)
      : undefined;

    const validation = validateEventInput(req.body, contentLength);

    if (!validation.valid || !validation.data) {
      res.status(400).json({
        error: "ValidationError",
        message: validation.error || "Invalid agent event payload",
      });
      return;
    }

    const payload = validation.data;
    const result = sessionManager.processEvent(payload);

    const ws = getWsServer();
    if (ws) {
      ws.broadcastEvent(payload, result.session);
    }

    res.status(200).json({
      status: "received",
      sessionId: payload.sessionId,
      event: payload.event,
      agentStatus: result.status,
      timestamp: Date.now(),
    });
  });

  return router;
}
