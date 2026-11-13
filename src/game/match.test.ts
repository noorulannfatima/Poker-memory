import { describe, expect, it } from 'vitest';
import { hand } from '../test/cards';
import { createSeededRandom } from './deck';
import { dealRound } from './deal';
import { DIFFICULTIES, GAME_CONFIG } from './gameConfig';
import type { Round } from './gameTypes';
import { createMatch, matchReducer, sharedScreenViewer, turnOrder, viewFor, type MatchAction, type MatchState } from './match';

const T0 = 5_000_000;
const A = 'ana';
const B = 'ben';

function newMatch(): MatchState {
  return createMatch({
    players: [
      { id: A, name: 'Ana' },
      { id: B, name: 'Ben' },
    ],
    difficulty: 'medium',
  });
}

function run(state: MatchState, actions: MatchAction[]): MatchState {
  return actions.reduce(matchReducer, state);
}

// Community 9♥ 9♣ 2♦. Positions 0,1 = 9♠ 9♦ (quads), 2,3 = A♥ K♣ (pair of nines).
const fixed: Round = {
  id: 1,
  settings: DIFFICULTIES.medium,
  community: hand('9h 9c 2d'),
  grid: hand('9s 9d Ah Kc 3s 4s 5s 6d 7d 8c Tc Jh Qh Ks 2h 3d'),
};

function toSelecting(round: Round = fixed, state: MatchState = newMatch()): MatchState {
  return run(state, [
    { type: 'START_ROUND', round, now: T0 },
    { type: 'PHASE_TIMEOUT', phase: 'memorizing', roundId: round.id, now: T0 + 20_000 },
  ]);
}

const pick = (playerId: string, ...positions: number[]): MatchAction[] =>
  positions.map((position) => ({ type: 'TOGGLE_POSITION', playerId, position }));
const submit = (playerId: string, now = T0 + 25_000): MatchAction => ({ type: 'SUBMIT_SELECTION', playerId, now });
const reveal = (roundId = fixed.id): MatchAction => ({ type: 'PHASE_TIMEOUT', phase: 'revealing', roundId, now: T0 + 30_000 });

describe('matchReducer — simultaneous round', () => {
  it('starts waiting with an empty tally', () => {
    const state = newMatch();
    expect(state.phase).toBe('waiting');
    expect(state.players.map((p) => p.wins)).toEqual([0, 0]);
    expect(state.ties).toBe(0);
  });

  it('gives every player their own picks under one timer', () => {
    const state = run(toSelecting(), [...pick(A, 0, 1), ...pick(B, 2)]);
    if (state.phase !== 'selecting') throw new Error();
    expect(state.endsAt).toBe(T0 + 20_000 + DIFFICULTIES.medium.selectSeconds * 1000);
    expect(state.picks[A]?.selected).toEqual([0, 1]);
    expect(state.picks[B]?.selected).toEqual([2]);
  });

  it('allows both players to pick the same card', () => {
    const state = run(toSelecting(), [...pick(A, 0), ...pick(B, 0)]);
    if (state.phase !== 'selecting') throw new Error();
    expect(state.picks[A]?.selected).toEqual([0]);
    expect(state.picks[B]?.selected).toEqual([0]);
  });

  it('waits for everyone to lock in, then reveals and scores the winner', () => {
    const oneLocked = run(toSelecting(), [...pick(A, 0, 1), submit(A), ...pick(B, 2, 3)]);
    expect(oneLocked.phase).toBe('selecting');
    // A locked player can no longer change picks.
    expect(run(oneLocked, pick(A, 5))).toBe(oneLocked);

    const revealing = run(oneLocked, [submit(B)]);
    expect(revealing.phase).toBe('revealing');
    const results = run(revealing, [reveal()]);
    if (results.phase !== 'results') throw new Error();
    expect(results.outcomes[A]).toMatchObject({ kind: 'complete' });
    expect(results.winner).toBe(A);
    expect(results.players.find((p) => p.id === A)?.wins).toBe(1);
    expect(results.players.find((p) => p.id === B)?.wins).toBe(0);
    expect(results.ties).toBe(0);
  });

  it('counts equal hands as a tie', () => {
    const results = run(toSelecting(), [...pick(A, 0, 1), submit(A), ...pick(B, 1, 0), submit(B), reveal()]);
    if (results.phase !== 'results') throw new Error();
    expect(results.winner).toBeNull();
    expect(results.ties).toBe(1);
  });

  it('on timeout, locks in partial picks: a complete hand beats an incomplete one', () => {
    const results = run(toSelecting(), [
      ...pick(A, 4),
      ...pick(B, 2, 3),
      { type: 'PHASE_TIMEOUT', phase: 'selecting', roundId: fixed.id, now: T0 + 50_000 },
      reveal(),
    ]);
    if (results.phase !== 'results') throw new Error();
    expect(results.selections[A]).toEqual({ positions: [4], reason: 'timeout' });
    expect(results.outcomes[A]).toMatchObject({ kind: 'incomplete' });
    expect(results.winner).toBe(B);
  });

  it('two incomplete hands tie', () => {
    const results = run(toSelecting(), [
      { type: 'PHASE_TIMEOUT', phase: 'selecting', roundId: fixed.id, now: T0 + 50_000 },
      reveal(),
    ]);
    if (results.phase !== 'results') throw new Error();
    expect(results.winner).toBeNull();
    expect(results.ties).toBe(1);
  });

  it('rejects incomplete submissions and moves from unknown players', () => {
    const selecting = run(toSelecting(), pick(A, 0));
    expect(run(selecting, [submit(A)])).toBe(selecting);
    expect(run(selecting, pick('zed', 3))).toBe(selecting);
    expect(run(selecting, [submit('zed')])).toBe(selecting);
  });
});

