export type GameCategory = "memory" | "reaction" | "riddle" | "math";

export type GameDifficulty = "easy" | "medium" | "hard";

export interface GameMetadata {
  id: string;
  title: string;
  description: string;
  category: GameCategory;
  isPlayable: boolean;
  minDurationSec: number;
  iconName: string;
}

export interface GameScoreRecord {
  id: string;
  gameId: string;
  gameTitle: string;
  sessionId?: string;
  timestamp: number;
  score: number;
  elapsedSeconds: number;
  difficulty: GameDifficulty;
  accuracyPercent?: number;
  matchedPairs?: number;
  totalTurns?: number;
}

export interface GameStateProps {
  onGameComplete: (score: GameScoreRecord) => void;
  onGameQuit: () => void;
  difficulty: GameDifficulty;
  soundEnabled: boolean;
  isPaused: boolean;
}
