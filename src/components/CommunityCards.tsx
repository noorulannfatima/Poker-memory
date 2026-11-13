import type { CSSProperties } from 'react';
import type { Card } from '../game/gameTypes';
import { CardPlaceholder, PlayingCard } from './PlayingCard';

interface CommunityCardsProps {
  /** Null until the community cards are revealed. */
  cards: readonly Card[] | null;
  count: number;
}

export function CommunityCards({ cards, count }: CommunityCardsProps) {
  return (
    <section aria-labelledby="community-heading" className="felt rounded-2xl px-4 pb-4 pt-3 sm:px-5">
      <div className="mb-2.5 flex items-baseline justify-between gap-3">
        <h2 id="community-heading" className="text-[0.7rem] font-semibold uppercase tracking-[0.18em] text-gold">
          Community cards
        </h2>
        {!cards && <span className="text-xs text-ink/60">Revealed after memorizing</span>}
      </div>
      <ul className="mx-auto grid max-w-[12.5rem] grid-cols-3 gap-2.5 sm:gap-3 lg:max-w-none">
        {Array.from({ length: count }, (_, i) => {
          const card = cards?.[i];
          return (
            <li key={card ? `${card.rank}-${card.suit}` : `empty-${i}`}>
              {card ? (
                <div className="deal-in" style={{ '--deal-delay': `${i * 120}ms` } as CSSProperties}>
                  <PlayingCard card={card} />
                </div>
              ) : (
                <CardPlaceholder />
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
