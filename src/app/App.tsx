import { useCallback, useReducer, useRef } from 'react';
import { cryptoRandom } from '../game/deck';
import { dealRound } from '../game/deal';
import { gameReducer, initialGameState } from '../game/gameReducer';
import type { RandomFn } from '../game/gameTypes';
import { GameScreen } from '../screens/GameScreen';
import { LobbyScreen } from '../screens/LobbyScreen';
import { usePhaseTimer } from './usePhaseTimer';

interface AppProps {
  /** Injectable random source so tests can deal deterministic rounds. */
  random?: RandomFn;
}

export function App({ random = cryptoRandom }: AppProps) {
  const [state, dispatch] = useReducer(gameReducer, initialGameState);
  const nextRoundId = useRef(1);

  usePhaseTimer(state, dispatch);

  const startRound = useCallback(() => {
    const round = dealRound(nextRoundId.current++, random);
    dispatch({ type: 'START_ROUND', round, now: Date.now() });
    window.scrollTo?.({ top: 0 });
  }, [random]);

  if (state.phase === 'lobby') {
    return <LobbyScreen onStart={startRound} />;
  }
  return <GameScreen state={state} dispatch={dispatch} onPlayAgain={startRound} />;
}