describe('matchReducer — next round and tally', () => {
  function finished(): MatchState {
    return run(toSelecting(), [...pick(A, 0, 1), submit(A), ...pick(B, 2, 3), submit(B), reveal()]);
  }

  it('starts the next round only when every player is ready, keeping the tally', () => {
    const next = { ...fixed, id: 2 };
    const results = finished();
    const startEarly = run(results, [{ type: 'NEXT_ROUND', playerId: A }, { type: 'START_ROUND', round: next, now: T0 }]);
    expect(startEarly.phase).toBe('results');

    const started = run(startEarly, [{ type: 'NEXT_ROUND', playerId: B }, { type: 'START_ROUND', round: next, now: T0 }]);
    expect(started.phase).toBe('memorizing');
    expect(started.players.find((p) => p.id === A)?.wins).toBe(1);

    const second = run(started, [
      { type: 'PHASE_TIMEOUT', phase: 'memorizing', roundId: 2, now: T0 + 1 },
      ...pick(A, 2, 3),
      submit(A),
      ...pick(B, 0, 1),
      submit(B),
      reveal(2),
    ]);
    if (second.phase !== 'results') throw new Error();
    expect(second.winner).toBe(B);
    expect(second.players.map((p) => p.wins)).toEqual([1, 1]);
  });

  it('ignores duplicate ready presses and presses from unknown players', () => {
    const results = finished();
    const once = run(results, [{ type: 'NEXT_ROUND', playerId: A }]);
    expect(run(once, [{ type: 'NEXT_ROUND', playerId: A }])).toBe(once);
    expect(run(once, [{ type: 'NEXT_ROUND', playerId: 'zed' }])).toBe(once);
  });

  it('rejects a round dealt at a different difficulty', () => {
    const state = newMatch();
    const easy = dealRound(1, createSeededRandom(1), 'easy');
    expect(matchReducer(state, { type: 'START_ROUND', round: easy, now: T0 })).toBe(state);
  });

  it('ignores stale timeouts from another phase or round', () => {
    const selecting = toSelecting();
    expect(matchReducer(selecting, { type: 'PHASE_TIMEOUT', phase: 'memorizing', roundId: 1, now: T0 })).toBe(selecting);
    expect(matchReducer(selecting, { type: 'PHASE_TIMEOUT', phase: 'selecting', roundId: 99, now: T0 })).toBe(selecting);
  });
});

