import React from "react";
import { HelpCircle, Clock, ShieldAlert } from "lucide-react";
import { GameStateProps } from "@waitplay/shared";

export const RiddleChallengePlaceholder: React.FC<GameStateProps> = ({ onGameQuit }) => {
  return (
    <div className="flex flex-col items-center justify-center p-6 text-center h-full">
      <div className="w-12 h-12 rounded-full bg-purple-500/10 border border-purple-500/30 flex items-center justify-center text-purple-400 mb-3">
        <HelpCircle className="w-6 h-6" />
      </div>
      <div className="inline-flex items-center space-x-1 px-2 py-0.5 rounded-full bg-purple-500/10 text-purple-400 text-[11px] font-medium border border-purple-500/20 mb-2">
        <Clock className="w-3 h-3" />
        <span>Coming Soon • In Development</span>
      </div>
      <h3 className="text-base font-semibold text-zinc-100">Riddle Challenge</h3>
      <p className="text-xs text-zinc-400 max-w-xs mt-1.5 leading-relaxed">
        Bite-sized algorithmic puzzles, CS trivia, and riddles designed for long agent inference sessions. Coming in a future update.
      </p>
      <div className="mt-4 flex items-center space-x-2 text-xs text-zinc-500">
        <ShieldAlert className="w-4 h-4 text-zinc-500" />
        <span>Select Memory Match in settings to play during agent work.</span>
      </div>
      <button
        onClick={onGameQuit}
        className="mt-4 px-3 py-1.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-xs font-medium rounded transition-colors"
      >
        Close
      </button>
    </div>
  );
};
