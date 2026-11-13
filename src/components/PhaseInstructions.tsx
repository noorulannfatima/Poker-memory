import type { ReactNode } from 'react';
import { GAME_CONFIG } from '../game/gameConfig';
import type { GameState } from '../game/gameReducer';

interface PhaseInstructionsProps {
  state: Extract<GameState, { phase: 'memorizing' | 'selecting' | 'revealing' }>;
  onSubmit: () => void;
}

export function PhaseInstructions({ state, onSubmit }: PhaseInstructionsProps) {
  const required = GAME_CONFIG.picksRequired;

  if (state.phase === 'memorizing') {
    return (
      <Panel eyebrow="Phase 1 · Memorize" title="Study the grid">
        <p>
          Remember where the cards are. When the timer ends, all 16 flip face-down and the community cards
          are revealed.
        </p>
      </Panel>
    );
  }

  if (state.phase === 'revealing') {
    return (
      <Panel
        eyebrow={state.selection.reason === 'timeout' ? "Time's up" : 'Picks locked in'}
        title="Revealing the grid…"
      >
        <p>Let’s see what you picked.</p>
      </Panel>
    );
  }

  const count = state.selected.length;
  const full = count >= required;

  return (
    <Panel eyebrow="Phase 2 · Select" title={`Choose ${required} cards`}>
      <p>
        Pick the {required} grid positions that make the best five-card hand with the community cards.
      </p>
      <div className="mt-4 flex items-center gap-2" aria-hidden="true">
        {Array.from({ length: required }, (_, i) => (
          <span
            key={i}
            className={`grid size-7 place-items-center rounded-full text-xs font-bold transition ${
              i < count ? 'bg-gold text-night' : 'border border-dashed border-gold/40 text-gold/50'
            }`}
          >
            {i + 1}
          </span>
        ))}
        <span className="ml-1 text-sm text-muted">
          {count} of {required} chosen
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
          {count}/{required}
        </span>
      </button>
      <p className="mt-3 text-xs leading-relaxed text-subtle">
        If time runs out first, whatever you’ve chosen is locked in. Fewer than {required} picks means an
        incomplete hand.
      </p>
    </Panel>
  );
}

function Panel({ eyebrow, title, children }: { eyebrow: string; title: string; children: ReactNode }) {
  return (
    <section className="fade-up rounded-2xl border border-line bg-charcoal/80 p-5 text-[0.95rem] leading-relaxed text-ink/85">
      <p className="text-[0.7rem] font-semibold uppercase tracking-[0.18em] text-gold">{eyebrow}</p>
      <h2 className="mb-2 mt-1 font-display text-2xl font-semibold text-ink">{title}</h2>
      {children}
    </section>
  );
}