describe('viewFor', () => {
  it('shows the grid face-up while memorizing but hides community cards', () => {
    const view = viewFor(run(newMatch(), [{ type: 'START_ROUND', round: fixed, now: T0 }]), A);
    expect(view.grid).toEqual(fixed.grid);
    expect(view.community).toBeNull();
    expect(view.opponents[0]?.status).toBe('memorizing');
  });

  it('never exposes face-down cards or the opponent’s picks while selecting', () => {
    const state = run(toSelecting(), [...pick(A, 0), ...pick(B, 2, 3), submit(B)]);
    const view = viewFor(state, A);
    expect(view.grid.every((card) => card === null)).toBe(true);
    expect(view.community).toEqual(fixed.community);
    expect(view.myPicks).toEqual([0]);
    expect(view.myLocked).toBe(false);
    expect(view.opponents).toEqual([{ id: B, name: 'Ben', status: 'locked', picks: null }]);
    // No face-down grid card appears anywhere in what would be rendered or sent.
    const serialized = JSON.stringify(view);
    for (const card of fixed.grid) expect(serialized).not.toContain(JSON.stringify(card));
    expect(viewFor(state, B).myLocked).toBe(true);
  });

  it('reveals everything from the reveal onwards', () => {
    const state = run(toSelecting(), [...pick(A, 0, 1), submit(A), ...pick(B, 2, 3), submit(B)]);
    const revealing = viewFor(state, A);
    expect(revealing.grid).toEqual(fixed.grid);
    expect(revealing.opponents[0]).toMatchObject({ status: 'revealed', picks: [2, 3] });
    const results = viewFor(run(state, [reveal()]), B);
    expect(results.results?.winner).toBe(A);
    expect(results.myPicks).toEqual([2, 3]);
  });

  it('has no grid before the first deal', () => {
    const view = viewFor(newMatch(), A);
    expect(view.grid).toEqual([]);
    expect(view.roundId).toBeNull();
    expect(GAME_CONFIG.picksRequired).toBe(2);
  });
});

