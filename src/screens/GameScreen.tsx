import type { Dispatch } from 'react';
import { useRemaining } from '../app/usePhaseTimer';
import { CardGrid } from '../components/CardGrid';
import { CommunityCards } from '../components/CommunityCards';
import { CountdownTimer } from '../components/CountdownTimer';
import { GameHeader } from '../components/GameHeader';
import { PhaseInstructions } from '../components/PhaseInstructions';
import { ResultPanel } from '../components/ResultPanel';
import { GAME_CONFIG } from '../game/gameConfig';
import type { GameAction, GameState } from '../game/gameReducer';

interface GameScreenProps {
  state: Exclude<GameState, { phase: 'lobby' }>;
  dispatch: Dispatch<GameAction>;
  onPlayAgain: () => void;
}

function announcement(state: GameScreenProps['state']): string {
  const { settings } = state.round;
  switch (state.phase) {
    case 'memorizing':
      return `${settings.label} level. Memorize the grid of ${state.round.grid.length} cards. ${settings.memorizeSeconds} seconds.`;
    case 'selecting':
      return `Cards are face-down and the community cards are revealed. Choose ${GAME_CONFIG.picksRequired} cards within ${settings.selectSeconds} seconds.`;
    case 'revealing':
      return 'Selection closed. Revealing the grid.';
    case 'results':
      return 'Round complete. Results are shown.';
  }
}

export function GameScreen({ state, dispatch, onPlayAgain }: GameScreenProps) {
  const { settings } = state.round;
  const endsAt = 'endsAt' in state ? state.endsAt : null;
  const remaining = useRemaining(endsAt);

  const timer =
    state.phase === 'memorizing' ? (
      <CountdownTimer label="Memorize" remainingMs={remaining} totalMs={settings.memorizeSeconds * 1000} />
    ) : state.phase === 'selecting' ? (
      <CountdownTimer label="Select" remainingMs={remaining} totalMs={settings.selectSeconds * 1000} />
    ) : null;

  const communityVisible = state.phase !== 'memorizing';
  const exit = () => dispatch({ type: 'BACK_TO_LOBBY' });

  return (
    <div
      className={`mx-auto flex min-h-dvh w-full max-w-6xl flex-col px-4 sm:px-6 ${
        state.phase === 'selecting' ? 'pb-24 lg:pb-8' : 'pb-8'
      }`}
    >
      <GameHeader phase={state.phase} difficulty={settings.label} timer={timer} onExit={exit} />
      <h1 className="sr-only">Memory Poker</h1>
      <p className="sr-only" role="status" aria-live="polite">
        {announcement(state)}
      </p>

      <main className="game-layout flex-1">
        <div className="area-board">
          <CommunityCards cards={communityVisible ? state.round.community : null} count={GAME_CONFIG.communityCount} />
        </div>

        <section aria-label="Grid" className="area-grid felt flex items-center justify-center rounded-3xl p-4 sm:p-7">
          <CardGrid state={state} onToggle={(position) => dispatch({ type: 'TOGGLE_POSITION', position })} />
        </section>

        <div className="area-panel">
          {state.phase === 'results' ? (
            <ResultPanel
              key={state.round.id}
              round={state.round}
              selection={state.selection}
              outcome={state.outcome}
              onPlayAgain={onPlayAgain}
              onLobby={exit}
            />
          ) : (
            <PhaseInstructions
              key={state.phase}
              state={state}
              onSubmit={() => dispatch({ type: 'SUBMIT_SELECTION', now: Date.now() })}
            />
          )}
        </div>
      </main>
    </div>
  );
}
