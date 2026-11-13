/**
 * Every tunable setting for a round lives here. Change the durations here
 * for development or play-testing; the UI reads them from this object.
 */
export const GAME_CONFIG = {
  /** Seconds the grid stays face-up for memorization. */
  memorizeSeconds: 20,
  /** Seconds the player has to choose grid positions. */
  selectSeconds: 30,
  /** Milliseconds spent flipping the grid face-up before showing results. */
  revealMs: 1400,
  /** Grid dimensions (4 × 4 = 16 cards). */
  gridColumns: 4,
  gridRows: 4,
  /** Number of community cards revealed after memorization. */
  communityCount: 3,
  /** Number of grid positions the player must choose. */
  picksRequired: 2,
} as const;

export type GameConfig = typeof GAME_CONFIG;

export const GRID_SIZE = GAME_CONFIG.gridColumns * GAME_CONFIG.gridRows;
