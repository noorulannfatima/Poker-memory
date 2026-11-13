import type { ReactNode } from 'react';
import { GAME_CONFIG } from '../game/gameConfig';

interface PhaseInstructionsProps {
  phase: 'memorizing' | 'selecting' | 'revealing';
  levelLabel: string;
  gridCount: number;
  selectedCount: number;
  /** Picks are locked while the phase continues (waiting for an opponent). */
  locked?: boolean;
  /** The selection ended because the timer ran out. */
  timedOut?: boolean;
  /** Extra content, e.g. the opponent's status. */
  children?: ReactNode;
  onSubmit: () => void;
}

export function PhaseInstructions({
  phase,
  levelLabel,
  gridCount,
  selectedCount,
  locked = false,
  timedOut = false,
  children,
  onSubmit,
}: PhaseInstructionsProps) {
  const required = GAME_CONFIG.picksRequired;

  if (phase === 'memorizing') {
    return (
      <Panel eyebrow={`Phase 1 · Memorize · ${levelLabel}`} title="Study the grid" extra={children}>
        <p>
          Remember where the cards are. When the timer ends, all {gridCount} flip face-down and the community
          cards are revealed.
        </p>
      </Panel>
    );
  }

  if (phase === 'revealing') {
    return (
      <Panel eyebrow={timedOut ? "Time's up" : 'Picks locked in'} title="Revealing the grid…" extra={children}>
        <p>Let’s see what was picked.</p>
      </Panel>
    );
  }

  if (locked) {
    return (
      <Panel eyebrow={`Phase 2 · Select · ${levelLabel}`} title="Picks locked in" extra={children}>
        <p>Your cards are set. The grid is revealed as soon as everyone has locked in or the timer runs out.</p>
      </Panel>
    );
  }

  const full = selectedCount >= required;

  return (
    <Panel eyebrow={`Phase 2 · Select · ${levelLabel}`} title={`Choose ${required} cards`} extra={children}>
      <p>
        Pick the {required} grid positions that make the best five-card hand with the community cards.
      </p>
      <div className="mt-4 flex items-center gap-2" aria-hidden="true">
        {Array.from({ length: required }, (_, i) => (
          <span
            key={i}
            className={`grid size-7 place-items-center rounded-full text-xs font-bold transition ${
              i < selectedCount ? 'bg-gold text-night' : 'border border-dashed border-gold/40 text-gold/50'
            }`}
          >
            {i + 1}
          </span>
        ))}
        <span className="ml-1 text-sm text-muted">
          {selectedCount} of {required} chosen
        </span>
      </div>
      <p className="mt-3 min-h-[2.5rem] text-sm text-muted" aria-live="polite">
        {full
          ? 'Tap a chosen card to release it, or lock in your picks.'
          : 'Tap a face-down card to choose it. Tap again to release it.'}
      </p>
      {/* Pinned to the bottom of the screen on phones so it is always reachable. */}
      <button
        type="button"
        onClick={onSubmit}
        disabled={!full}
        className="fixed inset-x-4 bottom-4 z-20 rounded-xl shadow-[0_10px_30px_rgb(0_0_0/0.7)] lg:static lg:mt-3 lg:w-full lg:shadow-none ring-1 ring-black/40 lg:ring-0 bg-gold px-5 py-3.5 text-base font-semibold text-night transition hover:bg-gold-bright active:translate-y-px disabled:cursor-not-allowed disabled:bg-charcoal-2 disabled:text-subtle"
      >
        Lock in picks
        <span className="ml-1.5 tabular-nums opacity-70 lg:hidden" aria-hidden="true">
          {selectedCount}/{required}
        </span>
      </button>
      <p className="mt-3 text-xs leading-relaxed text-subtle">
        If time runs out first, whatever you’ve chosen is locked in. Fewer than {required} picks means an
        incomplete hand.
      </p>
    </Panel>
  );
}

function Panel({
  eyebrow,
  title,
  extra,
  children,
}: {
  eyebrow: string;
  title: string;
  extra?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="fade-up rounded-2xl border border-line bg-charcoal/80 p-5 text-[0.95rem] leading-relaxed text-ink/85">
      <p className="text-[0.7rem] font-semibold uppercase tracking-[0.18em] text-gold">{eyebrow}</p>
      <h2 className="mb-2 mt-1 font-display text-2xl font-semibold text-ink">{title}</h2>
      {children}
      {extra && <div className="mt-4 border-t border-line pt-4">{extra}</div>}
    </section>
  );
}
