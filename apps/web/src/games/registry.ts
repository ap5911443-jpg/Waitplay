import { RegisteredGame } from "./types";
import { MemoryGame } from "./memory/MemoryGame";
import { ReactionTestPlaceholder } from "./placeholders/ReactionTestPlaceholder";
import { RiddleChallengePlaceholder } from "./placeholders/RiddleChallengePlaceholder";
import { MathSprintPlaceholder } from "./placeholders/MathSprintPlaceholder";
import { UserPreferences } from "@waitplay/shared";

export const GAMES_REGISTRY: Record<string, RegisteredGame> = {
  "memory-match": {
    metadata: {
      id: "memory-match",
      title: "Memory Match",
      description: "Match pairs of coding icons and tech symbols before Claude finishes.",
      category: "memory",
      isPlayable: true,
      minDurationSec: 15,
      iconName: "Layers",
    },
    component: MemoryGame,
  },
  "reaction-test": {
    metadata: {
      id: "reaction-test",
      title: "Reaction Test",
      description: "Test your raw click response time when prompt execution begins.",
      category: "reaction",
      isPlayable: false,
      minDurationSec: 5,
      iconName: "Zap",
    },
    component: ReactionTestPlaceholder,
  },
  "riddle-challenge": {
    metadata: {
      id: "riddle-challenge",
      title: "Riddle Challenge",
      description: "Puzzles and logic riddles while the agent writes code.",
      category: "riddle",
      isPlayable: false,
      minDurationSec: 30,
      iconName: "HelpCircle",
    },
    component: RiddleChallengePlaceholder,
  },
  "math-sprint": {
    metadata: {
      id: "math-sprint",
      title: "Math Sprint",
      description: "Rapid arithmetic & binary arithmetic calculations against the clock.",
      category: "math",
      isPlayable: false,
      minDurationSec: 20,
      iconName: "Calculator",
    },
    component: MathSprintPlaceholder,
  },
};

export function getAllGames(): RegisteredGame[] {
  return Object.values(GAMES_REGISTRY);
}

export function getPlayableGames(): RegisteredGame[] {
  return Object.values(GAMES_REGISTRY).filter((g) => g.metadata.isPlayable);
}

export function selectActiveGame(_prefs: UserPreferences): RegisteredGame {
  // Filter only playable games. Placeholders must never be randomly selected!
  const playable = getPlayableGames();
  if (playable.length === 0) {
    return GAMES_REGISTRY["memory-match"];
  }

  // Filter playable games that match user preferred categories if any match
  const matchingCategory = playable.filter((g) =>
    _prefs.preferredCategories.includes(g.metadata.category)
  );

  if (matchingCategory.length > 0) {
    const randomIndex = Math.floor(Math.random() * matchingCategory.length);
    return matchingCategory[randomIndex];
  }

  return playable[0];
}
