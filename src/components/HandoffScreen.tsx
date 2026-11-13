import { useEffect, useRef, type ReactNode } from 'react';

interface HandoffScreenProps {
  /** The player who picks next. */
  nextName: string;
  /** The other player, who should look away. */
  otherName: string;
  /** True before the first turn of a round (nobody has picked yet). */
  firstTurn: boolean;
  scoreboard?: ReactNode;
  onReady: () => void;
  onLeave: () => void;
}

/**
 * One device: covers the board between turns so neither player sees the
 * other's picks. No timer runs while it is shown.
 */
export function HandoffScreen({ nextName, otherName, firstTurn, scoreboard, onReady, onLeave }: HandoffScreenProps) {
  const headingRef = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    headingRef.current?.focus();
  }, []);

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col justify-center px-4 py-10 text-center">
      {scoreboard}
      <section
        className="fade-up rounded-2xl border border-line bg-charcoal/80 p-6"
        aria-labelledby="handoff-heading"
      >
        <p className="text-[0.7rem] font-semibold uppercase tracking-[0.18em] text-gold">
          {firstTurn ? 'Memorizing is over' : `${otherName}’s turn is over`}
        </p>
        <h1
          id="handoff-heading"
          ref={headingRef}
          tabIndex={-1}
          className="mt-1 font-display text-3xl font-semibold text-ink outline-none"
        >
          {firstTurn ? `${nextName} picks first` : `Pass to ${nextName}`}
        </h1>
        <p className="mt-3 leading-relaxed text-ink/85">
          {otherName}, look away while {nextName} picks. The timer starts when you tap below.
        </p>
        <button
          type="button"
          onClick={onReady}
          className="mt-6 w-full rounded-xl bg-gold px-5 py-3.5 text-base font-semibold text-night transition hover:bg-gold-bright active:translate-y-px"
        >
          I'm {nextName}, start my turn
        </button>
        <button
          type="button"
          onClick={onLeave}
          className="mt-3 text-sm text-muted underline-offset-4 transition hover:text-ink hover:underline"
        >
          Leave match
        </button>
      </section>
    </main>
  );
}
