import type { ReactNode } from 'react';
import type { Phase } from '../game/gameReducer';

const STEPS: Array<{ label: string; phases: Phase[] }> = [
  { label: 'Memorize', phases: ['memorizing'] },
  { label: 'Select', phases: ['selecting'] },
  { label: 'Reveal', phases: ['revealing', 'results'] },
];

interface GameHeaderProps {
  phase: Phase;
  difficulty: string;
  timer: ReactNode;
  onExit: () => void;
}

export function GameHeader({ phase, difficulty, timer, onExit }: GameHeaderProps) {
  const activeIndex = STEPS.findIndex((step) => step.phases.includes(phase));

  return (
    <header className="flex items-center justify-between gap-4 py-3 sm:py-4">
      <div className="flex min-w-0 items-center gap-3 sm:gap-5">
        <button
          type="button"
          onClick={onExit}
          className="rounded-full px-1 font-display text-lg font-semibold tracking-tight text-ink transition hover:text-gold-bright sm:text-xl"
          aria-label="Exit to lobby"
          title="Exit to lobby"
        >
          Memory <span className="text-gold">Poker</span>
        </button>
        <span className="shrink-0 rounded-full border border-gold/35 px-2.5 py-0.5 text-[0.7rem] font-semibold uppercase tracking-[0.14em] text-gold/90">
          <span className="sr-only">Level: </span>
          {difficulty}
        </span>
        <ol className="hidden items-center gap-1.5 md:flex" aria-label="Round progress">
          {STEPS.map((step, i) => {
            const state = i < activeIndex ? 'done' : i === activeIndex ? 'active' : 'todo';
            return (
              <li key={step.label} className="flex items-center gap-1.5">
                {i > 0 && <span className="h-px w-5 bg-line" aria-hidden="true" />}
                <span
                  aria-current={state === 'active' ? 'step' : undefined}
                  className={`rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-[0.14em] transition ${
                    state === 'active'
                      ? 'bg-gold text-night'
                      : state === 'done'
                        ? 'text-gold/80'
                        : 'text-subtle'
                  }`}
                >
                  {step.label}
                </span>
              </li>
            );
          })}
        </ol>
      </div>
      <div className="flex min-h-14 items-center sm:min-h-16">{timer}</div>
    </header>
  );
}
