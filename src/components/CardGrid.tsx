import type { CSSProperties } from 'react';
import { cardLongName } from '../game/cardFormat';
import { GAME_CONFIG } from '../game/gameConfig';
import type { Card } from '../game/gameTypes';
import { PlayingCard } from './PlayingCard';

export interface RevealedOpponentPicks {
  readonly name: string;
  readonly picks: readonly number[];
}

interface CardGridProps {
  /** Changing the round id re-deals the cards with a fresh animation. */
  roundId: number;
  /** Grid cards in row-major order; null means face-down (value hidden). */
  cards: readonly (Card | null)[];
  columns: number;
  rows: number;
  /** This player's picks, shown with numbered chips. */
  selected: readonly number[];
  /** How a picked card is announced, e.g. "Ana's pick". */
  selectedLabel?: string;
  /** Whether taps select cards right now. */
  selectable: boolean;
  /** Stagger the flip while the grid is being revealed. */
  revealing?: boolean;
  /** An opponent's picks, only once they have been revealed. */
  opponent?: RevealedOpponentPicks | null;
  /** Positions of the best possible pick, highlighted in results. */
  bestPositions?: readonly number[];
  /** Dim every card that nobody picked (results). */
  dimOthers?: boolean;
  onToggle: (position: number) => void;
}

export function CardGrid({
  roundId,
  cards,
  columns,
  rows,
  selected,
  selectedLabel = 'your pick',
  selectable,
  revealing = false,
  opponent = null,
  bestPositions = [],
  dimOthers = false,
  onToggle,
}: CardGridProps) {
  const isFull = selected.length >= GAME_CONFIG.picksRequired;
  const opponentInitial = opponent?.name.charAt(0).toUpperCase() ?? '';

  return (
    <div
      role="group"
      aria-label="Card grid"
      className="card-grid mx-auto grid gap-2.5 sm:gap-3.5"
      style={
        {
          gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))`,
          '--grid-cols': columns,
          '--grid-rows': rows,
        } as CSSProperties
      }
    >
      {cards.map((card, position) => {
        const pickIndex = selected.indexOf(position);
        const isSelected = pickIndex !== -1;
        const byOpponent = opponent?.picks.includes(position) ?? false;
        const tappable = selectable && (isSelected || !isFull);
        const isBest = bestPositions.includes(position);
        const dimmed = dimOthers && !isSelected && !byOpponent && !isBest;
        const row = Math.floor(position / columns) + 1;
        const col = (position % columns) + 1;
        const where = `Row ${row}, column ${col}`;
        const label = card
          ? `${where}: ${cardLongName(card)}${isSelected ? `, ${selectedLabel}` : ''}${
              byOpponent && opponent ? `, ${opponent.name}'s pick` : ''
            }`
          : `${where}: face-down card`;

        return (
          <button
            key={`${roundId}-${position}`}
            type="button"
            className="grid-slot"
            aria-label={label}
            aria-pressed={selectable ? isSelected : undefined}
            disabled={!selectable}
            data-selectable={tappable}
            data-selected={isSelected}
            data-opponent={byOpponent}
            data-dimmed={dimmed}
            data-best={isBest}
            data-testid={`grid-slot-${position}`}
            onClick={() => onToggle(position)}
          >
            <div className="deal-in" style={{ '--deal-delay': `${position * 35}ms` } as CSSProperties}>
              <PlayingCard card={card} flipDelayMs={revealing ? position * 45 : 0} />
            </div>
            {byOpponent && <span className="opponent-ring" aria-hidden="true" />}
            {isSelected && (
              <span className="chip" aria-hidden="true">
                {pickIndex + 1}
              </span>
            )}
            {byOpponent && (
              <span className="chip chip--opponent" aria-hidden="true">
                {opponentInitial}
              </span>
            )}
            {isBest && <span className="best-tag" aria-hidden="true">Best</span>}
          </button>
        );
      })}
    </div>
  );
}
