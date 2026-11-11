import React from "react";
import { Activity, Clock, Play, AlertCircle, CheckCircle2, XCircle } from "lucide-react";
import { AgentStatus } from "@waitplay/shared";
import { Card } from "../ui/Card";
import { AgentStatusBadge } from "../ui/Badge";
import { Button } from "../ui/Button";

export interface AgentStatusCardProps {
  status: AgentStatus;
  taskElapsedSeconds: number;
  delayRemainingSeconds: number | null;
  waitingForInputPrompt?: string;
  lastError?: string;
  onOpenGame: () => void;
  isGameOpen: boolean;
}

export const AgentStatusCard: React.FC<AgentStatusCardProps> = ({
  status,
  taskElapsedSeconds,
  delayRemainingSeconds,
  waitingForInputPrompt,
  lastError,
  onOpenGame,
  isGameOpen,
}) => {
  const formatTime = (sec: number) => {
    const mins = Math.floor(sec / 60);
    const remainder = sec % 60;
    return `${mins}:${remainder.toString().padStart(2, "0")}`;
  };

  return (
    <Card
      title="Agent Telemetry"
      subtitle="Real-time Claude Code task state & game trigger coordinator"
      icon={<Activity className="w-5 h-5 text-blue-400" />}
      action={<AgentStatusBadge status={status} />}
    >
      <div className="space-y-4">
        {/* Main status indicator */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between p-4 bg-zinc-950/50 rounded-xl border border-zinc-800 gap-3">
          <div>
            <div className="text-xs text-zinc-400">Current Agent State</div>
            <div className="text-xl font-bold text-zinc-100 mt-0.5 capitalize flex items-center space-x-2">
              <span>{status.toLowerCase().replace(/_/g, " ")}</span>
              {status === "WORKING" && (
                <span className="text-xs font-normal text-blue-400 font-mono animate-pulse">
                  (Analyzing / Generating...)
                </span>
              )}
            </div>

            {/* Launch delay countdown */}
            {delayRemainingSeconds !== null && delayRemainingSeconds > 0 && (
              <div className="mt-2 inline-flex items-center space-x-1.5 px-2.5 py-1 rounded-md bg-blue-500/10 border border-blue-500/20 text-blue-400 text-xs">
                <Clock className="w-3.5 h-3.5 animate-spin" />
                <span>
                  Auto-launching game in <strong>{delayRemainingSeconds}s</strong> if task continues...
                </span>
              </div>
            )}
          </div>

          <div className="flex items-center space-x-3">
            {taskElapsedSeconds > 0 && (
              <div className="text-right">
                <div className="text-[10px] text-zinc-400 uppercase tracking-wider">Duration</div>
                <div className="text-lg font-mono font-semibold text-zinc-200">
                  {formatTime(taskElapsedSeconds)}
                </div>
              </div>
            )}

            <Button
              variant="primary"
              size="sm"
              icon={<Play className="w-3.5 h-3.5" />}
              onClick={onOpenGame}
            >
              {isGameOpen ? "Focus Game" : "Launch Game"}
            </Button>
          </div>
        </div>

        {/* Input prompt notice if waiting for input */}
        {status === "WAITING_FOR_INPUT" && (
          <div className="p-3 bg-amber-500/10 border border-amber-500/30 rounded-xl text-xs text-amber-300 flex items-start space-x-2">
            <AlertCircle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
            <div>
              <strong className="font-semibold">Claude Code needs your confirmation:</strong>
              <p className="mt-0.5 text-zinc-300">
                {waitingForInputPrompt || "Tool execution or permission confirmation requested in your terminal."}
              </p>
            </div>
          </div>
        )}

        {/* Error message if failed */}
        {status === "FAILED" && (
          <div className="p-3 bg-rose-500/10 border border-rose-500/30 rounded-xl text-xs text-rose-300 flex items-start space-x-2">
            <XCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
            <div>
              <strong className="font-semibold">Task Failed:</strong>
              <p className="mt-0.5 text-zinc-300">{lastError || "The agent encountered an error during execution."}</p>
            </div>
          </div>
        )}

        {/* Completed notice */}
        {status === "COMPLETED" && (
          <div className="p-3 bg-emerald-500/10 border border-emerald-500/30 rounded-xl text-xs text-emerald-300 flex items-start space-x-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
            <div>
              <strong className="font-semibold">Turn Finished:</strong>
              <p className="mt-0.5 text-zinc-300">
                Claude Code completed its turn. Ready for the next instruction.
              </p>
            </div>
          </div>
        )}
      </div>
    </Card>
  );
};
