import { useCallback, useEffect, useMemo, useReducer } from 'react';
import { chooseComputerPicks } from '../game/computerPlayer';
import { dealRound } from '../game/deal';
import type { Difficulty } from '../game/gameConfig';
import type { RandomFn } from '../game/gameTypes';
import { createMatch, matchReducer, viewFor, type MatchTimedPhase, type MatchView } from '../game/match';
import { usePhaseTimer } from './usePhaseTimer';

export const HUMAN_ID = 'you';
export const COMPUTER_ID = 'computer';

/** When the human locks in first, the computer finishes up quickly. */
const HURRY_MS = 700;

export interface MatchActions {
  toggle: (position: number) => void;
  submit: () => void;
  nextRound: () => void;
}

/**
 * Runs a You-vs-Computer match in the browser on the shared match engine.
 * Returns the same `{ view, actions }` shape planned for the one-device and
 * online hooks, so `MatchScreen` doesn't know who the opponent is.
 *
 * The computer memorizes the same grid and, partway through the selection
 * timer, locks in the pair that looks best given its imperfect memory
 * (`computerMemory` for the level). Its picks stay hidden until the reveal.
 */
export function useComputerMatch(difficulty: Difficulty, random: RandomFn): { view: MatchView; actions: MatchActions } {
  const [state, dispatch] = useReducer(matchReducer, undefined, () =>
    matchReducer(
      createMatch({
        players: [
          { id: HUMAN_ID, name: 'You' },
          { id: COMPUTER_ID, name: 'Computer' },
        ],
        difficulty,
      }),
      { type: 'START_ROUND', round: dealRound(1, random, difficulty), now: Date.now() },
    ),
  );

  const deadline = 'endsAt' in state ? { phase: state.phase, endsAt: state.endsAt, roundId: state.round.id } : null;
  const onTimeout = useCallback(
    (phase: MatchTimedPhase, roundId: number, now: number) => dispatch({ type: 'PHASE_TIMEOUT', phase, roundId, now }),
    [],
  );
  usePhaseTimer(deadline, onTimeout);

  // The computer's turn: think for a while, then lock in.
  const selecting = state.phase === 'selecting' ? state : null;
  const round = selecting?.round ?? null;
  const computerLocked = selecting?.picks[COMPUTER_ID]?.locked ?? false;
  const humanLocked = selecting?.picks[HUMAN_ID]?.locked ?? false;

  useEffect(() => {
    if (!round || computerLocked) return;
    const { selectSeconds, computerMemory } = round.settings;
    const thinkMs = humanLocked ? HURRY_MS : (0.25 + random() * 0.45) * selectSeconds * 1000;
    const id = setTimeout(() => {
      const [a, b] = chooseComputerPicks(round, computerMemory, random);
      dispatch({ type: 'TOGGLE_POSITION', playerId: COMPUTER_ID, position: a });
      dispatch({ type: 'TOGGLE_POSITION', playerId: COMPUTER_ID, position: b });
      dispatch({ type: 'SUBMIT_SELECTION', playerId: COMPUTER_ID, now: Date.now() });
    }, thinkMs);
    return () => clearTimeout(id);
  }, [round, computerLocked, humanLocked, random]);

  const toggle = useCallback(
    (position: number) => dispatch({ type: 'TOGGLE_POSITION', playerId: HUMAN_ID, position }),
    [],
  );
  const submit = useCallback(() => dispatch({ type: 'SUBMIT_SELECTION', playerId: HUMAN_ID, now: Date.now() }), []);

  const lastRoundId = 'round' in state ? state.round.id : 0;
  const nextRound = useCallback(() => {
    // The computer is always ready for another round.
    dispatch({ type: 'NEXT_ROUND', playerId: HUMAN_ID });
    dispatch({ type: 'NEXT_ROUND', playerId: COMPUTER_ID });
    dispatch({ type: 'START_ROUND', round: dealRound(lastRoundId + 1, random, difficulty), now: Date.now() });
  }, [lastRoundId, random, difficulty]);

  const view = useMemo(() => viewFor(state, HUMAN_ID), [state]);
  const actions = useMemo(() => ({ toggle, submit, nextRound }), [toggle, submit, nextRound]);
  return { view, actions };
}
