/**
 * Every tunable setting lives here. Change the values here for development
 * or play-testing; the engine and UI read them from these objects.
 */

/** Settings shared by every difficulty level. */
export const GAME_CONFIG = {
  /** Milliseconds spent flipping the grid face-up before showing results. */
  revealMs: 1400,
  /** Number of community cards revealed after memorization. */
  communityCount: 3,
  /** Number of grid positions the player must choose. */
  picksRequired: 2,
} as const;

export type Difficulty = 'easy' | 'medium' | 'difficult';

export interface DifficultySettings {
  readonly id: Difficulty;
  readonly label: string;
  /** One-line summary shown in the lobby. */
  readonly summary: string;
  /** Seconds the grid stays face-up for memorization. */
  readonly memorizeSeconds: number;
  /** Seconds the player has to choose grid positions. */
  readonly selectSeconds: number;
  readonly gridColumns: number;
  readonly gridRows: number;
  /**
   * Computer opponent: chance (0–1) that it remembers each grid card
   * correctly. Otherwise it forgets the card or confuses it with another.
   */
  readonly computerMemory: number;
}

export const DIFFICULTIES: Readonly<Record<Difficulty, DifficultySettings>> = {
  easy: {
    id: 'easy',
    label: 'Easy',
    summary: 'A smaller grid with more time to memorize and to choose.',
    memorizeSeconds: 30,
    selectSeconds: 45,
    gridColumns: 3,
    gridRows: 3,
    computerMemory: 0.5,
  },
  medium: {
    id: 'medium',
    label: 'Medium',
    summary: 'The standard game.',
    memorizeSeconds: 20,
    selectSeconds: 30,
    gridColumns: 4,
    gridRows: 4,
    computerMemory: 0.75,
  },
  difficult: {
    id: 'difficult',
    label: 'Difficult',
    summary: 'A bigger grid with less time to memorize and to choose.',
    memorizeSeconds: 15,
    selectSeconds: 20,
    gridColumns: 5,
    gridRows: 4,
    computerMemory: 0.92,
  },
};

export const DIFFICULTY_ORDER: readonly Difficulty[] = ['easy', 'medium', 'difficult'];

export const DEFAULT_DIFFICULTY: Difficulty = 'medium';

export function gridSize(settings: DifficultySettings): number {
  return settings.gridColumns * settings.gridRows;
}

export function isDifficulty(value: unknown): value is Difficulty {
  return typeof value === 'string' && (DIFFICULTY_ORDER as readonly string[]).includes(value);
}

/** Who you play against. Two players on one device and online play are planned. */
export type GameMode = 'solo' | 'computer';

export const GAME_MODES: ReadonlyArray<{ readonly id: GameMode; readonly label: string; readonly summary: string }> = [
  { id: 'solo', label: 'Solo', summary: 'Find the best hand you can.' },
  { id: 'computer', label: 'Vs computer', summary: 'Same grid, secret picks. Best hand wins.' },
];

export const DEFAULT_MODE: GameMode = 'solo';

export function isGameMode(value: unknown): value is GameMode {
  return value === 'solo' || value === 'computer';
}

/** How the lobby describes the computer's memory at a level. */
export function describeComputerMemory(settings: DifficultySettings): string {
  if (settings.computerMemory >= 0.9) return 'The computer remembers almost every card.';
  if (settings.computerMemory >= 0.7) return 'The computer remembers most cards.';
  return 'The computer often forgets or mixes up cards.';
}
