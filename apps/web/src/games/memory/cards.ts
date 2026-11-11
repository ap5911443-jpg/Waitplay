import { GameDifficulty } from "@waitplay/shared";

export interface MemoryCardData {
  id: string;
  symbolId: string;
  label: string;
  color: string;
}

export const MEMORY_SYMBOLS: { symbolId: string; label: string; color: string }[] = [
  { symbolId: "terminal", label: "Terminal", color: "text-emerald-400 bg-emerald-500/10 border-emerald-500/30" },
  { symbolId: "bug", label: "Debug", color: "text-rose-400 bg-rose-500/10 border-rose-500/30" },
  { symbolId: "git", label: "Git Branch", color: "text-amber-400 bg-amber-500/10 border-amber-500/30" },
  { symbolId: "cpu", label: "Processor", color: "text-cyan-400 bg-cyan-500/10 border-cyan-500/30" },
  { symbolId: "database", label: "Database", color: "text-indigo-400 bg-indigo-500/10 border-indigo-500/30" },
  { symbolId: "zap", label: "Latency", color: "text-yellow-400 bg-yellow-500/10 border-yellow-500/30" },
  { symbolId: "shield", label: "Security", color: "text-blue-400 bg-blue-500/10 border-blue-500/30" },
  { symbolId: "layers", label: "Stack", color: "text-purple-400 bg-purple-500/10 border-purple-500/30" },
  { symbolId: "code", label: "Syntax", color: "text-teal-400 bg-teal-500/10 border-teal-500/30" },
  { symbolId: "key", label: "Auth Token", color: "text-orange-400 bg-orange-500/10 border-orange-500/30" },
];

export function generateDeck(difficulty: GameDifficulty): MemoryCardData[] {
  let pairCount = 8; // default medium
  if (difficulty === "easy") pairCount = 6;
  if (difficulty === "hard") pairCount = 10;

  const selectedSymbols = MEMORY_SYMBOLS.slice(0, pairCount);
  const deck: MemoryCardData[] = [];

  selectedSymbols.forEach((sym) => {
    deck.push({
      id: `${sym.symbolId}-a`,
      symbolId: sym.symbolId,
      label: sym.label,
      color: sym.color,
    });
    deck.push({
      id: `${sym.symbolId}-b`,
      symbolId: sym.symbolId,
      label: sym.label,
      color: sym.color,
    });
  });

  // Fisher-Yates shuffle
  for (let i = deck.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    const temp = deck[i];
    deck[i] = deck[j];
    deck[j] = temp;
  }

  return deck;
}
