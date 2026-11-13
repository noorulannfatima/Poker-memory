import type { DifficultySettings } from './gameConfig';

/**
 * Core domain types. Everything in `src/game` is framework-agnostic so the
 * same rules can later run on a server or drive a multiplayer client.
 */

export const SUITS = ['spades', 'hearts', 'diamonds', 'clubs'] as const;
export type Suit = (typeof SUITS)[number];

/** Rank values: 2–10 numeric, 11 = Jack, 12 = Queen, 13 = King, 14 = Ace. */
export const RANKS = [2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14] as const;
export type Rank = (typeof RANKS)[number];

export interface Card {
  readonly rank: Rank;
  readonly suit: Suit;
}

/** A random source returning a float in [0, 1), like Math.random. */
export type RandomFn = () => number;

export interface Round {
  /** Monotonic id used to ignore stale timer events from earlier rounds. */
  readonly id: number;
  /** The difficulty this round was dealt at (grid shape and timings). */
  readonly settings: DifficultySettings;
  /** Face-down grid cards, indexed by grid position (row-major). */
  readonly grid: readonly Card[];
  /** 3 community cards, distinct from the grid. */
  readonly community: readonly Card[];
}

export type FinalizeReason = 'submitted' | 'timeout';

export interface FinalSelection {
  /** Chosen grid positions in the order they were picked (0–2 entries). */
  readonly positions: readonly number[];
  readonly reason: FinalizeReason;
}
