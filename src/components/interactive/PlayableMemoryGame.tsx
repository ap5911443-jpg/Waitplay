import React, { useState, useEffect } from "react";
import { RotateCcw, Trophy } from "lucide-react";

interface Card {
  id: number;
  symbol: string;
  name: string;
  isFlipped: boolean;
  isMatched: boolean;
}

const INITIAL_PAIRS = [
  { symbol: "⚡", name: "Lightning" },
  { symbol: "🧠", name: "Reasoning" },
  { symbol: "🎮", name: "Companion" },
  { symbol: "🚀", name: "Diff Ship" },
];

export const PlayableMemoryGame: React.FC<{ onGameComplete?: () => void }> = ({
  onGameComplete,
}) => {
  const [cards, setCards] = useState<Card[]>([]);
  const [flippedIds, setFlippedIds] = useState<number[]>([]);
  const [moves, setMoves] = useState(0);
  const [matchedPairs, setMatchedPairs] = useState(0);
  const [isCompleted, setIsCompleted] = useState(false);

  const initializeGame = () => {
    const deck: Card[] = [];
    let idCounter = 0;
    // create two of each
    INITIAL_PAIRS.forEach((item) => {
      deck.push({ id: idCounter++, symbol: item.symbol, name: item.name, isFlipped: false, isMatched: false });
      deck.push({ id: idCounter++, symbol: item.symbol, name: item.name, isFlipped: false, isMatched: false });
    });
    // shuffle
    for (let i = deck.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [deck[i], deck[j]] = [deck[j], deck[i]];
    }
    setCards(deck);
    setFlippedIds([]);
    setMoves(0);
    setMatchedPairs(0);
    setIsCompleted(false);
  };

  useEffect(() => {
    initializeGame();
  }, []);

  const handleCardClick = (id: number) => {
    if (flippedIds.length === 2) return;
    const card = cards.find((c) => c.id === id);
    if (!card || card.isFlipped || card.isMatched) return;

    const nextFlipped = [...flippedIds, id];
    setFlippedIds(nextFlipped);

    // flip the card visually
    setCards((prev) =>
      prev.map((c) => (c.id === id ? { ...c, isFlipped: true } : c))
    );

    if (nextFlipped.length === 2) {
      setMoves((m) => m + 1);
      const [firstId, secondId] = nextFlipped;
      const firstCard = cards.find((c) => c.id === firstId);
      const secondCard = cards.find((c) => c.id === secondId);

      if (firstCard && secondCard && firstCard.symbol === secondCard.symbol) {
        // Match!
        setTimeout(() => {
          setCards((prev) =>
            prev.map((c) =>
              c.id === firstId || c.id === secondId
                ? { ...c, isMatched: true, isFlipped: true }
                : c
            )
          );
          setFlippedIds([]);
          setMatchedPairs((p) => {
            const nextP = p + 1;
            if (nextP === INITIAL_PAIRS.length) {
              setIsCompleted(true);
              if (onGameComplete) onGameComplete();
            }
            return nextP;
          });
        }, 350);
      } else {
        // No match - flip back
        setTimeout(() => {
          setCards((prev) =>
            prev.map((c) =>
              c.id === firstId || c.id === secondId
                ? { ...c, isFlipped: false }
                : c
            )
          );
          setFlippedIds([]);
        }, 800);
      }
    }
  };

  return (
    <div className="w-full bg-[#FFFFFF] rounded-[20px] p-5 sm:p-6 border border-[rgba(26,26,26,0.12)] shadow-[0_4px_20px_rgba(26,26,15,0.06)] select-none">
      {/* Game Header */}
      <div className="flex items-center justify-between pb-4 mb-4 border-b border-[rgba(26,26,26,0.08)]">
        <div className="flex items-center gap-2">
          <span className="w-2.5 h-2.5 rounded-full bg-[#034F46] animate-pulse" />
          <span className="font-sans font-semibold text-[14px] text-[#1A1A1A]">
            Micro-Game: Memory Match
          </span>
        </div>
        <div className="flex items-center gap-4 text-[13px] text-[#666666]">
          <span>
            Moves: <strong className="text-[#1A1A1A] font-semibold">{moves}</strong>
          </span>
          <span>
            Matched:{" "}
            <strong className="text-[#034F46] font-semibold">
              {matchedPairs}/{INITIAL_PAIRS.length}
            </strong>
          </span>
          <button
            onClick={initializeGame}
            className="p-1.5 rounded-lg hover:bg-[#E4E4D0]/60 text-[#1A1A1A] transition-colors cursor-pointer"
            title="Reset Game"
          >
            <RotateCcw className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Game Board Grid */}
      <div className="grid grid-cols-4 gap-2.5 sm:gap-3.5">
        {cards.map((card) => {
          const isRevealed = card.isFlipped || card.isMatched;
          return (
            <button
              key={card.id}
              onClick={() => handleCardClick(card.id)}
              disabled={isRevealed || flippedIds.length === 2}
              className={`aspect-square rounded-[14px] flex flex-col items-center justify-center p-2 transition-all duration-300 cursor-pointer border ${
                card.isMatched
                  ? "bg-[#034F46] border-[#023932] text-[#FFFFEB] scale-95 shadow-inner"
                  : isRevealed
                  ? "bg-[#F0D7FF] border-[#E8C4FF] text-[#1A1A1A] shadow-sm rotate-0 scale-100"
                  : "bg-[#F5F5EA] border-[rgba(26,26,26,0.12)] hover:bg-[#EAEAD8] hover:border-[rgba(26,26,26,0.25)] text-transparent active:scale-95"
              }`}
            >
              {isRevealed ? (
                <div className="flex flex-col items-center justify-center animate-scaleUp">
                  <span className="text-2xl sm:text-3xl">{card.symbol}</span>
                  <span className="text-[10px] sm:text-[11px] font-medium tracking-tight mt-1 opacity-90">
                    {card.name}
                  </span>
                </div>
              ) : (
                <div className="w-5 h-5 rounded-full border border-[rgba(26,26,26,0.2)] flex items-center justify-center">
                  <span className="w-1.5 h-1.5 rounded-full bg-[rgba(26,26,26,0.3)]" />
                </div>
              )}
            </button>
          );
        })}
      </div>

      {/* Completion Banner */}
      {isCompleted && (
        <div className="mt-4 p-3 rounded-[12px] bg-[#F0D7FF]/60 border border-[#E8C4FF] flex items-center justify-between animate-fadeIn">
          <div className="flex items-center gap-2 text-[#1A1A1A]">
            <Trophy className="w-4 h-4 text-[#FFA946]" />
            <span className="text-[13px] font-semibold">
              Board Cleared in {moves} moves!
            </span>
          </div>
          <button
            onClick={initializeGame}
            className="text-[12px] font-semibold text-[#034F46] hover:underline cursor-pointer"
          >
            Play Again
          </button>
        </div>
      )}
    </div>
  );
};
