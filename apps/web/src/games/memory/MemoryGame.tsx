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
      <div className="flex items-center justify-between px-3.5 py-2.5 border-b border-ink/10 bg-canvas-muted/50 rounded-t-xl text-xs text-ink-soft">
        <div className="flex items-center space-x-3.5">
          <div className="flex items-center space-x-1.5 font-medium text-ink">
            <TimerIcon className="w-3.5 h-3.5 text-forest" />
            <span className="font-mono text-ink font-semibold">{formatTime(elapsedSeconds)}</span>
          </div>
          <div className="flex items-center space-x-1.5">
            <MousePointerClick className="w-3.5 h-3.5 text-ink-muted" />
            <span>Turns: <strong className="text-ink font-mono">{turns}</strong></span>
          </div>
          <div className="hidden sm:flex items-center space-x-1.5">
            <CheckCircle2 className="w-3.5 h-3.5 text-forest" />
            <span>Matched: <strong className="text-forest font-mono">{matchedIds.length / 2}/{totalPairs}</strong></span>
          </div>
        </div>

        <div className="flex items-center space-x-1">
          <button
            onClick={() => setInternalPaused((p) => !p)}
            className="p-1.5 rounded-lg hover:bg-canvas text-ink-soft hover:text-ink transition-colors cursor-pointer"
            title={isPaused ? "Resume" : "Pause"}
          >
            {isPaused ? <Play className="w-3.5 h-3.5" /> : <Pause className="w-3.5 h-3.5" />}
          </button>
          <button
            onClick={handleRestart}
            className="p-1.5 rounded-lg hover:bg-canvas text-ink-soft hover:text-ink transition-colors cursor-pointer"
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
          <div className="absolute inset-0 bg-canvas/90 backdrop-blur-xs flex flex-col items-center justify-center z-20 rounded-b-xl">
            <Pause className="w-8 h-8 text-forest mb-2 animate-pulse" />
            <p className="font-serif text-base text-ink">
              {externalPaused ? "Paused: Agent needs confirmation" : "Game Paused"}
            </p>
            {!externalPaused && (
              <button
                onClick={() => setInternalPaused(false)}
                className="mt-3 px-4 py-1.5 bg-lavender hover:bg-lavender-hover text-ink border border-ink/15 rounded-xl text-xs font-semibold shadow-subtle transition-all cursor-pointer"
              >
                Resume Game
              </button>
            )}
          </div>
        )}

        {/* Completion Modal / Overlay */}
        {isFinished && (
          <div className="absolute inset-0 bg-canvas/95 backdrop-blur-sm flex flex-col items-center justify-center z-30 p-5 text-center rounded-b-xl border border-forest/30 shadow-popover">
            <div className="w-12 h-12 rounded-full bg-forest/10 border border-forest/20 flex items-center justify-center text-forest mb-2">
              <Trophy className="w-6 h-6" />
            </div>
            <h3 className="font-serif text-xl text-ink font-normal">Memory Match Complete!</h3>
            <p className="font-sans text-xs text-ink-soft mt-1">
              Cleared all pairs in <span className="text-ink font-semibold">{formatTime(elapsedSeconds)}</span> with <span className="text-ink font-semibold">{turns}</span> turns.
            </p>

            <div className="my-3 px-5 py-2.5 bg-white border border-ink/15 rounded-2xl shadow-subtle">
              <div className="text-[10px] uppercase font-semibold tracking-wider text-ink-muted">Final Score</div>
              <div className="text-2xl font-serif font-bold text-forest">{finalScore}</div>
            </div>

            <div className="flex items-center space-x-2 mt-1">
              <button
                onClick={handleRestart}
                className="px-4 py-2 bg-lavender hover:bg-lavender-hover text-ink text-xs font-semibold rounded-xl border border-ink/15 shadow-subtle transition-all flex items-center space-x-1.5 cursor-pointer"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>Play Again</span>
              </button>
              <button
                onClick={onGameQuit}
                className="px-4 py-2 bg-white hover:bg-canvas-muted text-ink-soft hover:text-ink text-xs font-medium rounded-xl border border-ink/15 transition-all cursor-pointer"
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
                className={`aspect-square rounded-2xl p-1.5 text-center transition-all duration-200 focus:outline-hidden ${
                  isMatched
                    ? "opacity-75 bg-forest/10 border border-forest/30 cursor-default"
                    : isFlipped
                      ? "bg-lavender border border-ink/20 shadow-subtle scale-98"
                      : "bg-white border border-ink/15 hover:border-forest/40 hover:shadow-subtle hover:scale-102 active:scale-96 cursor-pointer shadow-subtle"
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
                    <div className="w-full h-full flex items-center justify-center text-ink-muted font-serif text-2xl select-none">
                      ?
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
