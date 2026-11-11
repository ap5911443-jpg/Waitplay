import { GameScoreRecord } from "@waitplay/shared";

const STORAGE_KEY = "waitplay_game_history_v1";
const MAX_STORED_RECORDS = 50;

export interface GameSummaryStats {
  totalGames: number;
  totalTimeSeconds: number;
  highScore: number;
  recentScores: GameScoreRecord[];
}

export function loadScores(): GameScoreRecord[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      return parsed;
    }
    return [];
  } catch (err) {
    console.warn("Failed to load scores:", err);
    return [];
  }
}

export function recordScore(score: GameScoreRecord): void {
  try {
    const current = loadScores();
    const updated = [score, ...current].slice(0, MAX_STORED_RECORDS);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
  } catch (err) {
    console.error("Failed to persist score record:", err);
  }
}

export function clearScores(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch (err) {
    console.error("Failed to clear score history:", err);
  }
}

export function getGameStats(): GameSummaryStats {
  const scores = loadScores();
  const totalGames = scores.length;
  const totalTimeSeconds = scores.reduce((sum, s) => sum + s.elapsedSeconds, 0);
  const highScore = scores.reduce((max, s) => Math.max(max, s.score), 0);

  return {
    totalGames,
    totalTimeSeconds,
    highScore,
    recentScores: scores.slice(0, 10),
  };
}
