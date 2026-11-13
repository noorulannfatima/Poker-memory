import { useEffect, useState, type CSSProperties } from 'react';
import { cardLongName, isRedSuit, rankLabel, suitSymbol } from '../game/cardFormat';
import type { Card } from '../game/gameTypes';

/** Must match --flip-ms in styles/index.css. */
const FLIP_MS = 520;

interface PlayingCardProps {
  /**
   * The card to show face-up, or null to show the back. Hidden cards are
   * passed as null so their values never reach the DOM.
   */
  card: Card | null;
  /** Extra delay before the flip animation starts (for staggered reveals). */
  flipDelayMs?: number;
  className?: string;
}

/**
 * A crisp HTML/CSS playing card with a 3D flip between face and back.
 * Card faces scale with container-query units, so they stay sharp at any size.
 */
export function PlayingCard({ card, flipDelayMs = 0, className = '' }: PlayingCardProps) {
  // Keep the last face briefly after flipping down so the flip animates
  // smoothly, then drop it from the DOM entirely.
  const [shown, setShown] = useState<Card | null>(card);
  const [prevCard, setPrevCard] = useState<Card | null>(card);
  if (card !== prevCard) {
    setPrevCard(card);
    if (card) setShown(card);
  }

  useEffect(() => {
    if (card || !shown) return;
    const id = setTimeout(() => setShown(null), FLIP_MS + flipDelayMs);
    return () => clearTimeout(id);
  }, [card, shown, flipDelayMs]);

  const style = { '--flip-delay': `${flipDelayMs}ms` } as CSSProperties;

  return (
    <div className={`playing-card ${className}`} data-face={card ? 'up' : 'down'} style={style}>
      <div className="playing-card__inner">
        <div className="playing-card__face" data-red={shown ? isRedSuit(shown.suit) : undefined}>
          {shown && <CardFace card={shown} />}
        </div>
        <div className="playing-card__back" />
      </div>
    </div>
  );
}

function CardFace({ card }: { card: Card }) {
  const rank = rankLabel(card.rank);
  const suit = suitSymbol(card.suit);
  const court = card.rank >= 11;
  return (
    <>
      <span className="sr-only">{cardLongName(card)}</span>
      <div aria-hidden="true">
        <div className="playing-card__corner playing-card__corner--tl">
          <span className="playing-card__corner-rank">{rank}</span>
          <span className="playing-card__corner-suit">{suit}</span>
        </div>
        <div className={`playing-card__pip ${court ? 'playing-card__pip--court' : ''}`}>{court ? rank : suit}</div>
        <div className="playing-card__corner playing-card__corner--br">
          <span className="playing-card__corner-rank">{rank}</span>
          <span className="playing-card__corner-suit">{suit}</span>
        </div>
      </div>
    </>
  );
}

/** Empty dashed slot for a card that has not been revealed yet. */
export function CardPlaceholder({ label = '?' }: { label?: string }) {
  return (
    <div className="playing-card">
      <div className="playing-card--placeholder absolute inset-0" aria-hidden="true">
        {label}
      </div>
    </div>
  );
}
