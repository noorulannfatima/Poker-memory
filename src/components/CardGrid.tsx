import type { CSSProperties } from 'react';
import { cardLongName } from '../game/cardFormat';
import { GAME_CONFIG } from '../game/gameConfig';
import type { GameState } from '../game/gameReducer';
import { isGridFaceUp, selectedPositions } from '../game/gameReducer';
import { PlayingCard } from './PlayingCard';

interface CardGridProps {
  state: Exclude<GameState, { phase: 'lobby' }>;
  onToggle: (position: number) => void;
}

export function CardGrid({ state, onToggle }: CardGridProps) {
  const { gridColumns, gridRows } = state.round.settings;
  const faceUp = isGridFaceUp(state);
  const selected = selectedPositions(state);
  const canSelect = state.phase === 'selecting';
  const isFull = selected.length >= GAME_CONFIG.picksRequired;
  const results = state.phase === 'results' ? state.outcome : null;
  const bestPositions: readonly number[] =
    results && !(results.kind === 'complete' && results.isBest) ? results.best.positions : [];

  return (
    <div
      role="group"
      aria-label="Card grid"
      className="card-grid mx-auto grid gap-2.5 sm:gap-3.5"
      style={
        {
          gridTemplateColumns: `repeat(${gridColumns}, minmax(0, 1fr))`,
          '--grid-cols': gridColumns,
          '--grid-rows': gridRows,
        } as CSSProperties
      }
    >
      {state.round.grid.map((card, position) => {
        const pickIndex = selected.indexOf(position);
        const isSelected = pickIndex !== -1;
        const selectable = canSelect && (isSelected || !isFull);
        const isBest = bestPositions.includes(position);
        const dimmed = state.phase === 'results' && !isSelected && !isBest;
        const row = Math.floor(position / gridColumns) + 1;
        const col = (position % gridColumns) + 1;
        const where = `Row ${row}, column ${col}`;
        const label = faceUp
          ? `${where}: ${cardLongName(card)}${isSelected ? ', your pick' : ''}`
          : `${where}: face-down card`;

        return (
          <button
            // A new key per round re-deals the cards with a fresh animation.
            key={`${state.round.id}-${position}`}
            type="button"
            className="grid-slot"
            aria-label={label}
            aria-pressed={canSelect ? isSelected : undefined}
            disabled={!canSelect}
            data-selectable={selectable}
            data-selected={isSelected}
            data-dimmed={dimmed}
            data-best={isBest}
            data-testid={`grid-slot-${position}`}
            onClick={() => onToggle(position)}
          >
            <div className="deal-in" style={{ '--deal-delay': `${position * 35}ms` } as CSSProperties}>
              <PlayingCard
                card={faceUp ? card : null}
                flipDelayMs={state.phase === 'revealing' ? position * 45 : 0}
              />
            </div>
            {isSelected && (
              <span className="chip" aria-hidden="true">
                {pickIndex + 1}
              </span>
            )}
            {isBest && <span className="best-tag" aria-hidden="true">Best</span>}
          </button>
        );
      })}
    </div>
  );
}
