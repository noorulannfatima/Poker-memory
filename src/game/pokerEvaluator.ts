import { rankLabel, rankName, rankNamePlural } from './cardFormat';
import type { Card, Rank } from './gameTypes';

/**
 * Standalone five-card poker hand evaluator.
 *
 * Evaluates exactly five cards (no 7-card best-five selection). Hands are
 * compared by category strength first, then by a tiebreak vector of rank
 * values, so the result never depends on the input order of the cards.
 */

export type HandCategory =
  | 'high-card'
  | 'pair'
  | 'two-pair'
  | 'three-of-a-kind'
  | 'straight'
  | 'flush'
  | 'full-house'
  | 'four-of-a-kind'
  | 'straight-flush'
  | 'royal-flush';

/** Higher is stronger. A royal flush is the ace-high straight flush. */
export const CATEGORY_STRENGTH: Record<HandCategory, number> = {
  'high-card': 0,
  pair: 1,
  'two-pair': 2,
  'three-of-a-kind': 3,
  straight: 4,
  flush: 5,
  'full-house': 6,
  'four-of-a-kind': 7,
  'straight-flush': 8,
  'royal-flush': 9,
};

export const CATEGORY_LABEL: Record<HandCategory, string> = {
  'high-card': 'High Card',
  pair: 'Pair',
  'two-pair': 'Two Pair',
  'three-of-a-kind': 'Three of a Kind',
  straight: 'Straight',
  flush: 'Flush',
  'full-house': 'Full House',
  'four-of-a-kind': 'Four of a Kind',
  'straight-flush': 'Straight Flush',
  'royal-flush': 'Royal Flush',
};

export interface EvaluatedHand {
  readonly category: HandCategory;
  readonly label: string;
  readonly strength: number;
  /** Rank values compared lexicographically to break ties within a category. */
  readonly tiebreak: readonly number[];
  /** The five cards ordered by significance (e.g. pair first, then kickers). */
  readonly cards: readonly Card[];
  /** Human-readable explanation, e.g. "Pair of Kings with A, 9, 4 kickers". */
  readonly description: string;
}

export class InvalidHandError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InvalidHandError';
  }
}

interface RankGroup {
  rank: Rank;
  cards: Card[];
}

function validate(cards: readonly Card[]): void {
  if (cards.length !== 5) {
    throw new InvalidHandError(`Expected exactly 5 cards, received ${cards.length}.`);
  }
  const seen = new Set<string>();
  for (const card of cards) {
    const key = `${card.rank}-${card.suit}`;
    if (seen.has(key)) {
      throw new InvalidHandError(`Duplicate card in hand: ${key}.`);
    }
    seen.add(key);
  }
}

/** Groups cards by rank, ordered by group size desc, then rank desc. */
function groupByRank(cards: readonly Card[]): RankGroup[] {
  const map = new Map<Rank, Card[]>();
  for (const card of cards) {
    const list = map.get(card.rank);
    if (list) list.push(card);
    else map.set(card.rank, [card]);
  }
  return [...map.entries()]
    .map(([rank, groupCards]) => ({ rank, cards: groupCards }))
    .sort((a, b) => b.cards.length - a.cards.length || b.rank - a.rank);
}

/** Returns the straight's high card (5 for the A-2-3-4-5 wheel), or null. */
function straightHigh(ranksDesc: readonly Rank[]): Rank | null {
  if (new Set(ranksDesc).size !== 5) return null;
  const [hi, , , , lo] = ranksDesc as [Rank, Rank, Rank, Rank, Rank];
  if (hi - lo === 4) return hi;
  // Wheel: ace plays low.
  if (hi === 14 && ranksDesc[1] === 5 && lo === 2) return 5;
  return null;
}

/** "a Nine", "an Ace", "an Eight". */
function withArticle(rank: Rank): string {
  const name = rankName(rank);
  return /^[AEIOU]/.test(name) ? `an ${name}` : `a ${name}`;
}

