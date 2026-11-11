import React from "react";
import { Trophy, CheckCircle, Clock, Zap, ArrowRight, X } from "lucide-react";
import { GameScoreRecord } from "@waitplay/shared";

export interface GameResultModalProps {
  isOpen: boolean;
  scoreRecord: GameScoreRecord | null;
  agentResponseTimeSeconds?: number;
  onDismiss: () => void;
  onPlayAgain?: () => void;
}

export const GameResultModal: React.FC<GameResultModalProps> = ({
  isOpen,
  scoreRecord,
  agentResponseTimeSeconds,
  onDismiss,
  onPlayAgain,
}) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-zinc-950/80 backdrop-blur-xs animate-in fade-in duration-150">
      <div className="bg-zinc-900 border border-zinc-800 rounded-2xl w-full max-w-sm shadow-2xl p-6 text-center animate-in zoom-in-95 duration-150 relative">
        <button
          onClick={onDismiss}
          className="absolute top-4 right-4 p-1 rounded-lg text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 transition-colors"
        >
          <X className="w-4 h-4" />
        </button>

        <div className="w-14 h-14 rounded-2xl bg-blue-500/10 border border-blue-500/20 text-blue-400 flex items-center justify-center mx-auto mb-3">
          <CheckCircle className="w-7 h-7 text-emerald-400" />
        </div>

        <h3 className="text-lg font-bold text-zinc-100">Agent Task Completed</h3>
        <p className="text-xs text-zinc-400 mt-1">
          Claude Code finished its response
          {agentResponseTimeSeconds ? ` in ${agentResponseTimeSeconds}s` : ""}.
        </p>

        {scoreRecord ? (
          <div className="my-5 p-4 bg-zinc-950/60 rounded-xl border border-zinc-800/80">
            <div className="text-[11px] font-semibold text-zinc-400 uppercase tracking-wider">
              {scoreRecord.gameTitle}
            </div>
            <div className="text-3xl font-extrabold font-mono text-blue-400 my-1">
              {scoreRecord.score}
            </div>
            <div className="grid grid-cols-2 gap-2 mt-3 pt-3 border-t border-zinc-800/60 text-xs">
              <div className="flex items-center justify-center space-x-1.5 text-zinc-300">
                <Clock className="w-3.5 h-3.5 text-zinc-500" />
                <span>{scoreRecord.elapsedSeconds}s played</span>
              </div>
              <div className="flex items-center justify-center space-x-1.5 text-zinc-300">
                <Zap className="w-3.5 h-3.5 text-amber-400" />
                <span>{scoreRecord.accuracyPercent ?? 100}% accuracy</span>
              </div>
            </div>
          </div>
        ) : (
          <div className="my-5 p-4 bg-zinc-950/40 rounded-xl border border-zinc-800 text-xs text-zinc-400">
            Game session paused as Claude Code completed its task.
          </div>
        )}

        <div className="flex items-center space-x-2">
          {onPlayAgain && (
            <button
              onClick={onPlayAgain}
              className="flex-1 py-2 px-3 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-xs font-medium rounded-lg transition-colors flex items-center justify-center space-x-1.5"
            >
              <Trophy className="w-3.5 h-3.5 text-amber-400" />
              <span>Play Again</span>
            </button>
          )}
          <button
            onClick={onDismiss}
            className="flex-1 py-2 px-3 bg-blue-600 hover:bg-blue-500 text-white text-xs font-medium rounded-lg transition-colors flex items-center justify-center space-x-1.5"
          >
            <span>Back to Agent</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
};
