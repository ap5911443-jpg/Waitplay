import React, { useState, useEffect, useRef, useCallback } from "react";
import {
  Terminal,
  Bug,
  GitBranch,
  Cpu,
  Database,
  Zap,
  Shield,
  Layers,
  Code2,
  Key,
  RotateCcw,
  Pause,
  Play,
  Trophy,
  Timer as TimerIcon,
  MousePointerClick,
  CheckCircle2,
} from "lucide-react";
import { GameStateProps, GameScoreRecord } from "@waitplay/shared";
import { generateDeck, MemoryCardData } from "./cards";
import { useAudioPlayer } from "../../hooks/useAudioPlayer";

function renderCardIcon(symbolId: string, className = "w-6 h-6") {
  switch (symbolId) {
    case "terminal":
      return <Terminal className={className} />;
    case "bug":
      return <Bug className={className} />;
    case "git":
      return <GitBranch className={className} />;
    case "cpu":
      return <Cpu className={className} />;
    case "database":
      return <Database className={className} />;
    case "zap":
      return <Zap className={className} />;
    case "shield":
      return <Shield className={className} />;
    case "layers":
      return <Layers className={className} />;
    case "code":
      return <Code2 className={className} />;
    case "key":
      return <Key className={className} />;
    default:
      return <Code2 className={className} />;
  }
}

