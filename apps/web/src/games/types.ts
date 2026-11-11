import React from "react";
import { GameMetadata, GameStateProps } from "@waitplay/shared";

export interface RegisteredGame {
  metadata: GameMetadata;
  component: React.ComponentType<GameStateProps>;
}
