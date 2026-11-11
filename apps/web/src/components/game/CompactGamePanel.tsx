import React from "react";
import {
  Minimize2,
  Maximize2,
  X,
  Gamepad2,
  Expand,
  Clock,
} from "lucide-react";
import { AgentStatus, UserPreferences, GameScoreRecord } from "@waitplay/shared";
import { GameContainer } from "./GameContainer";
import { AgentStatusBadge } from "../ui/Badge";

export interface CompactGamePanelProps {
  isOpen: boolean;
  isMinimized: boolean;
  agentStatus: AgentStatus;
  taskElapsedSeconds: number;
  preferences: UserPreferences;
  isPaused: boolean;
  onToggleMinimize: () => void;
  onSwitchToFullscreen: () => void;
  onClose: () => void;
  onGameComplete: (score: GameScoreRecord) => void;
}

export const CompactGamePanel: React.FC<CompactGamePanelProps> = ({
  isOpen,
  isMinimized,
  agentStatus,
  taskElapsedSeconds,
  preferences,
  isPaused,
  onToggleMinimize,
  onSwitchToFullscreen,
  onClose,
  onGameComplete,
}) => {
  if (!isOpen) return null;

  const formatTaskTime = (sec: number) => {
    const mins = Math.floor(sec / 60);
    const remainder = sec % 60;
    return `${mins}:${remainder.toString().padStart(2, "0")}`;
  };

  return (
    <div
      className={`fixed z-40 right-4 bottom-4 transition-all duration-200 ease-out shadow-2xl rounded-xl border border-zinc-700/80 bg-zinc-900/95 backdrop-blur-md overflow-hidden ${
        isMinimized
          ? "w-72 h-14"
          : "w-[390px] sm:w-[440px] h-[520px] max-h-[calc(100vh-32px)] flex flex-col"
      }`}
    >
      {/* Floating Header */}
      <div className="flex items-center justify-between px-3.5 py-2.5 bg-zinc-950/60 border-b border-zinc-800 shrink-0">
        <div className="flex items-center space-x-2">
          <div className="p-1 rounded bg-blue-600/10 text-blue-400">
            <Gamepad2 className="w-4 h-4" />
          </div>
          <div>
            <div className="flex items-center space-x-1.5">
              <span className="text-xs font-semibold text-zinc-100">WaitPlay</span>
              <AgentStatusBadge status={agentStatus} />
            </div>
            {taskElapsedSeconds > 0 && (
              <div className="flex items-center space-x-1 text-[10px] text-zinc-400 font-mono mt-0.5">
                <Clock className="w-3 h-3 text-zinc-500" />
                <span>Agent time: {formatTaskTime(taskElapsedSeconds)}</span>
              </div>
            )}
          </div>
        </div>

        <div className="flex items-center space-x-1">
          <button
            onClick={onSwitchToFullscreen}
            className="p-1.5 rounded hover:bg-zinc-800 text-zinc-400 hover:text-zinc-200 transition-colors"
            title="Full Screen Mode"
          >
            <Expand className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={onToggleMinimize}
            className="p-1.5 rounded hover:bg-zinc-800 text-zinc-400 hover:text-zinc-200 transition-colors"
            title={isMinimized ? "Expand Game" : "Minimize"}
          >
            {isMinimized ? <Maximize2 className="w-3.5 h-3.5" /> : <Minimize2 className="w-3.5 h-3.5" />}
          </button>
          <button
            onClick={onClose}
            className="p-1.5 rounded hover:bg-zinc-800 text-zinc-400 hover:text-zinc-200 transition-colors"
            title="Close Game"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Main Game Container if not minimized */}
      {!isMinimized && (
        <div className="flex-1 overflow-hidden flex flex-col">
          <GameContainer
            preferences={preferences}
            isPaused={isPaused}
            onGameComplete={onGameComplete}
            onGameQuit={onClose}
          />
        </div>
      )}
    </div>
  );
};
