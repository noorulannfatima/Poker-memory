import { useEffect, useRef } from 'react';
import { describePositions } from '../game/cardFormat';
import { GAME_CONFIG } from '../game/gameConfig';
import type { Card } from '../game/gameTypes';
import type { MatchPlayer, MatchResultsView, PlayerId } from '../game/match';
import { HandCards } from './HandCards';

interface MatchResultPanelProps {
  me: PlayerId;
  players: readonly MatchPlayer[];
  /** The revealed grid (all cards face-up in results). */
  grid: readonly Card[];
  results: MatchResultsView;
  onNextRound: () => void;
  onLeave: () => void;
}

export function MatchResultPanel({ me, players, grid, results, onNextRound, onLeave }: MatchResultPanelProps) {
  const headingRef = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    headingRef.current?.focus();
  }, []);

  const winner = players.find((p) => p.id === results.winner);
  const banner = !winner ? "It's a tie" : winner.id === me ? 'You win the round' : `${winner.name} wins the round`;
  const bannerColor = !winner ? 'text-ink' : winner.id === me ? 'text-gold-bright' : 'text-rival';
  // Show this player's hand first.
  const ordered = [...players].sort((a, b) => Number(b.id === me) - Number(a.id === me));
  const best = results.outcomes[me]?.best;
  const anyoneFoundBest = Object.values(results.outcomes).some((o) => o.kind === 'complete' && o.isBest);

  return (
    <section className="fade-up rounded-2xl border border-line bg-charcoal/80 p-5" aria-labelledby="result-heading">
      <p className="text-[0.7rem] font-semibold uppercase tracking-[0.18em] text-gold">Round result</p>
      <h2
        id="result-heading"
        ref={headingRef}
        tabIndex={-1}
        className={`mt-1 font-display text-[2rem] font-semibold leading-tight outline-none ${bannerColor}`}
      >
        {banner}
      </h2>

      <div className="mt-4 grid gap-4">
        {ordered.map((player) => {
          const outcome = results.outcomes[player.id];
          const selection = results.selections[player.id];
          if (!outcome || !selection) return null;
          const isMe = player.id === me;
          const name = isMe ? 'Your hand' : `${player.name}’s hand`;
          const picked = new Set(selection.positions.map((p) => grid[p]).filter((c): c is Card => c !== undefined));
          return (
            <div
              key={player.id}
              className={`rounded-xl border p-3.5 ${
                player.id === results.winner ? (isMe ? 'border-gold/60' : 'border-rival/60') : 'border-line'
              }`}
            >
              <h3 className={`text-xs font-semibold uppercase tracking-[0.14em] ${isMe ? 'text-gold' : 'text-rival'}`}>
                {name}
                {selection.reason === 'timeout' && <span className="ml-1.5 text-subtle normal-case tracking-normal">· time ran out</span>}
              </h3>
              {outcome.kind === 'complete' ? (
                <>
                  <p className="mt-1 font-display text-xl font-semibold text-ink">{outcome.hand.label}</p>
                  <p className="text-sm text-ink/80">{outcome.hand.description}</p>
                  <HandCards
                    cards={outcome.hand.cards}
                    picked={picked}
                    label={`${isMe ? 'Your' : `${player.name}’s`} five-card hand`}
                    accent={isMe ? 'gold' : 'rival'}
                  />
                </>
              ) : (
                <>
                  <p className="mt-1 font-display text-xl font-semibold text-alert">Incomplete hand</p>
                  <p className="text-sm text-ink/80">
                    {outcome.positions.length} of {GAME_CONFIG.picksRequired} cards chosen
                    {outcome.positions.length > 0 ? ` (${describePositions(grid, outcome.positions)})` : ''}, so no
                    five-card hand.
                  </p>
                </>
              )}
            </div>
          );
        })}
      </div>

      {best && (
        <p className="mt-4 text-sm leading-relaxed text-ink/80">
          {anyoneFoundBest ? (
            <span className="text-[#8fe0b5]">The strongest possible hand was found this round.</span>
          ) : (
            <>
              <span className="font-semibold text-[#8fe0b5]">Best possible: {best.hand.label}</span> with{' '}
              {describePositions(grid, best.positions)}. <span className="text-subtle">(Marked “Best”.)</span>
            </>
          )}
        </p>
      )}

      <div className="mt-5 flex flex-col gap-2.5 sm:flex-row lg:flex-col">
        <button
          type="button"
          onClick={onNextRound}
          className="flex-1 rounded-xl bg-gold px-5 py-3.5 font-semibold text-night shadow-[0_8px_24px_-10px_rgb(216_180_106/0.7)] transition hover:bg-gold-bright active:translate-y-px"
        >
          Next round
        </button>
        <button
          type="button"
          onClick={onLeave}
          className="flex-1 rounded-xl border border-line px-5 py-3.5 font-semibold text-ink/90 transition hover:border-gold/50 hover:text-ink"
        >
          Leave match
        </button>
      </div>
    </section>
  );
}
