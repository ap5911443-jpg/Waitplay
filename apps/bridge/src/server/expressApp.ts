import express, { Express } from "express";
import cors from "cors";
import { loopbackOnly } from "../security/loopbackOnly.js";
import { createRouter } from "./routes.js";
import { SessionManager } from "../events/sessionManager.js";
import { BridgeWebSocketServer } from "../websocket/wsServer.js";
import { BridgeHealth } from "@waitplay/shared";

export function createExpressApp(
  sessionManager: SessionManager,
  getWsServer: () => BridgeWebSocketServer | null,
  getHealth: () => BridgeHealth
): Express {
  const app = express();

  // Loopback only filter
  app.use(loopbackOnly);

  // CORS configured strictly for localhost
  app.use(
    cors({
      origin: (origin, callback) => {
        // Allow requests with no origin (curl, local hooks, native fetch)
        if (!origin) return callback(null, true);

        try {
          const url = new URL(origin);
          if (
            url.hostname === "localhost" ||
            url.hostname === "127.0.0.1" ||
            url.hostname === "[::1]"
          ) {
            return callback(null, true);
          }
        } catch {
          // ignore parsing error
        }

        callback(new Error("Not allowed by WaitPlay Bridge CORS policy"));
      },
      methods: ["GET", "POST", "OPTIONS"],
      allowedHeaders: ["Content-Type", "x-bridge-token", "Authorization"],
    })
  );

  // Body parsing with 32KB ceiling
  app.use(express.json({ limit: "32kb" }));

  // Mount API router
  app.use(createRouter(sessionManager, getWsServer, getHealth));

  return app;
}
