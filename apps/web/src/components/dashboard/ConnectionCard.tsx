import React from "react";
import { Server, Wifi, WifiOff, Key, RefreshCw, Cpu } from "lucide-react";
import { BridgeHealth } from "@waitplay/shared";
import { BridgeStatus } from "../../hooks/useBridgeConnection";
import { Card } from "../ui/Card";
import { Badge } from "../ui/Badge";

export interface ConnectionCardProps {
  status: BridgeStatus;
  health: BridgeHealth | null;
  latencyMs: number | null;
  hasActiveSession: boolean;
  bridgeToken: string;
  onReconnect: () => void;
}

export const ConnectionCard: React.FC<ConnectionCardProps> = ({
  status,
  health,
  latencyMs,
  hasActiveSession,
  bridgeToken,
  onReconnect,
}) => {
  const isConnected = status === "connected";

  return (
    <Card
      title="Companion Service"
      subtitle="Local Node.js event bridge running on 127.0.0.1"
      icon={<Server className="w-5 h-5 text-blue-400" />}
      action={
        <button
          onClick={onReconnect}
          className="p-1.5 rounded-lg text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 transition-colors"
          title="Refresh Connection"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${status === "connecting" ? "animate-spin" : ""}`} />
        </button>
      }
    >
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {/* Bridge Status */}
        <div className="p-3 bg-zinc-950/40 rounded-xl border border-zinc-800/80">
          <div className="flex items-center justify-between">
            <span className="text-xs text-zinc-400">Bridge Status</span>
            {isConnected ? (
              <Badge variant="success" size="sm">
                <Wifi className="w-3 h-3 mr-1" />
                Connected
              </Badge>
            ) : status === "connecting" ? (
              <Badge variant="warning" size="sm" pulse>
                Connecting...
              </Badge>
            ) : (
              <Badge variant="danger" size="sm">
                <WifiOff className="w-3 h-3 mr-1" />
                Disconnected
              </Badge>
            )}
          </div>
          <div className="mt-2 text-xs font-mono text-zinc-300 flex items-center justify-between">
            <span>Port: {health?.port ?? 3001}</span>
            {latencyMs !== null && (
              <span className="text-[11px] text-zinc-400">{latencyMs} ms latency</span>
            )}
          </div>
        </div>

        {/* Claude Code Session Status */}
        <div className="p-3 bg-zinc-950/40 rounded-xl border border-zinc-800/80">
          <div className="flex items-center justify-between">
            <span className="text-xs text-zinc-400">Claude Code</span>
            {hasActiveSession ? (
              <Badge variant="info" size="sm" pulse>
                <Cpu className="w-3 h-3 mr-1" />
                Active Session
              </Badge>
            ) : (
              <Badge variant="neutral" size="sm">
                Standby
              </Badge>
            )}
          </div>
          <div className="mt-2 text-xs font-mono text-zinc-300 flex items-center justify-between truncate">
            <span className="flex items-center space-x-1">
              <Key className="w-3 h-3 text-zinc-500 shrink-0" />
              <span className="truncate max-w-[140px]">
                {bridgeToken ? `Token: ${bridgeToken.slice(0, 8)}...` : "Local Auth Active"}
              </span>
            </span>
          </div>
        </div>
      </div>
    </Card>
  );
};
