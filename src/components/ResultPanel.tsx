import { useEffect, useRef } from 'react';
import { cardShort, isRedSuit } from '../game/cardFormat';
import { GAME_CONFIG } from '../game/gameConfig';
import type { Card, FinalSelection, Round } from '../game/gameTypes';
import type { RoundOutcome } from '../game/scoring';

interface ResultPanelProps {
  round: Round;
  selection: FinalSelection;
  outcome: RoundOutcome;
  onPlayAgain: () => void;
  onLobby: () => void;
}

function CardChip({ card, picked }: { card: Card; picked?: boolean }) {
  return (
    <li
      className={`flex flex-col items-center gap-1 rounded-lg px-1.5 pb-1 pt-1.5 ${picked ? 'bg-gold/15 ring-1 ring-gold/60' : ''}`}
    >
      <span
        className={`grid h-11 w-8.5 place-items-center rounded-md bg-card font-display text-[0.95rem] font-bold leading-none shadow ${
          isRedSuit(card.suit) ? 'text-card-red' : 'text-card-black'
        }`}
      >
        {cardShort(card)}
      </span>
      <span className={`text-[0.6rem] font-semibold uppercase tracking-wider ${picked ? 'text-gold' : 'text-subtle'}`}>
        {picked ? 'Pick' : 'Board'}
      </span>
    </li>
  );
}

const describePair = (round: Round, positions: readonly number[]) =>
  positions
    .map((p) => round.grid[p])
    .filter((c): c is Card => c !== undefined)
    .map(cardShort)
    .join(' + ');

export function ResultPanel({ round, selection, outcome, onPlayAgain, onLobby }: ResultPanelProps) {
  const headingRef = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    headingRef.current?.focus();
  }, []);

  const picked = new Set(selection.positions.map((p) => round.grid[p]));
  const timedOut = selection.reason === 'timeout';
  const best = outcome.best;

  return (
    <section className="fade-up rounded-2xl border border-line bg-charcoal/80 p-5" aria-labelledby="result-heading">
      <p className="text-[0.7rem] font-semibold uppercase tracking-[0.18em] text-gold">
        {timedOut ? "Time's up · Your hand" : 'Your hand'}
      </p>

      {outcome.kind === 'complete' ? (
        <>
          <h2
            id="result-heading"
            ref={headingRef}
            tabIndex={-1}
            className="mt-1 font-display text-[2rem] font-semibold leading-tight text-gold-bright outline-none"
          >
            {outcome.hand.label}
          </h2>
          <p className="mt-1 text-ink/85">{outcome.hand.description}</p>
          <ul className="mt-4 flex flex-wrap gap-1" aria-label="Your five-card hand">
            {outcome.hand.cards.map((card) => (
              <CardChip key={`${card.rank}${card.suit}`} card={card} picked={picked.has(card)} />
            ))}
          </ul>
          {timedOut && (
            <p className="mt-3 text-sm text-muted">The timer ran out, so your two picks were locked in automatically.</p>
          )}
        </>
      ) : (
        <>
          <h2
            id="result-heading"
            ref={headingRef}
            tabIndex={-1}
            className="mt-1 font-display text-[2rem] font-semibold leading-tight text-alert outline-none"
          >
            Incomplete hand
          </h2>
          <p className="mt-1 text-ink/85">
            Time ran out with {outcome.positions.length} of {GAME_CONFIG.picksRequired} cards chosen
            {outcome.positions.length > 0 ? ` (${describePair(round, outcome.positions)})` : ''}. A poker hand
            needs exactly five cards, so this round has no hand.
          </p>
        </>
      )}

      <div className="mt-5 border-t border-line pt-4 text-sm leading-relaxed">
        {outcome.kind === 'complete' && outcome.isBest ? (
          <p className="text-[#8fe0b5]">
            <strong className="font-semibold">Perfect read.</strong> No other two cards on the grid beat this
            hand.
          </p>
        ) : (
          <p className="text-ink/80">
            <span className="font-semibold text-[#8fe0b5]">Best possible: {best.hand.label}</span> with{' '}
            {describePair(round, best.positions)}. {best.hand.description}{' '}
            <span className="text-subtle">(Marked “Best” on the grid.)</span>
          </p>
        )}
      </div>

      <div className="mt-5 flex flex-col gap-2.5 sm:flex-row lg:flex-col">
        <button
          type="button"
          onClick={onPlayAgain}
          className="flex-1 rounded-xl bg-gold px-5 py-3.5 font-semibold text-night shadow-[0_8px_24px_-10px_rgb(216_180_106/0.7)] transition hover:bg-gold-bright active:translate-y-px"
        >
          Play again
        </button>
        <button
          type="button"
          onClick={onLobby}
          className="flex-1 rounded-xl border border-line px-5 py-3.5 font-semibold text-ink/90 transition hover:border-gold/50 hover:text-ink"
        >
          Back to lobby
        </button>
      </div>
    </section>
  );
}
