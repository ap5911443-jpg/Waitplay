#!/usr/bin/env node
/**
 * WaitPlay web static server (zero-dependency).
 *
 * Serves the production build in ./dist on port 5200 with SPA fallback and
 * transparently proxies the bridge API/WebSocket endpoints to 127.0.0.1:3150
 * (mirroring the vite dev proxy) so the companion popup works from a build.
 *
 * Auto-started by the native WaitPlay app when the port is not already open.
 */
const http = require("node:http");
const net = require("node:net");
const fs = require("node:fs");
const path = require("node:path");

const PORT = Number(process.env.WAITPLAY_WEB_PORT || 5200);
const BRIDGE_HOST = "127.0.0.1";
const BRIDGE_PORT = Number(process.env.WAITPLAY_BRIDGE_PORT || 3150);
const DIST = path.join(__dirname, "dist");

// Paths forwarded to the bridge instead of served from disk.
const PROXY_PREFIXES = ["/ws", "/events", "/health", "/auth", "/sessions"];

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".ico": "image/x-icon",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".ttf": "font/ttf",
  ".map": "application/json; charset=utf-8",
};

function isProxied(url) {
  return PROXY_PREFIXES.some(
    (p) => url === p || url.startsWith(p + "/") || url.startsWith(p + "?")
  );
}

function proxyHttp(req, res) {
  const proxyReq = http.request(
    {
      host: BRIDGE_HOST,
      port: BRIDGE_PORT,
      method: req.method,
      path: req.url,
      headers: req.headers,
    },
    (proxyRes) => {
      res.writeHead(proxyRes.statusCode || 502, proxyRes.headers);
      proxyRes.pipe(res);
    }
  );
  proxyReq.on("error", () => {
    if (!res.headersSent) res.writeHead(502, { "content-type": "text/plain" });
    res.end("bridge unavailable");
  });
  req.pipe(proxyReq);
}

function serveStatic(req, res) {
  let urlPath = decodeURIComponent((req.url || "/").split("?")[0]);
  if (urlPath === "/") urlPath = "/index.html";

  let filePath = path.join(DIST, urlPath);
  // Prevent path traversal outside DIST.
  if (!filePath.startsWith(DIST)) {
    res.writeHead(403);
    res.end("forbidden");
    return;
  }

  fs.stat(filePath, (err, stat) => {
    if (err || !stat.isFile()) {
      // SPA fallback: serve index.html for unknown non-asset routes.
      filePath = path.join(DIST, "index.html");
    }
    const ext = path.extname(filePath).toLowerCase();
    const type = MIME[ext] || "application/octet-stream";
    fs.readFile(filePath, (readErr, data) => {
      if (readErr) {
        res.writeHead(404, { "content-type": "text/plain" });
        res.end("not found");
        return;
      }
      res.writeHead(200, { "content-type": type, "cache-control": "no-cache" });
      res.end(data);
    });
  });
}

const server = http.createServer((req, res) => {
  if (isProxied(req.url || "")) {
    proxyHttp(req, res);
    return;
  }
  serveStatic(req, res);
});

// Proxy WebSocket upgrades (e.g. /ws) to the bridge via raw socket piping.
server.on("upgrade", (req, clientSocket, head) => {
  if (!isProxied(req.url || "")) {
    clientSocket.destroy();
    return;
  }
  const upstream = net.connect(BRIDGE_PORT, BRIDGE_HOST, () => {
    let reqLine = `${req.method} ${req.url} HTTP/1.1\r\n`;
    for (let i = 0; i < req.rawHeaders.length; i += 2) {
      reqLine += `${req.rawHeaders[i]}: ${req.rawHeaders[i + 1]}\r\n`;
    }
    reqLine += "\r\n";
    upstream.write(reqLine);
    if (head && head.length) upstream.write(head);
    upstream.pipe(clientSocket);
    clientSocket.pipe(upstream);
  });
  upstream.on("error", () => clientSocket.destroy());
  clientSocket.on("error", () => upstream.destroy());
});

server.on("error", (err) => {
  // Most common: another instance already bound the port — safe to exit.
  if (err && err.code === "EADDRINUSE") {
    process.exit(0);
  }
  console.error("[waitplay-web] server error:", err);
  process.exit(1);
});

server.listen(PORT, "127.0.0.1", () => {
  console.log(`[waitplay-web] serving ${DIST} on http://127.0.0.1:${PORT}`);
});
