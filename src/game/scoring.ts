import { GAME_CONFIG } from './gameConfig';
import type { Card, FinalSelection, Round } from './gameTypes';
import { compareHands, evaluateHand, type EvaluatedHand } from './pokerEvaluator';

export interface Pick {
  /** Two grid positions. */
  readonly positions: readonly [number, number];
  readonly hand: EvaluatedHand;
}

/**
 * Outcome of one player's round.
 * - `complete`: two positions were chosen, so the five-card hand is ranked.
 * - `incomplete`: time ran out with fewer than two picks. There is no
 *   five-card hand, and an incomplete outcome ranks below every complete one.
 */
export type RoundOutcome =
  | {
      readonly kind: 'complete';
      readonly positions: readonly [number, number];
      readonly hand: EvaluatedHand;
      readonly best: Pick;
      /** True when the pick ties the strongest hand the grid allowed. */
      readonly isBest: boolean;
    }
  | {
      readonly kind: 'incomplete';
      readonly positions: readonly number[];
      readonly missing: number;
      readonly best: Pick;
    };

function cardAt(round: Round, position: number): Card {
  const card = round.grid[position];
  if (!card) throw new RangeError(`No grid card at position ${position}.`);
  return card;
}

export function evaluatePick(round: Round, a: number, b: number): EvaluatedHand {
  return evaluateHand([...round.community, cardAt(round, a), cardAt(round, b)]);
}

/** Checks every pair of grid positions and returns the strongest pick. */
export function findBestPick(round: Round): Pick {
  let best: Pick | null = null;
  for (let a = 0; a < round.grid.length; a++) {
    for (let b = a + 1; b < round.grid.length; b++) {
      const hand = evaluatePick(round, a, b);
      if (!best || compareHands(hand, best.hand) > 0) {
        best = { positions: [a, b], hand };
      }
    }
  }
  if (!best) throw new Error('Grid needs at least two cards.');
  return best;
}

export function scoreRound(round: Round, selection: FinalSelection): RoundOutcome {
  const best = findBestPick(round);
  const unique = [...new Set(selection.positions)];
  const [a, b] = unique;
  if (unique.length === GAME_CONFIG.picksRequired && a !== undefined && b !== undefined) {
    const hand = evaluatePick(round, a, b);
    return {
      kind: 'complete',
      positions: [a, b],
      hand,
      best,
      isBest: compareHands(hand, best.hand) === 0,
    };
  }
  return {
    kind: 'incomplete',
    positions: unique,
    missing: GAME_CONFIG.picksRequired - unique.length,
    best,
  };
}

/**
 * Compares two outcomes for future multi-player modes.
 * Positive if `a` wins, negative if `b` wins, 0 for a tie.
 */
export function compareOutcomes(a: RoundOutcome, b: RoundOutcome): number {
  if (a.kind === 'complete' && b.kind === 'complete') return compareHands(a.hand, b.hand);
  if (a.kind === 'complete') return 1;
  if (b.kind === 'complete') return -1;
  return 0;
}
