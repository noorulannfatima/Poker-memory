import { useCallback, useReducer, useRef, useState } from 'react';
import { cryptoRandom } from '../game/deck';
import { dealRound } from '../game/deal';
import { DEFAULT_DIFFICULTY, isDifficulty, type Difficulty } from '../game/gameConfig';
import { gameReducer, initialGameState } from '../game/gameReducer';
import type { RandomFn } from '../game/gameTypes';
import { GameScreen } from '../screens/GameScreen';
import { LobbyScreen } from '../screens/LobbyScreen';
import { usePhaseTimer } from './usePhaseTimer';

const DIFFICULTY_KEY = 'memory-poker:difficulty';

/** The last chosen level is a per-browser convenience; storage may be unavailable. */
function loadDifficulty(): Difficulty {
  try {
    const saved = localStorage.getItem(DIFFICULTY_KEY);
    return isDifficulty(saved) ? saved : DEFAULT_DIFFICULTY;
  } catch {
    return DEFAULT_DIFFICULTY;
  }
}

function saveDifficulty(difficulty: Difficulty): void {
  try {
    localStorage.setItem(DIFFICULTY_KEY, difficulty);
  } catch {
    // Ignore: the choice just won't be remembered.
  }
}

interface AppProps {
  /** Injectable random source so tests can deal deterministic rounds. */
  random?: RandomFn;
}

export function App({ random = cryptoRandom }: AppProps) {
  const [state, dispatch] = useReducer(gameReducer, initialGameState);
  const [difficulty, setDifficulty] = useState<Difficulty>(loadDifficulty);
  const nextRoundId = useRef(1);

  usePhaseTimer(state, dispatch);

  const changeDifficulty = useCallback((next: Difficulty) => {
    setDifficulty(next);
    saveDifficulty(next);
  }, []);

  const startRound = useCallback(() => {
    const round = dealRound(nextRoundId.current++, random, difficulty);
    dispatch({ type: 'START_ROUND', round, now: Date.now() });
    window.scrollTo?.({ top: 0 });
  }, [random, difficulty]);

  if (state.phase === 'lobby') {
    return <LobbyScreen difficulty={difficulty} onDifficultyChange={changeDifficulty} onStart={startRound} />;
  }
  return <GameScreen state={state} dispatch={dispatch} onPlayAgain={startRound} />;
}
