import http from "node:http";
import { BridgeHealth } from "@waitplay/shared";
import { createExpressApp } from "./server/expressApp.js";
import { SessionManager } from "./events/sessionManager.js";
import { BridgeWebSocketServer } from "./websocket/wsServer.js";
import { initializeBridgeToken, getBridgeToken } from "./security/tokenAuth.js";

const DEFAULT_PORT = 3150;
const port = parseInt(process.env.BRIDGE_PORT || process.env.PORT || `${DEFAULT_PORT}`, 10);
const startTime = Date.now();

// Initialize security token
const token = initializeBridgeToken();
console.log(`[WaitPlay Bridge] Security token initialized: ${token.slice(0, 6)}...`);

const sessionManager = new SessionManager();
let wsServer: BridgeWebSocketServer | null = null;

const getHealth = (): BridgeHealth => {
  return {
    status: "ok",
    uptimeSeconds: Math.floor((Date.now() - startTime) / 1000),
    version: "0.1.0",
    activeSessions: sessionManager.getActiveCount(),
    clientsConnected: wsServer ? wsServer.getConnectedCount() : 0,
    port,
  };
};

const app = createExpressApp(sessionManager, () => wsServer, getHealth);
const server = http.createServer(app);

wsServer = new BridgeWebSocketServer(server, sessionManager, getHealth);

// Broadcast session state updates from background transitions (e.g. launch timer firing)
sessionManager.onSessionChange((session) => {
  if (wsServer) {
    wsServer.broadcastSessionUpdate(session);
  }
});

// Bind explicitly to loopback interface 127.0.0.1
server.listen(port, "127.0.0.1", () => {
  console.log(`=======================================================`);
  console.log(`  WaitPlay Local Companion Bridge running`);
  console.log(`  HTTP:      http://127.0.0.1:${port}`);
  console.log(`  WebSocket: ws://127.0.0.1:${port}/ws`);
  console.log(`  Auth Token: ${getBridgeToken()}`);
  console.log(`=======================================================`);
});

const handleShutdown = async (signal: string) => {
  console.log(`[WaitPlay Bridge] Received ${signal}. Shutting down cleanly...`);
  if (wsServer) {
    await wsServer.close();
  }
  sessionManager.clearAll();
  server.close(() => {
    console.log(`[WaitPlay Bridge] Server closed.`);
    process.exit(0);
  });
};

process.on("SIGINT", () => void handleShutdown("SIGINT"));
process.on("SIGTERM", () => void handleShutdown("SIGTERM"));

export { server, sessionManager, wsServer, getHealth };
