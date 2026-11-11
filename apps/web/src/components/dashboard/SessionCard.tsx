import React from "react";
import { FolderGit2, CheckSquare, Clock, Layers } from "lucide-react";
import { AgentSessionInfo } from "@waitplay/shared";
import { Card } from "../ui/Card";

export interface SessionCardProps {
  sessions: AgentSessionInfo[];
  activeSession: AgentSessionInfo | null;
  onSelectSession: (sessionId: string) => void;
}

export const SessionCard: React.FC<SessionCardProps> = ({
  sessions,
  activeSession,
  onSelectSession,
}) => {
  const formatTime = (ms?: number) => {
    if (!ms) return "0s";
    const sec = Math.round(ms / 1000);
    return `${sec}s`;
  };

  return (
    <Card
      title="Session Information"
      subtitle="Claude Code session metadata and multi-session routing"
      icon={<FolderGit2 className="w-5 h-5 text-blue-400" />}
      action={
        sessions.length > 1 ? (
          <select
            value={activeSession?.sessionId ?? ""}
            onChange={(e) => onSelectSession(e.target.value)}
            className="bg-zinc-800 border border-zinc-700 text-zinc-200 text-xs rounded-lg px-2 py-1 outline-hidden"
          >
            {sessions.map((s) => (
              <option key={s.sessionId} value={s.sessionId}>
                {s.sessionId.slice(0, 16)} ({s.status})
              </option>
            ))}
          </select>
        ) : undefined
      }
    >
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        <div className="p-3 bg-zinc-950/40 rounded-xl border border-zinc-800/80">
          <div className="flex items-center space-x-1.5 text-zinc-400 text-xs">
            <Layers className="w-3.5 h-3.5 text-blue-400" />
            <span>Session ID</span>
          </div>
          <div className="mt-1 font-mono text-xs text-zinc-200 font-semibold truncate">
            {activeSession?.sessionId || "standalone-local"}
          </div>
        </div>

        <div className="p-3 bg-zinc-950/40 rounded-xl border border-zinc-800/80">
          <div className="flex items-center space-x-1.5 text-zinc-400 text-xs">
            <CheckSquare className="w-3.5 h-3.5 text-emerald-400" />
            <span>Tasks Finished</span>
          </div>
          <div className="mt-1 font-mono text-lg text-zinc-100 font-bold">
            {activeSession?.totalTasksCompleted ?? 0}
          </div>
        </div>

        <div className="p-3 bg-zinc-950/40 rounded-xl border border-zinc-800/80 col-span-2 sm:col-span-1">
          <div className="flex items-center space-x-1.5 text-zinc-400 text-xs">
            <Clock className="w-3.5 h-3.5 text-amber-400" />
            <span>Last Task Time</span>
          </div>
          <div className="mt-1 font-mono text-lg text-zinc-100 font-bold">
            {formatTime(activeSession?.lastTaskDurationMs)}
          </div>
        </div>
      </div>
    </Card>
  );
};
