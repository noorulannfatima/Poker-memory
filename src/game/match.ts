import { GAME_CONFIG, type Difficulty, type DifficultySettings, DIFFICULTIES } from './gameConfig';
import type { Card, FinalSelection, Round } from './gameTypes';
import { togglePick } from './picking';
import { compareOutcomes, scoreRound, type RoundOutcome } from './scoring';

/**
 * Pure multi-player match engine (see docs/superpowers/specs/2026-11-13-multiplayer-design.md).
 *
 * Runs in the browser today (vs computer) and is meant to run on the Node
 * server for online play. Like `gameReducer`, time and randomness come in
 * through actions. Players are stored as a list; the rules assume 2.
 *
 *   waiting → memorizing → selecting → revealing → results ─┐
 *                 ↑                                         │
 *                 └──── START_ROUND (once all are ready) ───┘
 *
 * Only `simultaneous` turns are implemented: every player selects under one
 * timer. `sequential` (pass-and-play with a handoff) arrives with one-device mode.
 */

export type PlayerId = string;
export type TurnMode = 'simultaneous';

export interface MatchPlayer {
  readonly id: PlayerId;
  readonly name: string;
  readonly wins: number;
}

export interface PlayerPicks {
  readonly selected: readonly number[];
  readonly locked: boolean;
}

type PhaseState =
  | { readonly phase: 'waiting' }
  | { readonly phase: 'memorizing'; readonly round: Round; readonly endsAt: number }
  | {
      readonly phase: 'selecting';
      readonly round: Round;
      readonly endsAt: number;
      readonly picks: Readonly<Record<PlayerId, PlayerPicks>>;
    }
  | {
      readonly phase: 'revealing';
      readonly round: Round;
      readonly endsAt: number;
      readonly selections: Readonly<Record<PlayerId, FinalSelection>>;
    }
  | {
      readonly phase: 'results';
      readonly round: Round;
      readonly selections: Readonly<Record<PlayerId, FinalSelection>>;
      readonly outcomes: Readonly<Record<PlayerId, RoundOutcome>>;
      /** Round winner, or null for a tie. */
      readonly winner: PlayerId | null;
      /** Players who pressed Next round. */
      readonly ready: readonly PlayerId[];
    };

interface MatchBase {
  readonly players: readonly MatchPlayer[];
  readonly ties: number;
  readonly difficulty: Difficulty;
  readonly turnMode: TurnMode;
}

export type MatchState = MatchBase & PhaseState;
export type MatchPhase = MatchState['phase'];
export type MatchTimedPhase = 'memorizing' | 'selecting' | 'revealing';

export type MatchAction =
  | { readonly type: 'START_ROUND'; readonly round: Round; readonly now: number }
  | { readonly type: 'TOGGLE_POSITION'; readonly playerId: PlayerId; readonly position: number }
  | { readonly type: 'SUBMIT_SELECTION'; readonly playerId: PlayerId; readonly now: number }
  | {
      readonly type: 'PHASE_TIMEOUT';
      readonly phase: MatchTimedPhase;
      readonly roundId: number;
      readonly now: number;
    }
  | { readonly type: 'NEXT_ROUND'; readonly playerId: PlayerId };

export interface CreateMatchOptions {
  readonly players: ReadonlyArray<{ readonly id: PlayerId; readonly name: string }>;
  readonly difficulty: Difficulty;
  readonly turnMode?: TurnMode;
}

export function createMatch({ players, difficulty, turnMode = 'simultaneous' }: CreateMatchOptions): MatchState {
  return {
    phase: 'waiting',
    players: players.map((p) => ({ id: p.id, name: p.name, wins: 0 })),
    ties: 0,
    difficulty,
    turnMode,
  };
}

function base(state: MatchState): MatchBase {
  return { players: state.players, ties: state.ties, difficulty: state.difficulty, turnMode: state.turnMode };
}

const hasPlayer = (state: MatchState, id: PlayerId) => state.players.some((p) => p.id === id);

/** The single best outcome wins; if several share the best, the round is a tie. */
function decideWinner(players: readonly MatchPlayer[], outcomes: Record<PlayerId, RoundOutcome>): PlayerId | null {
  let leaders: PlayerId[] = [];
  for (const { id } of players) {
    const outcome = outcomes[id];
    const leader = leaders[0] !== undefined ? outcomes[leaders[0]] : undefined;
    if (!outcome) continue;
    const cmp = leader ? compareOutcomes(outcome, leader) : 1;
    if (cmp > 0) leaders = [id];
    else if (cmp === 0) leaders.push(id);
  }
  return leaders.length === 1 ? (leaders[0] ?? null) : null;
}

function startRevealing(state: Extract<MatchState, { phase: 'selecting' }>, now: number): MatchState {
  const selections: Record<PlayerId, FinalSelection> = {};
  for (const { id } of state.players) {
    const picks = state.picks[id];
    selections[id] = {
      positions: picks?.selected ?? [],
      reason: picks?.locked ? 'submitted' : 'timeout',
    };
  }
  return { ...base(state), phase: 'revealing', round: state.round, selections, endsAt: now + GAME_CONFIG.revealMs };
}

