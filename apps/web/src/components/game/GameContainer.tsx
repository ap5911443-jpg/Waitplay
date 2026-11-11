import React from "react";
import { UserPreferences, GameScoreRecord } from "@waitplay/shared";
import { selectActiveGame } from "../../games/registry";

export interface GameContainerProps {
  preferences: UserPreferences;
  isPaused: boolean;
  onGameComplete: (score: GameScoreRecord) => void;
  onGameQuit: () => void;
}

export const GameContainer: React.FC<GameContainerProps> = ({
  preferences,
  isPaused,
  onGameComplete,
  onGameQuit,
}) => {
  const selectedGame = selectActiveGame(preferences);
  const GameComponent = selectedGame.component;

  return (
    <div className="w-full h-full">
      <GameComponent
        difficulty={preferences.difficulty}
        soundEnabled={preferences.soundEnabled}
        isPaused={isPaused}
        onGameComplete={onGameComplete}
        onGameQuit={onGameQuit}
      />
    </div>
  );
};
