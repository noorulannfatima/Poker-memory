import { useEffect, useState } from 'react';

export interface PhaseDeadline<P extends string> {
  readonly phase: P;
  readonly endsAt: number;
  readonly roundId: number;
}

/**
 * Calls `onTimeout` when the current timed phase ends. The timeout is cleared
 * whenever the phase or round changes and when the component unmounts; the
 * reducers also ignore timeouts for any other phase or round.
 * `onTimeout` must be stable (wrap it in useCallback).
 */
export function usePhaseTimer<P extends string>(
  deadline: PhaseDeadline<P> | null,
  onTimeout: (phase: P, roundId: number, now: number) => void,
): void {
  const phase = deadline?.phase;
  const endsAt = deadline?.endsAt;
  const roundId = deadline?.roundId;

  useEffect(() => {
    if (phase === undefined || endsAt === undefined || roundId === undefined) return;
    const id = setTimeout(() => onTimeout(phase, roundId, Date.now()), Math.max(0, endsAt - Date.now()));
    return () => clearTimeout(id);
  }, [phase, endsAt, roundId, onTimeout]);
}

/** Returns the milliseconds left until `endsAt`, refreshed a few times a second. */
export function useRemaining(endsAt: number | null, intervalMs = 200): number {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (endsAt === null) return;
    const tick = () => setNow(Date.now());
    const id = setInterval(tick, intervalMs);
    // Refresh straight away so a new phase doesn't show a stale value.
    const first = setTimeout(tick, 0);
    return () => {
      clearInterval(id);
      clearTimeout(first);
    };
  }, [endsAt, intervalMs]);

  return endsAt === null ? 0 : Math.max(0, endsAt - now);
}