export function matchReducer(state: MatchState, action: MatchAction): MatchState {
  switch (action.type) {
    case 'START_ROUND': {
      const allReady =
        state.phase === 'results' && state.players.every((p) => state.ready.includes(p.id));
      if (state.phase !== 'waiting' && !allReady) return state;
      if (action.round.settings.id !== state.difficulty) return state;
      return {
        ...base(state),
        phase: 'memorizing',
        round: action.round,
        endsAt: action.now + action.round.settings.memorizeSeconds * 1000,
      };
    }

    case 'TOGGLE_POSITION': {
      if (state.phase !== 'selecting') return state;
      const current = state.picks[action.playerId];
      if (!current || current.locked) return state;
      const selected = togglePick(current.selected, action.position, state.round.grid.length);
      if (selected === current.selected) return state;
      return { ...state, picks: { ...state.picks, [action.playerId]: { ...current, selected } } };
    }

    case 'SUBMIT_SELECTION': {
      if (state.phase !== 'selecting') return state;
      const current = state.picks[action.playerId];
      if (!current || current.locked || current.selected.length !== GAME_CONFIG.picksRequired) return state;
      const next = { ...state, picks: { ...state.picks, [action.playerId]: { ...current, locked: true } } };
      const everyoneLocked = state.players.every((p) => next.picks[p.id]?.locked);
      return everyoneLocked ? startRevealing(next, action.now) : next;
    }

    case 'PHASE_TIMEOUT': {
      if (state.phase !== action.phase || state.round.id !== action.roundId) return state;
      switch (state.phase) {
        case 'memorizing': {
          const picks: Record<PlayerId, PlayerPicks> = {};
          for (const { id } of state.players) picks[id] = { selected: [], locked: false };
          return {
            ...base(state),
            phase: 'selecting',
            round: state.round,
            picks,
            endsAt: action.now + state.round.settings.selectSeconds * 1000,
          };
        }
        case 'selecting':
          return startRevealing(state, action.now);
        case 'revealing': {
          const outcomes: Record<PlayerId, RoundOutcome> = {};
          for (const { id } of state.players) {
            const selection = state.selections[id];
            if (selection) outcomes[id] = scoreRound(state.round, selection);
          }
          const winner = decideWinner(state.players, outcomes);
          return {
            players: state.players.map((p) => (p.id === winner ? { ...p, wins: p.wins + 1 } : p)),
            ties: winner === null ? state.ties + 1 : state.ties,
            difficulty: state.difficulty,
            turnMode: state.turnMode,
            phase: 'results',
            round: state.round,
            selections: state.selections,
            outcomes,
            winner,
            ready: [],
          };
        }
      }
      return state;
    }

    case 'NEXT_ROUND': {
      if (state.phase !== 'results' || !hasPlayer(state, action.playerId)) return state;
      if (state.ready.includes(action.playerId)) return state;
      return { ...state, ready: [...state.ready, action.playerId] };
    }
  }
}

// ───────────── Per-player view ─────────────

export type OpponentStatus = 'memorizing' | 'selecting' | 'locked' | 'revealed' | 'waiting';

export interface OpponentView {
  readonly id: PlayerId;
  readonly name: string;
  readonly status: OpponentStatus;
  /** Final picks; null until the reveal so they can't leak. */
  readonly picks: readonly number[] | null;
}

export interface MatchResultsView {
  readonly outcomes: Readonly<Record<PlayerId, RoundOutcome>>;
  readonly selections: Readonly<Record<PlayerId, FinalSelection>>;
  readonly winner: PlayerId | null;
  readonly ready: readonly PlayerId[];
}

/** Everything one player may see. Safe to render or send over the network. */
export interface MatchView {
  readonly me: PlayerId;
  readonly players: readonly MatchPlayer[];
  readonly ties: number;
  readonly settings: DifficultySettings;
  readonly phase: MatchPhase;
  readonly roundId: number | null;
  readonly endsAt: number | null;
  /** Grid cards; face-down cards are null. Empty before the first deal. */
  readonly grid: readonly (Card | null)[];
  /** Community cards, or null while they are still hidden. */
  readonly community: readonly Card[] | null;
  readonly myPicks: readonly number[];
  readonly myLocked: boolean;
  readonly opponents: readonly OpponentView[];
  readonly results: MatchResultsView | null;
}

export function viewFor(state: MatchState, me: PlayerId): MatchView {
  const settings = DIFFICULTIES[state.difficulty];
  const common = { me, players: state.players, ties: state.ties, settings, phase: state.phase };

  if (state.phase === 'waiting') {
    return {
      ...common,
      roundId: null,
      endsAt: null,
      grid: [],
      community: null,
      myPicks: [],
      myLocked: false,
      opponents: state.players
        .filter((p) => p.id !== me)
        .map((p) => ({ id: p.id, name: p.name, status: 'waiting', picks: null })),
      results: null,
    };
  }

  const faceUp = state.phase !== 'selecting';
  const grid = faceUp ? state.round.grid : state.round.grid.map(() => null);
  const community = state.phase === 'memorizing' ? null : state.round.community;

  const finalFor = (id: PlayerId) =>
    state.phase === 'revealing' || state.phase === 'results' ? (state.selections[id] ?? null) : null;

  const opponents: OpponentView[] = state.players
    .filter((p) => p.id !== me)
    .map((p) => {
      if (state.phase === 'memorizing') return { id: p.id, name: p.name, status: 'memorizing', picks: null };
      if (state.phase === 'selecting') {
        return { id: p.id, name: p.name, status: state.picks[p.id]?.locked ? 'locked' : 'selecting', picks: null };
      }
      return { id: p.id, name: p.name, status: 'revealed', picks: finalFor(p.id)?.positions ?? [] };
    });

  const mine = state.phase === 'selecting' ? state.picks[me] : undefined;

  return {
    ...common,
    roundId: state.round.id,
    endsAt: 'endsAt' in state ? state.endsAt : null,
    grid,
    community,
    myPicks: mine?.selected ?? finalFor(me)?.positions ?? [],
    myLocked: mine?.locked ?? state.phase !== 'memorizing',
    opponents,
    results:
      state.phase === 'results'
        ? { outcomes: state.outcomes, selections: state.selections, winner: state.winner, ready: state.ready }
        : null,
  };
}