export const MemoryGame: React.FC<GameStateProps> = ({
  onGameComplete,
  onGameQuit,
  difficulty,
  soundEnabled,
  isPaused: externalPaused,
}) => {
  const { playCardFlip, playMatchFound, playMismatch, playVictory } = useAudioPlayer(soundEnabled);

  const [cards, setCards] = useState<MemoryCardData[]>(() => generateDeck(difficulty));
  const [flippedIds, setFlippedIds] = useState<string[]>([]);
  const [matchedIds, setMatchedIds] = useState<string[]>([]);
  const [turns, setTurns] = useState<number>(0);
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const [internalPaused, setInternalPaused] = useState<boolean>(false);
  const [elapsedSeconds, setElapsedSeconds] = useState<number>(0);
  const [isFinished, setIsFinished] = useState<boolean>(false);
  const [finalScore, setFinalScore] = useState<number>(0);

  const isPaused = externalPaused || internalPaused;
  const totalPairs = cards.length / 2;
  const isComplete = matchedIds.length === cards.length && cards.length > 0;

  // Timer interval
  useEffect(() => {
    if (isPaused || isFinished) return;

    const interval = setInterval(() => {
      setElapsedSeconds((prev) => prev + 1);
    }, 1000);

    return () => clearInterval(interval);
  }, [isPaused, isFinished]);

  // Restart game
  const handleRestart = useCallback(() => {
    setCards(generateDeck(difficulty));
    setFlippedIds([]);
    setMatchedIds([]);
    setTurns(0);
    setIsProcessing(false);
    setElapsedSeconds(0);
    setIsFinished(false);
    setFinalScore(0);
  }, [difficulty]);

  // Handle card click
  const handleCardClick = (cardId: string) => {
    if (isPaused || isProcessing || isFinished) return;
    if (flippedIds.includes(cardId) || matchedIds.includes(cardId)) return;
    if (flippedIds.length >= 2) return;

    playCardFlip();

    const newFlipped = [...flippedIds, cardId];
    setFlippedIds(newFlipped);

    if (newFlipped.length === 2) {
      setTurns((prev) => prev + 1);
      setIsProcessing(true);

      const firstCard = cards.find((c) => c.id === newFlipped[0]);
      const secondCard = cards.find((c) => c.id === newFlipped[1]);

      if (firstCard && secondCard && firstCard.symbolId === secondCard.symbolId) {
        // Matched
        setTimeout(() => {
          playMatchFound();
          setMatchedIds((prev) => [...prev, firstCard.id, secondCard.id]);
          setFlippedIds([]);
          setIsProcessing(false);
        }, 350);
      } else {
        // Mismatched
        setTimeout(() => {
          playMismatch();
          setFlippedIds([]);
          setIsProcessing(false);
        }, 900);
      }
    }
  };

  // Completion effect
  useEffect(() => {
    if (isComplete && !isFinished) {
      setIsFinished(true);
      playVictory();

      // Score formula: base 1000, penalty for elapsed seconds and extra turns
      const basePoints = totalPairs * 250;
      const turnPenalty = Math.max(0, (turns - totalPairs) * 15);
      const timePenalty = elapsedSeconds * 4;
      const calculatedScore = Math.max(100, basePoints - turnPenalty - timePenalty);
      setFinalScore(calculatedScore);

      const accuracy = Math.round((totalPairs / Math.max(1, turns)) * 100);

      const record: GameScoreRecord = {
        id: `score-${Date.now()}`,
        gameId: "memory-match",
        gameTitle: "Memory Match",
        timestamp: Date.now(),
        score: calculatedScore,
        elapsedSeconds,
        difficulty,
        accuracyPercent: accuracy,
        matchedPairs: totalPairs,
        totalTurns: turns,
      };

      onGameComplete(record);
    }
  }, [
    isComplete,
    isFinished,
    totalPairs,
    turns,
    elapsedSeconds,
    difficulty,
    onGameComplete,
    playVictory,
  ]);

  // Format timer string MM:SS
  const formatTime = (sec: number) => {
    const mins = Math.floor(sec / 60);
    const remainder = sec % 60;
    return `${mins.toString().padStart(2, "0")}:${remainder.toString().padStart(2, "0")}`;
  };

  // Grid layout class based on card count
  const gridClass =
    cards.length <= 12
      ? "grid-cols-3 sm:grid-cols-4"
      : cards.length <= 16
        ? "grid-cols-4"
        : "grid-cols-4 sm:grid-cols-5";

  return (
    <div className="flex flex-col h-full w-full select-none">
      {/* Top Game Controls & Telemetry */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-zinc-800 bg-zinc-900/60 rounded-t-lg text-xs text-zinc-300">
        <div className="flex items-center space-x-3">
          <div className="flex items-center space-x-1.5 font-medium">
            <TimerIcon className="w-3.5 h-3.5 text-blue-400" />
            <span className="font-mono text-zinc-100">{formatTime(elapsedSeconds)}</span>
          </div>
          <div className="flex items-center space-x-1.5">
            <MousePointerClick className="w-3.5 h-3.5 text-zinc-400" />
            <span>Turns: <strong className="text-zinc-100 font-mono">{turns}</strong></span>
          </div>
          <div className="hidden sm:flex items-center space-x-1.5">
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
            <span>Matched: <strong className="text-zinc-100 font-mono">{matchedIds.length / 2}/{totalPairs}</strong></span>
          </div>
        </div>

        <div className="flex items-center space-x-1">
          <button
            onClick={() => setInternalPaused((p) => !p)}
            className="p-1.5 rounded hover:bg-zinc-800 text-zinc-400 hover:text-zinc-200 transition-colors"
            title={isPaused ? "Resume" : "Pause"}
          >
            {isPaused ? <Play className="w-3.5 h-3.5" /> : <Pause className="w-3.5 h-3.5" />}
          </button>
          <button
            onClick={handleRestart}
            className="p-1.5 rounded hover:bg-zinc-800 text-zinc-400 hover:text-zinc-200 transition-colors"
            title="Restart Game"
          >
            <RotateCcw className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Main Play Area */}
      <div className="relative flex-1 p-3 flex items-center justify-center overflow-auto min-h-[220px]">
        {/* Pause Overlay */}
        {isPaused && !isFinished && (
          <div className="absolute inset-0 bg-zinc-950/80 backdrop-blur-xs flex flex-col items-center justify-center z-20 rounded-b-lg">
            <Pause className="w-8 h-8 text-blue-400 mb-2 animate-pulse" />
            <p className="text-sm font-medium text-zinc-200">
              {externalPaused ? "Paused: Claude Code needs input" : "Game Paused"}
            </p>
            {!externalPaused && (
              <button
                onClick={() => setInternalPaused(false)}
                className="mt-3 px-3 py-1.5 bg-blue-600 hover:bg-blue-500 text-white rounded text-xs font-medium transition-colors"
              >
                Resume
              </button>
            )}
          </div>
        )}

        {/* Completion Modal / Overlay */}
        {isFinished && (
          <div className="absolute inset-0 bg-zinc-950/90 backdrop-blur-sm flex flex-col items-center justify-center z-30 p-4 text-center rounded-b-lg">
            <div className="w-12 h-12 rounded-full bg-emerald-500/20 border border-emerald-500/30 flex items-center justify-center text-emerald-400 mb-2">
              <Trophy className="w-6 h-6" />
            </div>
            <h3 className="text-base font-semibold text-zinc-100">Memory Match Complete!</h3>
            <p className="text-xs text-zinc-400 mt-1">
              You cleared all pairs in <span className="text-zinc-200 font-medium">{formatTime(elapsedSeconds)}</span> with <span className="text-zinc-200 font-medium">{turns}</span> turns.
            </p>

            <div className="my-3 px-4 py-2 bg-zinc-900 border border-zinc-800 rounded-lg">
              <div className="text-[10px] uppercase tracking-wider text-zinc-400">Final Score</div>
              <div className="text-2xl font-bold font-mono text-blue-400">{finalScore}</div>
            </div>

            <div className="flex items-center space-x-2 mt-1">
              <button
                onClick={handleRestart}
                className="px-3 py-1.5 bg-blue-600 hover:bg-blue-500 text-white text-xs font-medium rounded transition-colors flex items-center space-x-1"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>Play Again</span>
              </button>
              <button
                onClick={onGameQuit}
                className="px-3 py-1.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-xs font-medium rounded transition-colors"
              >
                Dismiss
              </button>
            </div>
          </div>
        )}

        {/* Cards Grid */}
        <div className={`grid ${gridClass} gap-2 w-full max-w-md mx-auto`}>
          {cards.map((card) => {
            const isFlipped = flippedIds.includes(card.id) || matchedIds.includes(card.id);
            const isMatched = matchedIds.includes(card.id);

            return (
              <button
                key={card.id}
                onClick={() => handleCardClick(card.id)}
                disabled={isMatched || isPaused || isProcessing}
                className={`aspect-square rounded-lg p-1.5 text-center transition-all duration-300 focus:outline-hidden focus:ring-1 focus:ring-blue-500 ${
                  isMatched
                    ? "opacity-60 bg-zinc-900/50 border border-emerald-500/20 cursor-default"
                    : isFlipped
                      ? "bg-zinc-800 border border-zinc-700 shadow-md scale-95"
                      : "bg-zinc-900 border border-zinc-800 hover:border-zinc-700 hover:bg-zinc-850 active:scale-95 cursor-pointer"
                }`}
                aria-label={isFlipped ? card.label : "Hidden Card"}
              >
                <div className="w-full h-full flex flex-col items-center justify-center">
                  {isFlipped ? (
                    <div className="flex flex-col items-center justify-center animate-in fade-in zoom-in-75 duration-150">
                      <div className={`p-1.5 rounded-md ${card.color} border mb-1`}>
                        {renderCardIcon(card.symbolId, "w-5 h-5")}
                      </div>
                      <span className="text-[10px] font-medium text-zinc-300 truncate max-w-[58px]">
                        {card.label}
                      </span>
                    </div>
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-zinc-600">
                      <div className="w-5 h-5 rounded-sm border border-dashed border-zinc-700 flex items-center justify-center text-[9px] font-mono">
                        ?
                      </div>
                    </div>
                  )}
                </div>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
};
