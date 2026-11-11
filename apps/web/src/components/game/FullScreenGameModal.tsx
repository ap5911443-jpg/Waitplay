import React, { useEffect } from "react";
import { Shrink, X, Gamepad2, Clock } from "lucide-react";
import { AgentStatus, UserPreferences, GameScoreRecord } from "@waitplay/shared";
import { GameContainer } from "./GameContainer";
import { AgentStatusBadge } from "../ui/Badge";

export interface FullScreenGameModalProps {
  isOpen: boolean;
  agentStatus: AgentStatus;
  taskElapsedSeconds: number;
  preferences: UserPreferences;
  isPaused: boolean;
  onExitFullscreen: () => void;
  onClose: () => void;
  onGameComplete: (score: GameScoreRecord) => void;
}

export const FullScreenGameModal: React.FC<FullScreenGameModalProps> = ({
  isOpen,
  agentStatus,
  taskElapsedSeconds,
  preferences,
  isPaused,
  onExitFullscreen,
  onClose,
  onGameComplete,
}) => {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && isOpen) {
        onExitFullscreen();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onExitFullscreen]);

  if (!isOpen) return null;

  const formatTaskTime = (sec: number) => {
    const mins = Math.floor(sec / 60);
    const remainder = sec % 60;
    return `${mins}:${remainder.toString().padStart(2, "0")}`;
  };

  return (
    <div className="fixed inset-0 z-50 bg-zinc-950 flex flex-col animate-in fade-in duration-200">
      {/* Top Telemetry & Controls Bar */}
      <div className="flex items-center justify-between px-6 py-3 border-b border-zinc-800 bg-zinc-900/60 backdrop-blur-md shrink-0">
        <div className="flex items-center space-x-4">
          <div className="flex items-center space-x-2">
            <div className="p-1.5 rounded-lg bg-blue-600/10 text-blue-400">
              <Gamepad2 className="w-5 h-5" />
            </div>
            <span className="text-sm font-bold tracking-tight text-zinc-100">WaitPlay</span>
          </div>
          <div className="h-4 w-px bg-zinc-800" />
          <div className="flex items-center space-x-2">
            <span className="text-xs text-zinc-400">Agent:</span>
            <AgentStatusBadge status={agentStatus} />
          </div>
          {taskElapsedSeconds > 0 && (
            <div className="hidden sm:flex items-center space-x-1.5 text-xs text-zinc-400 font-mono">
              <Clock className="w-3.5 h-3.5 text-zinc-500" />
              <span>Working Time: {formatTaskTime(taskElapsedSeconds)}</span>
            </div>
          )}
        </div>

        <div className="flex items-center space-x-2">
          <button
            onClick={onExitFullscreen}
            className="flex items-center space-x-1.5 px-3 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-xs font-medium text-zinc-200 transition-colors"
            title="Compact Mode (Esc)"
          >
            <Shrink className="w-3.5 h-3.5" />
            <span>Compact Mode</span>
          </button>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 transition-colors"
            title="Exit Game"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Main Full-Screen Game Area */}
      <div className="flex-1 overflow-auto flex items-center justify-center p-6 max-w-4xl w-full mx-auto">
        <div className="w-full max-w-2xl bg-zinc-900/40 border border-zinc-800/80 rounded-2xl p-4 shadow-xl">
          <GameContainer
            preferences={preferences}
            isPaused={isPaused}
            onGameComplete={onGameComplete}
            onGameQuit={onClose}
          />
        </div>
      </div>
    </div>
  );
};
