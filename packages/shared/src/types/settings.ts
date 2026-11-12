import { GameCategory, GameDifficulty } from "./game.js";

export type DisplayMode = "compact" | "fullscreen";

export interface UserPreferences {
  displayMode: DisplayMode;
  preferredCategories: GameCategory[];
  difficulty: GameDifficulty;
  autoLaunch: boolean;
  companionEnabled?: boolean;
  startDelaySeconds: number; // default 4
  resultsDurationSeconds: number; // default 6
  soundEnabled: boolean;
  pauseOnInputRequired: boolean;
  theme: "dark" | "light";
}

export const DEFAULT_PREFERENCES: UserPreferences = {
  displayMode: "compact",
  preferredCategories: ["memory"],
  difficulty: "medium",
  autoLaunch: true,
  companionEnabled: true,
  startDelaySeconds: 4,
  resultsDurationSeconds: 6,
  soundEnabled: true,
  pauseOnInputRequired: true,
  theme: "dark",
};