function kickerList(ranks: readonly Rank[]): string {
  return ranks.map(rankLabel).join(', ');
}

function make(
  category: HandCategory,
  tiebreak: number[],
  cards: Card[],
  description: string,
): EvaluatedHand {
  return {
    category,
    label: CATEGORY_LABEL[category],
    strength: CATEGORY_STRENGTH[category],
    tiebreak,
    cards,
    description,
  };
}

/** Evaluates exactly five distinct cards. Throws InvalidHandError otherwise. */
export function evaluateHand(input: readonly Card[]): EvaluatedHand {
  validate(input);

  const groups = groupByRank(input);
  const ordered = groups.flatMap((g) => g.cards);
  const ranksDesc = input.map((c) => c.rank).sort((a, b) => b - a);
  const isFlush = input.every((c) => c.suit === input[0]?.suit);
  const high = straightHigh(ranksDesc);
  const shape = groups.map((g) => g.cards.length).join('');
  const r = groups.map((g) => g.rank);

  if (high !== null) {
    // For the wheel, display the ace last: 5-4-3-2-A.
    const straightCards =
      high === 5 ? [...ordered.filter((c) => c.rank !== 14), ...ordered.filter((c) => c.rank === 14)] : ordered;
    if (isFlush) {
      const suit = input[0]?.suit ?? '';
      if (high === 14) {
        return make('royal-flush', [14], straightCards, `A, K, Q, J, 10 all in ${suit} — the best hand in poker.`);
      }
      const wheel = high === 5 ? ' (the steel wheel, ace playing low)' : '';
      return make('straight-flush', [high], straightCards, `${rankName(high)}-high straight flush in ${suit}${wheel}.`);
    }
    const wheel = high === 5 ? ' — the wheel, A-2-3-4-5 with the ace playing low' : '';
    return make('straight', [high], straightCards, `${rankName(high)}-high straight${wheel}.`);
  }

  if (isFlush) {
    return make(
      'flush',
      ranksDesc,
      ordered,
      `${rankName(ranksDesc[0] as Rank)}-high flush in ${input[0]?.suit} (${kickerList(ranksDesc)}).`,
    );
  }

  const [r0, r1, r2] = r as [Rank, Rank, Rank];

  switch (shape) {
    case '41':
      return make('four-of-a-kind', r, ordered, `Four ${rankNamePlural(r0)} with ${withArticle(r1)} kicker.`);
    case '32':
      return make('full-house', r, ordered, `${rankNamePlural(r0)} full of ${rankNamePlural(r1)}.`);
    case '311':
      return make('three-of-a-kind', r, ordered, `Three ${rankNamePlural(r0)} with ${kickerList(r.slice(1))} kickers.`);
    case '221':
      return make('two-pair', r, ordered, `${rankNamePlural(r0)} and ${rankNamePlural(r1)} with ${withArticle(r2)} kicker.`);
    case '2111':
      return make('pair', r, ordered, `Pair of ${rankNamePlural(r0)} with ${kickerList(r.slice(1))} kickers.`);
    default:
      return make('high-card', ranksDesc, ordered, `${rankName(r0)} high with ${kickerList(ranksDesc.slice(1))}.`);
  }
}

/**
 * Compares two evaluated hands.
 * Returns a positive number if `a` wins, negative if `b` wins, 0 for a tie.
 */
export function compareHands(a: EvaluatedHand, b: EvaluatedHand): number {
  if (a.strength !== b.strength) return Math.sign(a.strength - b.strength);
  const len = Math.max(a.tiebreak.length, b.tiebreak.length);
  for (let i = 0; i < len; i++) {
    const diff = (a.tiebreak[i] ?? 0) - (b.tiebreak[i] ?? 0);
    if (diff !== 0) return Math.sign(diff);
  }
  return 0;
}

/** Convenience: evaluates and compares two raw five-card hands. */
export function compareCards(a: readonly Card[], b: readonly Card[]): number {
  return compareHands(evaluateHand(a), evaluateHand(b));
}
