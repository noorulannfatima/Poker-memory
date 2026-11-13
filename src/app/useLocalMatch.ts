import { useCallback, useMemo, useReducer } from 'react';
import { dealRound } from '../game/deal';
import type { Difficulty } from '../game/gameConfig';
import type { RandomFn } from '../game/gameTypes';
import {
  createMatch,
  matchReducer,
  sharedScreenViewer,
  viewFor,
  type MatchTimedPhase,
  type MatchView,
} from '../game/match';
import type { MatchActions } from './matchActions';
import { usePhaseTimer } from './usePhaseTimer';

/**
 * Two players on one device, on the shared match engine in `sequential` mode:
 * they memorize together, then pick in turn with a handoff screen before each
 * turn. The view always belongs to whoever holds the device.
 */
export function useLocalMatch(
  names: readonly [string, string],
  difficulty: Difficulty,
  random: RandomFn,
): { view: MatchView; actions: MatchActions } {
  const [state, dispatch] = useReducer(matchReducer, undefined, () =>
    matchReducer(
      createMatch({
        players: [
          { id: 'p1', name: names[0] },
          { id: 'p2', name: names[1] },
        ],
        difficulty,
        turnMode: 'sequential',
      }),
      { type: 'START_ROUND', round: dealRound(1, random, difficulty), now: Date.now() },
    ),
  );

  const deadline =
    'endsAt' in state
      ? {
          phase: state.phase,
          endsAt: state.endsAt,
          roundId: state.round.id,
          turn: state.phase === 'selecting' ? state.turn : null,
        }
      : null;
  const onTimeout = useCallback(
    (phase: MatchTimedPhase, roundId: number, now: number, turn: string | null) =>
      dispatch({ type: 'PHASE_TIMEOUT', phase, roundId, now, turn }),
    [],
  );
  usePhaseTimer(deadline, onTimeout);

  const viewer = sharedScreenViewer(state);

  const toggle = useCallback(
    (position: number) => dispatch({ type: 'TOGGLE_POSITION', playerId: viewer, position }),
    [viewer],
  );
  const submit = useCallback(() => dispatch({ type: 'SUBMIT_SELECTION', playerId: viewer, now: Date.now() }), [viewer]);
  const beginTurn = useCallback(() => dispatch({ type: 'BEGIN_TURN', playerId: viewer, now: Date.now() }), [viewer]);

  const lastRoundId = 'round' in state ? state.round.id : 0;
  const nextRound = useCallback(() => {
    // One device: a single press readies both players.
    dispatch({ type: 'NEXT_ROUND', playerId: viewer });
    dispatch({ type: 'START_ROUND', round: dealRound(lastRoundId + 1, random, difficulty), now: Date.now() });
  }, [viewer, lastRoundId, random, difficulty]);

  const view = useMemo(() => viewFor(state, viewer), [state, viewer]);
  const actions = useMemo(
    () => ({ toggle, submit, nextRound, beginTurn }),
    [toggle, submit, nextRound, beginTurn],
  );
  return { view, actions };
}
