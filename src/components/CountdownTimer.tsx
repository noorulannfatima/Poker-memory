interface CountdownTimerProps {
  remainingMs: number;
  totalMs: number;
  label: string;
}

const RADIUS = 26;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

/** Large circular countdown. Turns to an alert colour in the last 5 seconds. */
export function CountdownTimer({ remainingMs, totalMs, label }: CountdownTimerProps) {
  const clamped = Math.max(0, Math.min(totalMs, remainingMs));
  const seconds = Math.ceil(clamped / 1000);
  const fraction = totalMs > 0 ? clamped / totalMs : 0;
  const urgent = seconds <= 5;

  return (
    <div
      className="flex items-center gap-3"
      role="timer"
      aria-label={`${label}: ${seconds} seconds left`}
      data-testid="countdown"
    >
      <div className={`relative size-14 sm:size-16 ${urgent && seconds > 0 ? 'timer-urgent' : ''}`}>
        <svg viewBox="0 0 64 64" className="size-full -rotate-90" aria-hidden="true">
          <circle cx="32" cy="32" r={RADIUS} fill="none" stroke="currentColor" strokeWidth="5" className="text-line" />
          <circle
            cx="32"
            cy="32"
            r={RADIUS}
            fill="none"
            strokeWidth="5"
            strokeLinecap="round"
            stroke={urgent ? 'var(--color-alert)' : 'var(--color-gold)'}
            strokeDasharray={CIRCUMFERENCE}
            strokeDashoffset={CIRCUMFERENCE * (1 - fraction)}
            style={{ transition: 'stroke-dashoffset 200ms linear, stroke 300ms' }}
          />
        </svg>
        <span
          className={`absolute inset-0 grid place-items-center font-display text-2xl font-semibold tabular-nums sm:text-[1.7rem] ${
            urgent ? 'text-alert' : 'text-ink'
          }`}
          aria-hidden="true"
        >
          {seconds}
        </span>
      </div>
      <span className="hidden text-xs font-medium uppercase tracking-[0.16em] text-muted sm:block">{label}</span>
    </div>
  );
}
