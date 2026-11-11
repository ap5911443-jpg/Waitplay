import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { Request, Response, NextFunction } from "express";

let activeToken: string = "";

export function initializeBridgeToken(tokenFilePath?: string): string {
  if (process.env.BRIDGE_AUTH_TOKEN && process.env.BRIDGE_AUTH_TOKEN.trim().length > 0) {
    activeToken = process.env.BRIDGE_AUTH_TOKEN.trim();
    return activeToken;
  }

  activeToken = crypto.randomBytes(24).toString("hex");

  const targetPath = tokenFilePath || path.resolve(process.cwd(), ".bridge-token");
  try {
    fs.writeFileSync(targetPath, activeToken, { encoding: "utf-8", mode: 0o600 });
  } catch (err) {
    console.warn(`Could not persist token to ${targetPath}:`, err);
  }

  return activeToken;
}

export function getBridgeToken(): string {
  if (!activeToken) {
    initializeBridgeToken();
  }
  return activeToken;
}

export function requireBridgeAuth(req: Request, res: Response, next: NextFunction): void {
  const tokenHeader = req.headers["x-bridge-token"];
  const authHeader = req.headers["authorization"];

  let candidate: string | undefined;

  if (typeof tokenHeader === "string") {
    candidate = tokenHeader.trim();
  } else if (typeof authHeader === "string" && authHeader.startsWith("Bearer ")) {
    candidate = authHeader.slice(7).trim();
  }

  if (!candidate || candidate !== getBridgeToken()) {
    res.status(401).json({
      error: "Unauthorized",
      message: "Missing or invalid bridge authentication token. Provide x-bridge-token or Authorization: Bearer <token>",
    });
    return;
  }

  next();
}
