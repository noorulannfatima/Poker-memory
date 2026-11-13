import type { Card, Rank, Suit } from '../game/gameTypes';

const RANK_CHARS: Record<string, Rank> = {
  '2': 2, '3': 3, '4': 4, '5': 5, '6': 6, '7': 7, '8': 8, '9': 9,
  T: 10, '10': 10, J: 11, Q: 12, K: 13, A: 14,
};
const SUIT_CHARS: Record<string, Suit> = { s: 'spades', h: 'hearts', d: 'diamonds', c: 'clubs' };

/** Parses "As" / "Td" / "10h" into a Card. Test helper only. */
export function c(text: string): Card {
  const rank = RANK_CHARS[text.slice(0, -1)];
  const suit = SUIT_CHARS[text.slice(-1)];
  if (rank === undefined || suit === undefined) throw new Error(`Bad card: ${text}`);
  return { rank, suit };
}

/** Parses a space-separated list of cards: "As Ks Qs Js Ts". */
export function hand(text: string): Card[] {
  return text.trim().split(/\s+/).map(c);
}