describe('matchReducer — sequential (one device)', () => {
  const SELECT_MS = DIFFICULTIES.medium.selectSeconds * 1000;

  function newSequential(): MatchState {
    return createMatch({
      players: [
        { id: A, name: 'Ana' },
        { id: B, name: 'Ben' },
      ],
      difficulty: 'medium',
      turnMode: 'sequential',
    });
  }

  /** Start the round and let memorizing time out: lands on the first handoff. */
  const toHandoff = (round: Round = fixed) => toSelecting(round, newSequential());
  const begin = (playerId: string, now = T0 + 21_000): MatchAction => ({ type: 'BEGIN_TURN', playerId, now });
  const turnTimeout = (turn: string | null, now: number): MatchAction => ({
    type: 'PHASE_TIMEOUT',
    phase: 'selecting',
    roundId: fixed.id,
    now,
    turn,
  });
  const anaTurn = (): MatchAction[] => [begin(A), ...pick(A, 0, 1), submit(A)];
  const benTurn = (): MatchAction[] => [begin(B), ...pick(B, 2, 3), submit(B)];

  it('ends memorizing in a handoff to the first player, with no timer running', () => {
    const state = toHandoff();
    if (state.phase !== 'handoff') throw new Error(`expected handoff, got ${state.phase}`);
    expect(state.next).toBe(A);
    expect('endsAt' in state).toBe(false);
  });

  it('lets only the player whose turn it is pick, each with a full timer', () => {
    const handoff = toHandoff();
    expect(run(handoff, pick(A, 0))).toBe(handoff); // no picking during a handoff
    expect(run(handoff, [begin(B)])).toBe(handoff); // not Ben's turn

    const aTurn = run(handoff, [begin(A, T0 + 30_000)]);
    if (aTurn.phase !== 'selecting') throw new Error();
    expect(aTurn.turn).toBe(A);
    expect(aTurn.endsAt).toBe(T0 + 30_000 + SELECT_MS);
    expect(run(aTurn, pick(B, 3))).toBe(aTurn);

    const bHandoff = run(aTurn, [...pick(A, 0, 1), submit(A, T0 + 35_000)]);
    if (bHandoff.phase !== 'handoff') throw new Error();
    expect(bHandoff.next).toBe(B);

    const bTurn = run(bHandoff, [begin(B, T0 + 60_000)]);
    if (bTurn.phase !== 'selecting') throw new Error();
    expect(bTurn.turn).toBe(B);
    expect(bTurn.endsAt).toBe(T0 + 60_000 + SELECT_MS);
    expect(run(bTurn, pick(A, 5))).toBe(bTurn); // Ana has had her turn

    const revealing = run(bTurn, [...pick(B, 2, 3), submit(B, T0 + 65_000)]);
    expect(revealing.phase).toBe('revealing');
    const results = run(revealing, [reveal()]);
    if (results.phase !== 'results') throw new Error();
    expect(results.selections[A]).toEqual({ positions: [0, 1], reason: 'submitted' });
    expect(results.winner).toBe(A); // quads beat a pair
  });

  it('a turn timeout locks in the partial picks and passes the device on', () => {
    const aTurn = run(toHandoff(), [begin(A), ...pick(A, 4)]);
    const bHandoff = run(aTurn, [turnTimeout(A, T0 + 60_000)]);
    if (bHandoff.phase !== 'handoff') throw new Error();
    expect(bHandoff.next).toBe(B);

    const results = run(bHandoff, [...benTurn(), reveal()]);
    if (results.phase !== 'results') throw new Error();
    expect(results.selections[A]).toEqual({ positions: [4], reason: 'timeout' });
    expect(results.winner).toBe(B);
  });

  it('both players timing out goes to reveal and ends in a tie', () => {
    const aTurn = run(toHandoff(), [begin(A)]);
    const bHandoff = run(aTurn, [turnTimeout(A, T0 + 60_000)]);
    if (bHandoff.phase !== 'handoff') throw new Error();
    const bTurn = run(bHandoff, [begin(B, T0 + 70_000)]);
    const revealing = run(bTurn, [turnTimeout(B, T0 + 130_000)]);
    expect(revealing.phase).toBe('revealing');
    const results = run(revealing, [reveal()]);
    if (results.phase !== 'results') throw new Error();
    expect(results.selections[A]).toEqual({ positions: [], reason: 'timeout' });
    expect(results.selections[B]).toEqual({ positions: [], reason: 'timeout' });
    expect(results.winner).toBeNull();
    expect(results.ties).toBe(1);
  });

  it('ignores a selecting timeout that belongs to another turn', () => {
    const bTurn = run(toHandoff(), [...anaTurn(), begin(B)]);
    expect(run(bTurn, [turnTimeout(A, T0 + 99_000)])).toBe(bTurn);
    expect(run(bTurn, [turnTimeout(null, T0 + 99_000)])).toBe(bTurn);
  });

  it('one Next round press readies both players, and the first selector alternates', () => {
    const results = run(toHandoff(), [...anaTurn(), ...benTurn(), reveal()]);
    expect(turnOrder(results)).toEqual([B, A]);

    const next = { ...fixed, id: 2 };
    const handoff = run(results, [
      { type: 'NEXT_ROUND', playerId: A },
      { type: 'START_ROUND', round: next, now: T0 + 100_000 },
      { type: 'PHASE_TIMEOUT', phase: 'memorizing', roundId: next.id, now: T0 + 120_000 },
    ]);
    if (handoff.phase !== 'handoff') throw new Error(`expected handoff, got ${handoff.phase}`);
    expect(handoff.next).toBe(B);
  });

  it('simultaneous matches are unaffected: no handoff and no turn', () => {
    const selecting = toSelecting();
    if (selecting.phase !== 'selecting') throw new Error();
    expect(selecting.turn).toBeNull();
    expect(viewFor(selecting, A).turn).toBeNull();
    expect(viewFor(selecting, A).turnMode).toBe('simultaneous');
  });

  describe('views', () => {
    it('hides the grid and the previous player’s picks during the handoff', () => {
      const view = viewFor(run(toHandoff(), anaTurn()), B);
      expect(view.phase).toBe('handoff');
      expect(view.turn).toBe(B);
      expect(view.grid.every((card) => card === null)).toBe(true);
      expect(view.myPicks).toEqual([]);
      expect(view.opponents[0]).toMatchObject({ id: A, status: 'locked', picks: null });
    });

    it('tells the selecting player who picks next', () => {
      const view = viewFor(run(toHandoff(), [begin(A)]), A);
      expect(view.turnMode).toBe('sequential');
      expect(view.turn).toBe(A);
      expect(view.myLocked).toBe(false);
      expect(view.opponents[0]?.status).toBe('up-next');
    });

    it('sharedScreenViewer follows whoever holds the device', () => {
      expect(sharedScreenViewer(newSequential())).toBe(A);
      const handoff = toHandoff();
      expect(sharedScreenViewer(handoff)).toBe(A);
      const bHandoff = run(handoff, anaTurn());
      expect(sharedScreenViewer(bHandoff)).toBe(B);
      expect(sharedScreenViewer(run(bHandoff, [begin(B)]))).toBe(B);
      expect(sharedScreenViewer(run(bHandoff, [...benTurn()]))).toBe(A); // revealing: first player
    });
  });
});
