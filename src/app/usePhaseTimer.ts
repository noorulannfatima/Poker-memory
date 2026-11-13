import { useEffect, useState, type Dispatch } from 'react';
import type { GameAction, GameState } from '../game/gameReducer';

/**
 * Dispatches PHASE_TIMEOUT when the current timed phase ends. The timeout is
 * cleared whenever the phase or round changes and when the component
 * unmounts, and the reducer also ignores timeouts for any other phase/round.
 */
export function usePhaseTimer(state: GameState, dispatch: Dispatch<GameAction>): void {
  const timed = 'endsAt' in state ? state : null;
  const phase = timed?.phase;
  const endsAt = timed?.endsAt;
  const roundId = timed?.round.id;

  useEffect(() => {
    if (phase === undefined || endsAt === undefined || roundId === undefined) return;
    const id = setTimeout(
      () => dispatch({ type: 'PHASE_TIMEOUT', phase, roundId, now: Date.now() }),
      Math.max(0, endsAt - Date.now()),
    );
    return () => clearTimeout(id);
  }, [phase, endsAt, roundId, dispatch]);
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
