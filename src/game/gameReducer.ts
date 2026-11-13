import { GAME_CONFIG } from './gameConfig';
import type { FinalSelection, Round } from './gameTypes';
import { scoreRound, type RoundOutcome } from './scoring';

/**
 * Explicit round state machine:
 *
 *   lobby → memorizing → selecting → revealing → results
 *     ↑                                              │
 *     └──────────── BACK_TO_LOBBY / START_ROUND ─────┘
 *
 * Each phase is its own union member carrying only the data valid in that
 * phase, so impossible combinations (e.g. selecting while memorizing) cannot
 * be represented. The reducer is pure: randomness (the dealt round) and time
 * (`now`) are passed in through actions.
 */

export type GameState =
  | { readonly phase: 'lobby' }
  | { readonly phase: 'memorizing'; readonly round: Round; readonly endsAt: number }
  | {
      readonly phase: 'selecting';
      readonly round: Round;
      readonly endsAt: number;
      readonly selected: readonly number[];
    }
  | {
      readonly phase: 'revealing';
      readonly round: Round;
      readonly endsAt: number;
      readonly selection: FinalSelection;
    }
  | {
      readonly phase: 'results';
      readonly round: Round;
      readonly selection: FinalSelection;
      readonly outcome: RoundOutcome;
    };

export type Phase = GameState['phase'];
export type TimedPhase = Extract<GameState, { endsAt: number }>['phase'];

export type GameAction =
  | { readonly type: 'START_ROUND'; readonly round: Round; readonly now: number }
  | { readonly type: 'TOGGLE_POSITION'; readonly position: number }
  | { readonly type: 'SUBMIT_SELECTION'; readonly now: number }
  | {
      readonly type: 'PHASE_TIMEOUT';
      readonly phase: TimedPhase;
      readonly roundId: number;
      readonly now: number;
    }
  | { readonly type: 'BACK_TO_LOBBY' };

export const initialGameState: GameState = { phase: 'lobby' };

const seconds = (s: number) => s * 1000;

function startRevealing(round: Round, selection: FinalSelection, now: number): GameState {
  return { phase: 'revealing', round, selection, endsAt: now + GAME_CONFIG.revealMs };
}

export function gameReducer(state: GameState, action: GameAction): GameState {
  switch (action.type) {
    case 'START_ROUND': {
      // A round can start from the lobby or the results screen only.
      if (state.phase !== 'lobby' && state.phase !== 'results') return state;
      return {
        phase: 'memorizing',
        round: action.round,
        endsAt: action.now + seconds(action.round.settings.memorizeSeconds),
      };
    }

    case 'TOGGLE_POSITION': {
      if (state.phase !== 'selecting') return state;
      const { position } = action;
      if (!Number.isInteger(position) || position < 0 || position >= state.round.grid.length) return state;
      if (state.selected.includes(position)) {
        return { ...state, selected: state.selected.filter((p) => p !== position) };
      }
      // Already holding the maximum: the player must deselect one to swap.
      if (state.selected.length >= GAME_CONFIG.picksRequired) return state;
      return { ...state, selected: [...state.selected, position] };
    }

    case 'SUBMIT_SELECTION': {
      if (state.phase !== 'selecting') return state;
      if (state.selected.length !== GAME_CONFIG.picksRequired) return state;
      return startRevealing(state.round, { positions: state.selected, reason: 'submitted' }, action.now);
    }

    case 'PHASE_TIMEOUT': {
      // Ignore stale timers from an earlier phase or round.
      if (state.phase !== action.phase || state.round.id !== action.roundId) return state;
      switch (state.phase) {
        case 'memorizing':
          return {
            phase: 'selecting',
            round: state.round,
            selected: [],
            endsAt: action.now + seconds(state.round.settings.selectSeconds),
          };
        case 'selecting':
          return startRevealing(state.round, { positions: state.selected, reason: 'timeout' }, action.now);
        case 'revealing':
          return {
            phase: 'results',
            round: state.round,
            selection: state.selection,
            outcome: scoreRound(state.round, state.selection),
          };
      }
      return state;
    }

    case 'BACK_TO_LOBBY':
      return initialGameState;
  }
}

/** Whether grid cards should be shown face-up in this state. */
export function isGridFaceUp(state: GameState): boolean {
  return state.phase === 'memorizing' || state.phase === 'revealing' || state.phase === 'results';
}

/** Positions the player has chosen (live or final) in the current state. */
export function selectedPositions(state: GameState): readonly number[] {
  switch (state.phase) {
    case 'selecting':
      return state.selected;
    case 'revealing':
    case 'results':
      return state.selection.positions;
    default:
      return [];
  }
}
