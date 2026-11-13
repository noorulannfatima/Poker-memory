import { cardShort, isRedSuit } from '../game/cardFormat';
import type { Card } from '../game/gameTypes';

interface HandCardsProps {
  cards: readonly Card[];
  /** Cards that came from the grid (the player's picks) rather than the board. */
  picked: ReadonlySet<Card>;
  label: string;
  /** Accent for the picked cards: gold for you, blue for an opponent. */
  accent?: 'gold' | 'rival';
}

/** A compact row of the five cards in a hand, each tagged Pick or Board. */
export function HandCards({ cards, picked, label, accent = 'gold' }: HandCardsProps) {
  const pickStyle = accent === 'gold' ? 'bg-gold/15 ring-1 ring-gold/60' : 'bg-rival/15 ring-1 ring-rival/60';
  const pickText = accent === 'gold' ? 'text-gold' : 'text-rival';
  return (
    <ul className="mt-3 flex flex-wrap gap-1" aria-label={label}>
      {cards.map((card) => {
        const isPick = picked.has(card);
        return (
          <li
            key={`${card.rank}${card.suit}`}
            className={`flex flex-col items-center gap-1 rounded-lg px-1.5 pb-1 pt-1.5 ${isPick ? pickStyle : ''}`}
          >
            <span
              className={`grid h-11 w-8.5 place-items-center rounded-md bg-card font-display text-[0.95rem] font-bold leading-none shadow ${
                isRedSuit(card.suit) ? 'text-card-red' : 'text-card-black'
              }`}
            >
              {cardShort(card)}
            </span>
            <span className={`text-[0.6rem] font-semibold uppercase tracking-wider ${isPick ? pickText : 'text-subtle'}`}>
              {isPick ? 'Pick' : 'Board'}
            </span>
          </li>
        );
      })}
    </ul>
  );
}
