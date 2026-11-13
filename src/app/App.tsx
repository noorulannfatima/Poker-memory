import { useCallback, useReducer, useRef, useState } from 'react';
import { cryptoRandom } from '../game/deck';
import { dealRound } from '../game/deal';
import {
  DEFAULT_DIFFICULTY,
  DEFAULT_MODE,
  isDifficulty,
  isGameMode,
  type Difficulty,
  type GameMode,
} from '../game/gameConfig';
import { gameReducer, initialGameState, type TimedPhase } from '../game/gameReducer';
import type { RandomFn } from '../game/gameTypes';
import { normalizeNames } from './playerNames';
import { ComputerMatchScreen } from '../screens/ComputerMatchScreen';
import { GameScreen } from '../screens/GameScreen';
import { LobbyScreen } from '../screens/LobbyScreen';
import { LocalMatchScreen } from '../screens/LocalMatchScreen';
import { OnlineMatchScreen } from '../screens/OnlineMatchScreen';
import { loadSession } from './onlineSession';
import { serverUrl } from './serverUrl';
import type { SocketFactory } from './socket';
import type { OnlineIntent } from './useOnlineMatch';
import { usePhaseTimer } from './usePhaseTimer';

const DIFFICULTY_KEY = 'memory-poker:difficulty';
const MODE_KEY = 'memory-poker:mode';

/** Lobby choices are a per-browser convenience; storage may be unavailable. */
function load<T>(key: string, isValid: (value: unknown) => value is T, fallback: T): T {
  try {
    const saved = localStorage.getItem(key);
    return isValid(saved) ? saved : fallback;
  } catch {
    return fallback;
  }
}

function save(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    // Ignore: the choice just won't be remembered.
  }
}

interface AppProps {
  /** Injectable random source so tests can deal deterministic rounds. */
  random?: RandomFn;
  /** Injectable socket for online-play tests. Defaults to a real WebSocket. */
  createSocket?: SocketFactory;
}

export function App({ random = cryptoRandom, createSocket }: AppProps) {
  const [state, dispatch] = useReducer(gameReducer, initialGameState);
  const [difficulty, setDifficulty] = useState<Difficulty>(() => load(DIFFICULTY_KEY, isDifficulty, DEFAULT_DIFFICULTY));
  const [mode, setMode] = useState<GameMode>(() => load(MODE_KEY, isGameMode, DEFAULT_MODE));
  const [names, setNames] = useState<[string, string]>(['', '']);
  /** The running match (vs computer or one device), or null in solo/lobby. */
  const [match, setMatch] = useState<{ mode: 'computer' | 'local'; names: [string, string] } | null>(null);
  const [onlineName, setOnlineName] = useState('');
  // A saved session means this tab was in an online room before a reload: resume it.
  const [online, setOnline] = useState<OnlineIntent | null>(() => {
    const saved = loadSession();
    return saved ? { type: 'resume', roomCode: saved.roomCode, token: saved.token } : null;
  });
  const [onlineError, setOnlineError] = useState<string | null>(null);
  const nextRoundId = useRef(1);

  const deadline = 'endsAt' in state ? { phase: state.phase, endsAt: state.endsAt, roundId: state.round.id } : null;
  const onTimeout = useCallback(
    (phase: TimedPhase, roundId: number, now: number) => dispatch({ type: 'PHASE_TIMEOUT', phase, roundId, now }),
    [],
  );
  usePhaseTimer(deadline, onTimeout);

  const changeDifficulty = useCallback((next: Difficulty) => {
    setDifficulty(next);
    save(DIFFICULTY_KEY, next);
  }, []);

  const changeMode = useCallback((next: GameMode) => {
    setMode(next);
    save(MODE_KEY, next);
  }, []);

  const startSoloRound = useCallback(() => {
    const round = dealRound(nextRoundId.current++, random, difficulty);
    dispatch({ type: 'START_ROUND', round, now: Date.now() });
    window.scrollTo?.({ top: 0 });
  }, [random, difficulty]);

  const start = useCallback(() => {
    if (mode === 'solo') {
      startSoloRound();
      return;
    }
    if (mode === 'online') {
      setOnlineError(null);
      setOnline({ type: 'create', name: onlineName, difficulty });
      return;
    }
    setMatch({ mode, names: normalizeNames(names) });
    window.scrollTo?.({ top: 0 });
  }, [mode, names, startSoloRound, onlineName, difficulty]);

  const leaveMatch = useCallback(() => setMatch(null), []);

  const joinRoom = useCallback(
    (roomCode: string) => {
      setOnlineError(null);
      setOnline({ type: 'join', roomCode, name: onlineName });
    },
    [onlineName],
  );

  const exitOnline = useCallback(
    (error: string | null) => {
      setOnline(null);
      setOnlineError(error);
      // Show the error where it belongs, even after a resume from a reload.
      if (error) changeMode('online');
    },
    [changeMode],
  );

  if (online) {
    return <OnlineMatchScreen intent={online} url={serverUrl()} createSocket={createSocket} onExit={exitOnline} />;
  }

  if (match?.mode === 'computer') {
    return <ComputerMatchScreen difficulty={difficulty} random={random} onLeave={leaveMatch} />;
  }
  if (match?.mode === 'local') {
    return <LocalMatchScreen names={match.names} difficulty={difficulty} random={random} onLeave={leaveMatch} />;
  }
  if (state.phase === 'lobby') {
    return (
      <LobbyScreen
        difficulty={difficulty}
        onDifficultyChange={changeDifficulty}
        mode={mode}
        onModeChange={changeMode}
        names={names}
        onNamesChange={setNames}
        onStart={start}
        onlineName={onlineName}
        onOnlineNameChange={setOnlineName}
        onJoin={joinRoom}
        onlineError={onlineError}
      />
    );
  }
  return <GameScreen state={state} dispatch={dispatch} onPlayAgain={startSoloRound} />;
}
