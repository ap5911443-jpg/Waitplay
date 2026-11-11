import { Request, Response, NextFunction } from "express";

const ALLOWED_IPS: Record<string, true> = {
  "127.0.0.1": true,
  "::1": true,
  "::ffff:127.0.0.1": true,
};

const ALLOWED_HOSTS: Record<string, true> = {
  localhost: true,
  "127.0.0.1": true,
  "[::1]": true,
};

export function loopbackOnly(req: Request, res: Response, next: NextFunction): void {
  const remoteIp = req.socket.remoteAddress || "";

  if (!ALLOWED_IPS[remoteIp]) {
    res.status(403).json({
      error: "Forbidden",
      message: "WaitPlay bridge only accepts connections from localhost/loopback.",
    });
    return;
  }

  // Prevent DNS rebinding attacks by validating Host header
  const host = req.headers.host || "";
  const hostWithoutPort = host.split(":")[0];

  if (!ALLOWED_HOSTS[hostWithoutPort]) {
    res.status(400).json({
      error: "Bad Request",
      message: `Invalid host "${host}". Requests must target localhost or 127.0.0.1.`,
    });
    return;
  }

  next();
}
