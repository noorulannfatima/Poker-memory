import type { Card, Rank, Suit } from './gameTypes';

const RANK_LABELS: Record<Rank, string> = {
  2: '2', 3: '3', 4: '4', 5: '5', 6: '6', 7: '7', 8: '8', 9: '9', 10: '10',
  11: 'J', 12: 'Q', 13: 'K', 14: 'A',
};

const RANK_NAMES: Record<Rank, string> = {
  2: 'Two', 3: 'Three', 4: 'Four', 5: 'Five', 6: 'Six', 7: 'Seven', 8: 'Eight',
  9: 'Nine', 10: 'Ten', 11: 'Jack', 12: 'Queen', 13: 'King', 14: 'Ace',
};

const SUIT_SYMBOLS: Record<Suit, string> = {
  spades: '♠', hearts: '♥', diamonds: '♦', clubs: '♣',
};

/** Short rank label for a card face: "A", "10", "7". */
export function rankLabel(rank: Rank): string {
  return RANK_LABELS[rank];
}

/** Rank as a word: "Ace", "Ten". */
export function rankName(rank: Rank): string {
  return RANK_NAMES[rank];
}

/** Plural rank word: "Aces", "Sixes". */
export function rankNamePlural(rank: Rank): string {
  const name = RANK_NAMES[rank];
  return name.endsWith('x') ? `${name}es` : `${name}s`;
}

export function suitSymbol(suit: Suit): string {
  return SUIT_SYMBOLS[suit];
}

export function isRedSuit(suit: Suit): boolean {
  return suit === 'hearts' || suit === 'diamonds';
}

/** Compact text form, e.g. "A♠", "10♥". */
export function cardShort(card: Card): string {
  return `${rankLabel(card.rank)}${suitSymbol(card.suit)}`;
}

/** Spoken form for screen readers, e.g. "Ace of spades". */
export function cardLongName(card: Card): string {
  return `${rankName(card.rank)} of ${card.suit}`;
}

/** Short text for the cards at some grid positions, e.g. "A♠ + 10♥". */
export function describePositions(grid: readonly Card[], positions: readonly number[]): string {
  return positions
    .map((p) => grid[p])
    .filter((card): card is Card => card !== undefined)
    .map(cardShort)
    .join(' + ');
}
