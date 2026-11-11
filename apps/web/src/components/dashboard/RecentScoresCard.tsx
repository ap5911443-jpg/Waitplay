import React from "react";
import { Trophy, Clock, Zap, Gamepad2 } from "lucide-react";
import { getGameStats } from "../../store/gameHistory";
import { Card } from "../ui/Card";

export const RecentScoresCard: React.FC = () => {
  const stats = getGameStats();

  const formatTime = (sec: number) => {
    const mins = Math.floor(sec / 60);
    const remainder = sec % 60;
    return `${mins}m ${remainder}s`;
  };

  return (
    <Card
      title="Games Played & Scores"
      subtitle="Gameplay performance while waiting for coding agents"
      icon={<Trophy className="w-5 h-5 text-amber-400" />}
    >
      <div className="grid grid-cols-3 gap-3 mb-4">
        <div className="p-3 bg-zinc-950/40 rounded-xl border border-zinc-800/80 text-center">
          <div className="text-[11px] text-zinc-400">Total Games</div>
          <div className="text-xl font-bold font-mono text-zinc-100 mt-0.5">
            {stats.totalGames}
          </div>
        </div>
        <div className="p-3 bg-zinc-950/40 rounded-xl border border-zinc-800/80 text-center">
          <div className="text-[11px] text-zinc-400">High Score</div>
          <div className="text-xl font-bold font-mono text-blue-400 mt-0.5">
            {stats.highScore}
          </div>
        </div>
        <div className="p-3 bg-zinc-950/40 rounded-xl border border-zinc-800/80 text-center">
          <div className="text-[11px] text-zinc-400">Play Time</div>
          <div className="text-xl font-bold font-mono text-zinc-100 mt-0.5">
            {formatTime(stats.totalTimeSeconds)}
          </div>
        </div>
      </div>

      {stats.recentScores.length === 0 ? (
        <div className="p-6 text-center border border-dashed border-zinc-800 rounded-xl text-xs text-zinc-500">
          <Gamepad2 className="w-8 h-8 mx-auto text-zinc-700 mb-2" />
          No games played yet. Scores will appear here once Claude Code starts working or when you test a game.
        </div>
      ) : (
        <div className="space-y-2 max-h-56 overflow-y-auto pr-1">
          {stats.recentScores.map((score) => (
            <div
              key={score.id}
              className="flex items-center justify-between p-2.5 bg-zinc-950/40 hover:bg-zinc-950/70 border border-zinc-800/70 rounded-lg text-xs transition-colors"
            >
              <div className="flex items-center space-x-2.5">
                <div className="w-7 h-7 rounded-md bg-blue-500/10 border border-blue-500/20 text-blue-400 flex items-center justify-center font-bold text-[10px]">
                  {score.difficulty[0].toUpperCase()}
                </div>
                <div>
                  <div className="font-medium text-zinc-200">{score.gameTitle}</div>
                  <div className="text-[10px] text-zinc-400 flex items-center space-x-2">
                    <span className="flex items-center space-x-0.5">
                      <Clock className="w-2.5 h-2.5" />
                      <span>{score.elapsedSeconds}s</span>
                    </span>
                    {score.accuracyPercent !== undefined && (
                      <span className="flex items-center space-x-0.5 text-zinc-400">
                        <Zap className="w-2.5 h-2.5 text-amber-400" />
                        <span>{score.accuracyPercent}%</span>
                      </span>
                    )}
                  </div>
                </div>
              </div>

              <div className="text-right">
                <div className="font-mono font-bold text-zinc-100 text-sm">{score.score}</div>
                <div className="text-[10px] text-zinc-500">
                  {new Date(score.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
};
