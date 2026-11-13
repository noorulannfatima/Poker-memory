import { describe, expect, it } from 'vitest';
import { hand } from '../test/cards';
import { createSeededRandom } from './deck';
import { dealRound } from './deal';
import { GAME_CONFIG } from './gameConfig';
import { gameReducer, initialGameState, isGridFaceUp, selectedPositions, type GameAction, type GameState } from './gameReducer';
import type { Round } from './gameTypes';
import { compareOutcomes, findBestPick, scoreRound } from './scoring';

const T0 = 1_000_000;
const round = dealRound(1, createSeededRandom(11));

function run(actions: GameAction[], start: GameState = initialGameState): GameState {
  return actions.reduce(gameReducer, start);
}

function toSelecting(r: Round = round): GameState {
  return run([
    { type: 'START_ROUND', round: r, now: T0 },
    { type: 'PHASE_TIMEOUT', phase: 'memorizing', roundId: r.id, now: T0 + 20_000 },
  ]);
}

describe('gameReducer — round lifecycle', () => {
  it('starts a round in the memorizing phase with the configured duration', () => {
    const state = gameReducer(initialGameState, { type: 'START_ROUND', round, now: T0 });
    expect(state.phase).toBe('memorizing');
    if (state.phase !== 'memorizing') throw new Error();
    expect(state.endsAt).toBe(T0 + GAME_CONFIG.memorizeSeconds * 1000);
    expect(isGridFaceUp(state)).toBe(true);
  });

  it('moves to selecting when memorization ends and flips the grid down', () => {
    const state = toSelecting();
    expect(state.phase).toBe('selecting');
    if (state.phase !== 'selecting') throw new Error();
    expect(state.selected).toEqual([]);
    expect(state.endsAt).toBe(T0 + 20_000 + GAME_CONFIG.selectSeconds * 1000);
    expect(isGridFaceUp(state)).toBe(false);
  });

  it('runs a full round: select, submit, reveal, results', () => {
    const state = run(
      [
        { type: 'TOGGLE_POSITION', position: 3 },
        { type: 'TOGGLE_POSITION', position: 9 },
        { type: 'SUBMIT_SELECTION', now: T0 + 25_000 },
      ],
      toSelecting(),
    );
    expect(state.phase).toBe('revealing');
    const done = gameReducer(state, { type: 'PHASE_TIMEOUT', phase: 'revealing', roundId: round.id, now: T0 + 27_000 });
    expect(done.phase).toBe('results');
    if (done.phase !== 'results') throw new Error();
    expect(done.selection).toEqual({ positions: [3, 9], reason: 'submitted' });
    expect(done.outcome.kind).toBe('complete');
    expect(selectedPositions(done)).toEqual([3, 9]);
  });

  it('returns to the lobby', () => {
    expect(gameReducer(toSelecting(), { type: 'BACK_TO_LOBBY' })).toEqual(initialGameState);
  });

  it('play again starts a fresh round from results', () => {
    const results = run(
      [
        { type: 'PHASE_TIMEOUT', phase: 'selecting', roundId: round.id, now: T0 + 50_000 },
        { type: 'PHASE_TIMEOUT', phase: 'revealing', roundId: round.id, now: T0 + 52_000 },
      ],
      toSelecting(),
    );
    expect(results.phase).toBe('results');
    const next = dealRound(2, createSeededRandom(12));
    const state = gameReducer(results, { type: 'START_ROUND', round: next, now: T0 + 60_000 });
    expect(state.phase).toBe('memorizing');
    if (state.phase !== 'memorizing') throw new Error();
    expect(state.round).toBe(next);
    expect(selectedPositions(state)).toEqual([]);
  });

  it('ignores START_ROUND while a round is in progress', () => {
    const selecting = toSelecting();
    expect(gameReducer(selecting, { type: 'START_ROUND', round: dealRound(9), now: T0 })).toBe(selecting);
  });
});

describe('gameReducer — selection rules', () => {
  it('does not allow selection while memorizing', () => {
    const memorizing = gameReducer(initialGameState, { type: 'START_ROUND', round, now: T0 });
    expect(gameReducer(memorizing, { type: 'TOGGLE_POSITION', position: 0 })).toBe(memorizing);
  });

  it('toggles a position on and off', () => {
    const on = gameReducer(toSelecting(), { type: 'TOGGLE_POSITION', position: 5 });
    expect(selectedPositions(on)).toEqual([5]);
    const off = gameReducer(on, { type: 'TOGGLE_POSITION', position: 5 });
    expect(selectedPositions(off)).toEqual([]);
  });

  it('caps the selection at two positions; a third must replace via deselect', () => {
    const state = run(
      [
        { type: 'TOGGLE_POSITION', position: 1 },
        { type: 'TOGGLE_POSITION', position: 2 },
        { type: 'TOGGLE_POSITION', position: 3 },
      ],
      toSelecting(),
    );
    expect(selectedPositions(state)).toEqual([1, 2]);
    const swapped = run(
      [
        { type: 'TOGGLE_POSITION', position: 1 },
        { type: 'TOGGLE_POSITION', position: 3 },
      ],
      state,
    );
    expect(selectedPositions(swapped)).toEqual([2, 3]);
  });

  it('ignores out-of-range positions', () => {
    const selecting = toSelecting();
    expect(gameReducer(selecting, { type: 'TOGGLE_POSITION', position: 16 })).toBe(selecting);
    expect(gameReducer(selecting, { type: 'TOGGLE_POSITION', position: -1 })).toBe(selecting);
    expect(gameReducer(selecting, { type: 'TOGGLE_POSITION', position: 1.5 })).toBe(selecting);
  });

  it('rejects submission with fewer than two picks', () => {
    const one = gameReducer(toSelecting(), { type: 'TOGGLE_POSITION', position: 4 });
    expect(gameReducer(one, { type: 'SUBMIT_SELECTION', now: T0 })).toBe(one);
  });

  it('prevents double submission and changes after submitting', () => {
    const revealing = run(
      [
        { type: 'TOGGLE_POSITION', position: 1 },
        { type: 'TOGGLE_POSITION', position: 2 },
        { type: 'SUBMIT_SELECTION', now: T0 + 21_000 },
      ],
      toSelecting(),
    );
    expect(gameReducer(revealing, { type: 'SUBMIT_SELECTION', now: T0 + 21_001 })).toBe(revealing);
    expect(gameReducer(revealing, { type: 'TOGGLE_POSITION', position: 7 })).toBe(revealing);
  });
});

