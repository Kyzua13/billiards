import { DEFAULT_TABLE, rackBalls } from "./physics.ts";
import type { GameState } from "./types.ts";

export function createInitialGame(): GameState {
  return {
    phase: "lobby",
    table: DEFAULT_TABLE,
    balls: rackBalls(),
    currentTurnSeat: "A1",
    shotInProgress: false,
    ruleState: {
      teamGroups: {},
      lastPocketed: [],
      scratch: false,
      message: "Waiting for players"
    }
  };
}
