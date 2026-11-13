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
 * Turn modes:
 * - `simultaneous` (vs computer, online): every player selects under one timer.
 * - `sequential` (one device): after memorizing, each player selects in turn with
 *   a full timer. A `handoff` phase (no timer, grid hidden) comes before every turn,
 *   so the other player can look away. The first selector moves along by one
 *   each round.
 */

export type PlayerId = string;
export type TurnMode = 'simultaneous' | 'sequential';

export interface MatchPlayer {
  readonly id: PlayerId;
  readonly name: string;
  readonly wins: number;
}

export interface PlayerPicks {
  readonly selected: readonly number[];
  /** Submitted with Lock in. */
  readonly locked: boolean;
  /** Sequential: this player's own turn timer ran out. */
  readonly timedOut: boolean;
}

type PhaseState =
  | { readonly phase: 'waiting' }
  | { readonly phase: 'memorizing'; readonly round: Round; readonly endsAt: number }
  | {
      readonly phase: 'selecting';
      readonly round: Round;
      readonly endsAt: number;
      readonly picks: Readonly<Record<PlayerId, PlayerPicks>>;
      /** Sequential: whose turn it is. Simultaneous: null. */
      readonly turn: PlayerId | null;
    }
  | {
      readonly phase: 'handoff';
      readonly round: Round;
      readonly picks: Readonly<Record<PlayerId, PlayerPicks>>;
      /** Who selects next; their timer starts with BEGIN_TURN. */
      readonly next: PlayerId;
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
  | { readonly type: 'BEGIN_TURN'; readonly playerId: PlayerId; readonly now: number }
  | {
      readonly type: 'PHASE_TIMEOUT';
      readonly phase: MatchTimedPhase;
      readonly roundId: number;
      readonly now: number;
      /** Sequential selecting: whose turn this timer belongs to. */
      readonly turn?: PlayerId | null;
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

type SelectingState = Extract<MatchState, { phase: 'selecting' }>;

const isDone = (picks: PlayerPicks | undefined): boolean => !!picks && (picks.locked || picks.timedOut);

function emptyPicks(players: readonly MatchPlayer[]): Record<PlayerId, PlayerPicks> {
  const picks: Record<PlayerId, PlayerPicks> = {};
  for (const { id } of players) picks[id] = { selected: [], locked: false, timedOut: false };
  return picks;
}

/**
 * Selection order for the round being played, or about to be played once results
 * are tallied (sequential mode). The first selector
 * moves along by one for every completed round, so nobody always goes last.
 */
export function turnOrder(state: MatchState): PlayerId[] {
  const ids = state.players.map((p) => p.id);
  if (ids.length === 0) return ids;
  const played = state.players.reduce((sum, p) => sum + p.wins, state.ties);
  const shift = played % ids.length;
  return [...ids.slice(shift), ...ids.slice(0, shift)];
}

/**
 * One device: the player the screen is shown to. During turns that is the
 * selecting player (or the one up next); otherwise the first player.
 */
export function sharedScreenViewer(state: MatchState): PlayerId {
  if (state.phase === 'selecting' && state.turn !== null) return state.turn;
  if (state.phase === 'handoff') return state.next;
  return state.players[0]?.id ?? '';
}

/** Sequential: hand over to the next player who hasn't picked yet, or reveal once everyone has. */
function finishTurn(state: SelectingState, now: number): MatchState {
  const next = turnOrder(state).find((id) => !isDone(state.picks[id]));
  if (next === undefined) return startRevealing(state, now);
  return { ...base(state), phase: 'handoff', round: state.round, picks: state.picks, next };
}

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

function startRevealing(state: SelectingState, now: number): MatchState {
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
      if (state.turn !== null && state.turn !== action.playerId) return state;
      const current = state.picks[action.playerId];
      if (!current || isDone(current)) return state;
      const selected = togglePick(current.selected, action.position, state.round.grid.length);
      if (selected === current.selected) return state;
      return { ...state, picks: { ...state.picks, [action.playerId]: { ...current, selected } } };
    }

    case 'SUBMIT_SELECTION': {
      if (state.phase !== 'selecting') return state;
      if (state.turn !== null && state.turn !== action.playerId) return state;
      const current = state.picks[action.playerId];
      if (!current || isDone(current) || current.selected.length !== GAME_CONFIG.picksRequired) return state;
      const next: SelectingState = {
        ...state,
        picks: { ...state.picks, [action.playerId]: { ...current, locked: true } },
      };
      if (state.turnMode === 'sequential') return finishTurn(next, action.now);
      const everyoneLocked = state.players.every((p) => next.picks[p.id]?.locked);
      return everyoneLocked ? startRevealing(next, action.now) : next;
    }

    case 'BEGIN_TURN': {
      if (state.phase !== 'handoff' || state.next !== action.playerId) return state;
      return {
        ...base(state),
        phase: 'selecting',
        round: state.round,
        picks: state.picks,
        turn: state.next,
        endsAt: action.now + state.round.settings.selectSeconds * 1000,
      };
    }

    case 'PHASE_TIMEOUT': {
      if (state.phase !== action.phase || state.round.id !== action.roundId) return state;
      switch (state.phase) {
        case 'memorizing': {
          const picks = emptyPicks(state.players);
          if (state.turnMode === 'sequential') {
            const first = turnOrder(state)[0];
            if (first === undefined) return state;
            return { ...base(state), phase: 'handoff', round: state.round, picks, next: first };
          }
          return {
            ...base(state),
            phase: 'selecting',
            round: state.round,
            picks,
            turn: null,
            endsAt: action.now + state.round.settings.selectSeconds * 1000,
          };
        }
        case 'selecting': {
          // A timer from a different turn is stale.
          if ((action.turn ?? null) !== state.turn) return state;
          if (state.turn === null) return startRevealing(state, action.now);
          const current = state.picks[state.turn];
          if (!current) return state;
          return finishTurn(
            { ...state, picks: { ...state.picks, [state.turn]: { ...current, timedOut: true } } },
            action.now,
          );
        }
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
      // One device: a single press readies everyone.
      if (state.turnMode === 'sequential') return { ...state, ready: state.players.map((p) => p.id) };
      if (state.ready.includes(action.playerId)) return state;
      return { ...state, ready: [...state.ready, action.playerId] };
    }
  }
}

// ───────────── Per-player view ─────────────

export type OpponentStatus = 'memorizing' | 'selecting' | 'locked' | 'up-next' | 'revealed' | 'waiting';

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
  readonly turnMode: TurnMode;
  /** Sequential: whose turn it is (selecting) or who is up next (handoff). Otherwise null. */
  readonly turn: PlayerId | null;
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
  const turn = state.phase === 'selecting' ? state.turn : state.phase === 'handoff' ? state.next : null;
  const common = {
    me,
    players: state.players,
    ties: state.ties,
    settings,
    phase: state.phase,
    turnMode: state.turnMode,
    turn,
  };

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

  const hidden = state.phase === 'selecting' || state.phase === 'handoff';
  const grid = hidden ? state.round.grid.map(() => null) : state.round.grid;
  const community = state.phase === 'memorizing' ? null : state.round.community;

  const finalFor = (id: PlayerId) =>
    state.phase === 'revealing' || state.phase === 'results' ? (state.selections[id] ?? null) : null;

  const liveStatus = (id: PlayerId, picks: Readonly<Record<PlayerId, PlayerPicks>>): OpponentStatus =>
    isDone(picks[id]) ? 'locked' : turn !== null && turn !== id ? 'up-next' : 'selecting';

  const opponents: OpponentView[] = state.players
    .filter((p) => p.id !== me)
    .map((p) => {
      if (state.phase === 'memorizing') return { id: p.id, name: p.name, status: 'memorizing', picks: null };
      if (state.phase === 'selecting' || state.phase === 'handoff') {
        return { id: p.id, name: p.name, status: liveStatus(p.id, state.picks), picks: null };
      }
      return { id: p.id, name: p.name, status: 'revealed', picks: finalFor(p.id)?.positions ?? [] };
    });

  const mine = state.phase === 'selecting' || state.phase === 'handoff' ? state.picks[me] : undefined;

  return {
    ...common,
    roundId: state.round.id,
    endsAt: 'endsAt' in state ? state.endsAt : null,
    grid,
    community,
    myPicks: mine?.selected ?? finalFor(me)?.positions ?? [],
    myLocked: mine ? isDone(mine) : state.phase !== 'memorizing',
    opponents,
    results:
      state.phase === 'results'
        ? { outcomes: state.outcomes, selections: state.selections, winner: state.winner, ready: state.ready }
        : null,
  };
}