describe('gameReducer — timers', () => {
  it('finalizes a partial selection on timeout as incomplete', () => {
    const state = run(
      [
        { type: 'TOGGLE_POSITION', position: 6 },
        { type: 'PHASE_TIMEOUT', phase: 'selecting', roundId: round.id, now: T0 + 50_000 },
        { type: 'PHASE_TIMEOUT', phase: 'revealing', roundId: round.id, now: T0 + 52_000 },
      ],
      toSelecting(),
    );
    if (state.phase !== 'results') throw new Error(`expected results, got ${state.phase}`);
    expect(state.selection).toEqual({ positions: [6], reason: 'timeout' });
    expect(state.outcome).toMatchObject({ kind: 'incomplete', positions: [6], missing: 1 });
  });

  it('finalizes a full selection on timeout as a complete hand', () => {
    const state = run(
      [
        { type: 'TOGGLE_POSITION', position: 0 },
        { type: 'TOGGLE_POSITION', position: 15 },
        { type: 'PHASE_TIMEOUT', phase: 'selecting', roundId: round.id, now: T0 + 50_000 },
        { type: 'PHASE_TIMEOUT', phase: 'revealing', roundId: round.id, now: T0 + 52_000 },
      ],
      toSelecting(),
    );
    if (state.phase !== 'results') throw new Error();
    expect(state.selection.reason).toBe('timeout');
    expect(state.outcome.kind).toBe('complete');
  });

  it('ignores a stale timer from a previous phase', () => {
    const selecting = toSelecting();
    const late = gameReducer(selecting, { type: 'PHASE_TIMEOUT', phase: 'memorizing', roundId: round.id, now: T0 });
    expect(late).toBe(selecting);
  });

  it('ignores a timer from a previous round', () => {
    const selecting = toSelecting();
    const stale = gameReducer(selecting, { type: 'PHASE_TIMEOUT', phase: 'selecting', roundId: round.id - 1, now: T0 });
    expect(stale).toBe(selecting);
  });

  it('ignores timers in the lobby', () => {
    expect(
      gameReducer(initialGameState, { type: 'PHASE_TIMEOUT', phase: 'selecting', roundId: 1, now: T0 }),
    ).toBe(initialGameState);
  });
});

describe('scoring', () => {
  // Community 9♥ 9♣ 2♦. Grid contains a third and fourth nine, so the best
  // possible hand is four of a kind.
  const fixed: Round = {
    id: 99,
    community: hand('9h 9c 2d'),
    grid: hand('9s 9d Ah Kc 3s 4s 5s 6d 7d 8c Tc Jh Qh Ks 2h 3d'),
  };

  it('evaluates the five cards made by the community and the two picks', () => {
    const outcome = scoreRound(fixed, { positions: [2, 3], reason: 'submitted' });
    if (outcome.kind !== 'complete') throw new Error();
    expect(outcome.hand.category).toBe('pair');
    expect(outcome.hand.description).toBe('Pair of Nines with A, K, 2 kickers.');
    expect(outcome.isBest).toBe(false);
  });

  it('finds the best possible pick on the grid', () => {
    const best = findBestPick(fixed);
    expect(best.hand.category).toBe('four-of-a-kind');
    expect(best.positions).toEqual([0, 1]);
  });

  it('marks the optimal pick, regardless of pick order', () => {
    const outcome = scoreRound(fixed, { positions: [1, 0], reason: 'submitted' });
    expect(outcome.kind === 'complete' && outcome.isBest).toBe(true);
  });

  it('ranks incomplete outcomes below any complete hand and ties them with each other', () => {
    const complete = scoreRound(fixed, { positions: [4, 5], reason: 'submitted' });
    const incomplete = scoreRound(fixed, { positions: [4], reason: 'timeout' });
    const empty = scoreRound(fixed, { positions: [], reason: 'timeout' });
    expect(compareOutcomes(complete, incomplete)).toBeGreaterThan(0);
    expect(compareOutcomes(incomplete, complete)).toBeLessThan(0);
    expect(compareOutcomes(incomplete, empty)).toBe(0);
    expect(empty).toMatchObject({ kind: 'incomplete', missing: 2 });
  });
});
