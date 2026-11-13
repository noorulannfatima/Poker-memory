# Two Players, One Device: Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task by task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a **Two players** (pass-and-play) mode. Both players memorize the grid together, then pick in turn on one device. A handoff screen between turns stops either player from seeing the other's picks.

**Architecture:** Extend the existing pure `matchReducer` (`src/game/match.ts`) with `turnMode: 'sequential'`. It adds a `handoff` phase, a `turn` field on `selecting` and a `BEGIN_TURN` action. A new `useLocalMatch` hook runs the engine in the browser and always shows the view of whoever holds the device. It feeds the same `MatchScreen` that Vs computer uses. `MatchScreen` learns to show a `HandoffScreen` and to name both players instead of saying "you" when the screen is shared.

**Tech Stack:** React 19, TypeScript 6 (strict), Vite 8, Tailwind 4, Vitest 4, React Testing Library.

**Spec:** `docs/superpowers/specs/2026-11-13-multiplayer-design.md`. This plan covers build-order steps 1 (the remaining sequential part) and 3. Step 2 (narrower component props) and Vs computer are already done (commit `22e9396`). The server and the online client get their own plan later.

## Global Constraints

- `src/game` stays free of React and browser code. Reducers are pure, and the dealt `Round` and `now` come in through actions.
- Face-down cards are `null` in anything that is rendered. Hidden card values must never reach the DOM.
- Timeout actions carry `phase` and `roundId`, plus `turn` for sequential selecting. Stale ones are ignored.
- The TS config is `strict`, `noUncheckedIndexedAccess`, `verbatimModuleSyntax` (use `import type` for types) and `erasableSyntaxOnly` (no enums or namespaces).
- Exactly 2 players. Rounds go on with a running tally. On one device, a single **Next round** press readies both players.
- Same-device rules: each player gets a full `selectSeconds` timer. The first selector moves along by one every round. No timer runs during a handoff.
- Existing Solo and Vs computer behavior and tests must not change.
- Before each commit, run `npm test`, `npm run lint` and `npm run typecheck`, and make sure all of them pass.
- End every commit message with:
  `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`

## File Structure

| File | Status | Responsibility |
|---|---|---|
| `src/game/match.ts` | modify | `sequential` turn mode, `handoff` phase, `BEGIN_TURN`, `turnOrder`, `sharedScreenViewer`, and `viewFor` fields `turnMode`, `turn` and the `up-next` status |
| `src/game/match.test.ts` | modify | Tests for sequential rounds and their views |
| `src/app/matchActions.ts` | create | The `MatchActions` interface shared by every match hook |
| `src/app/useComputerMatch.ts` | modify | Import `MatchActions` from the new file and provide a no-op `beginTurn` |
| `src/components/HandoffScreen.tsx` | create | Full-screen "Pass to Ben" cover between turns |
| `src/components/Scoreboard.tsx` | modify | Optional `active` marker for whoever is picking |
| `src/components/CardGrid.tsx` | modify | Optional `selectedLabel`, replacing the fixed "your pick" |
| `src/components/MatchResultPanel.tsx` | modify | `shared` prop that names players instead of saying "you" |
| `src/screens/MatchScreen.tsx` | modify | Render the handoff, the shared-screen wording, and the `up-next` status |
| `src/screens/MatchScreen.shared.test.tsx` | create | Tests for how `MatchScreen` renders a shared screen |
| `src/app/usePhaseTimer.ts` | modify | Pass the deadline's `turn` through to `onTimeout` |
| `src/app/playerNames.ts` | create | `normalizeNames`, `DEFAULT_NAMES` and `MAX_NAME_LENGTH` |
| `src/app/playerNames.test.ts` | create | Tests for the name rules |
| `src/app/useLocalMatch.ts` | create | Runs the sequential match in the browser |
| `src/screens/LocalMatchScreen.tsx` | create | Connects `useLocalMatch` to `MatchScreen` |
| `src/screens/LocalMatchScreen.test.tsx` | create | Tests of the whole flow through `<App>` |
| `src/game/gameConfig.ts` | modify | Add the `'local'` game mode |
| `src/screens/LobbyScreen.tsx` | modify | Third mode tile, name fields, mode-specific copy |
| `src/app/App.tsx` | modify | Hold the player names and route to `LocalMatchScreen` |
| `README.md`, `CLAUDE.md`, the spec | modify | Document the mode |

---

### Task 1: Sequential turns in the match engine

**Files:**
- Modify: `src/game/match.ts`
- Test: `src/game/match.test.ts`

**Interfaces:**
- Consumes: the existing `createMatch`, `matchReducer`, `viewFor`, `MatchState`, `MatchAction`, `PlayerPicks` and `OpponentStatus` from `src/game/match.ts`
- Produces (later tasks rely on these exact names):
  - `type TurnMode = 'simultaneous' | 'sequential'`
  - `PlayerPicks` gains `readonly timedOut: boolean`
  - The `selecting` phase gains `readonly turn: PlayerId | null` (null in simultaneous mode)
  - A new phase `{ phase: 'handoff'; round: Round; picks: Readonly<Record<PlayerId, PlayerPicks>>; next: PlayerId }` with no `endsAt`
  - A new action `{ type: 'BEGIN_TURN'; playerId: PlayerId; now: number }`
  - `PHASE_TIMEOUT` gains an optional `turn?: PlayerId | null`
  - `export function turnOrder(state: MatchState): PlayerId[]`
  - `export function sharedScreenViewer(state: MatchState): PlayerId`
  - `OpponentStatus` gains `'up-next'`
  - `MatchView` gains `readonly turnMode: TurnMode` and `readonly turn: PlayerId | null`

- [ ] **Step 1: Write the failing tests**

Change the import line at the top of `src/game/match.test.ts` to:

```ts
import { createMatch, matchReducer, sharedScreenViewer, turnOrder, viewFor, type MatchAction, type MatchState } from './match';
```

Append to the end of `src/game/match.test.ts`:

```ts
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
```

- [ ] **Step 2: Run the tests and confirm they fail**

Run: `npx vitest run src/game/match.test.ts`
Expected: FAIL. TypeScript and Vitest report that `sharedScreenViewer` and `turnOrder` are not exported, and the sequential tests fail.

- [ ] **Step 3: Implement sequential turns in `src/game/match.ts`**

3a. Replace the header comment's last paragraph and the `TurnMode` and `PlayerPicks` declarations:

```ts
/**
 * ...(keep the first two paragraphs)...
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
```

3b. In `PhaseState`, add `turn` to `selecting` and add the `handoff` member right after it:

```ts
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
```

3c. Replace the `MatchAction` union:

```ts
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
```

3d. Below `hasPlayer`, add the helpers:

```ts
type SelectingState = Extract<MatchState, { phase: 'selecting' }>;

const isDone = (picks: PlayerPicks | undefined): boolean => !!picks && (picks.locked || picks.timedOut);

function emptyPicks(players: readonly MatchPlayer[]): Record<PlayerId, PlayerPicks> {
  const picks: Record<PlayerId, PlayerPicks> = {};
  for (const { id } of players) picks[id] = { selected: [], locked: false, timedOut: false };
  return picks;
}

/**
 * Selection order for the current round (sequential mode). The first selector
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
```

Change the `startRevealing` signature to use the alias: `function startRevealing(state: SelectingState, now: number): MatchState`. Its body stays the same: `picks?.locked ? 'submitted' : 'timeout'` already gives `'timeout'` for a timed-out turn.

3e. In `matchReducer`, replace the `TOGGLE_POSITION` and `SUBMIT_SELECTION` cases and add `BEGIN_TURN`:

```ts
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
```

3f. In `PHASE_TIMEOUT`, replace the `memorizing` and `selecting` inner cases:

```ts
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
```

3g. Replace the `NEXT_ROUND` case:

```ts
    case 'NEXT_ROUND': {
      if (state.phase !== 'results' || !hasPlayer(state, action.playerId)) return state;
      // One device: a single press readies everyone.
      if (state.turnMode === 'sequential') return { ...state, ready: state.players.map((p) => p.id) };
      if (state.ready.includes(action.playerId)) return state;
      return { ...state, ready: [...state.ready, action.playerId] };
    }
```

3h. In the view section, add `'up-next'` to `OpponentStatus`, and add two fields to `MatchView` right after `me`:

```ts
export type OpponentStatus = 'memorizing' | 'selecting' | 'locked' | 'up-next' | 'revealed' | 'waiting';
```

```ts
  readonly turnMode: TurnMode;
  /** Sequential: whose turn it is (selecting) or who is up next (handoff). Otherwise null. */
  readonly turn: PlayerId | null;
```

3i. Replace the body of `viewFor` from its first line down to just before `const finalFor`:

```ts
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
    // (unchanged waiting branch)
  }

  const hidden = state.phase === 'selecting' || state.phase === 'handoff';
  const grid = hidden ? state.round.grid.map(() => null) : state.round.grid;
  const community = state.phase === 'memorizing' ? null : state.round.community;
```

Then replace the `opponents` and `mine` computations, and the `myLocked` line, with:

```ts
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
```

```ts
    myLocked: mine ? isDone(mine) : state.phase !== 'memorizing',
```

- [ ] **Step 4: Run the tests and confirm they pass**

Run: `npx vitest run src/game/match.test.ts`
Expected: PASS, both the existing simultaneous tests and the new sequential ones.

Run: `npm run typecheck`
Expected: errors only in `src/screens/MatchScreen.tsx` (`announcement` has no `'handoff'` case, and `GameHeader` receives `'handoff'`) and in `OpponentStatus`'s `Record` (missing `'up-next'`). Task 2 fixes these. If anything else fails, fix it here.

To keep this commit green, make the smallest UI patch in `src/screens/MatchScreen.tsx`:
- in the `OpponentStatus` text record, add `` 'up-next': `${opponent.name} picks next.`, ``
- in `announcement`, add `case 'handoff': return 'Turn over. Pass the device to the next player.';`
- right after the `waiting` early return, add `if (view.phase === 'handoff') return null;`

- [ ] **Step 5: Run the full suite and commit**

Run: `npm test && npm run lint && npm run typecheck`
Expected: all three succeed.

```bash
git add src/game/match.ts src/game/match.test.ts src/screens/MatchScreen.tsx
git commit -m "feat(match): sequential turns with handoff for one-device play

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Shared-screen rendering (handoff, names instead of "you")

**Files:**
- Create: `src/app/matchActions.ts`
- Create: `src/components/HandoffScreen.tsx`
- Modify: `src/app/useComputerMatch.ts`
- Modify: `src/components/Scoreboard.tsx`
- Modify: `src/components/CardGrid.tsx`
- Modify: `src/components/MatchResultPanel.tsx`
- Modify: `src/screens/MatchScreen.tsx`
- Test: `src/screens/MatchScreen.shared.test.tsx`

**Interfaces:**
- Consumes (from Task 1): `sharedScreenViewer`, `viewFor`, `MatchView.turnMode`, `MatchView.turn`, `OpponentStatus 'up-next'`, the `BEGIN_TURN` action
- Produces:
  - `src/app/matchActions.ts`: `export interface MatchActions { toggle(position: number): void; submit(): void; nextRound(): void; beginTurn(): void }`
  - `HandoffScreen` props: `{ nextName: string; otherName: string; firstTurn: boolean; scoreboard?: ReactNode; onReady: () => void; onLeave: () => void }`
  - `Scoreboard` prop: `active?: PlayerId | null`. Its aria-label gets `, <name> to pick` when set.
  - `CardGrid` prop: `selectedLabel?: string` (default `'your pick'`)
  - `MatchResultPanel` prop: `shared?: boolean`

- [ ] **Step 1: Write the failing test**

Create `src/screens/MatchScreen.shared.test.tsx`:

```tsx
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { MatchActions } from '../app/matchActions';
import { DIFFICULTIES } from '../game/gameConfig';
import type { Round } from '../game/gameTypes';
import { createMatch, matchReducer, sharedScreenViewer, viewFor, type MatchAction, type MatchState } from '../game/match';
import { hand } from '../test/cards';
import { MatchScreen } from './MatchScreen';

const T0 = Date.now();

// Community 9♥ 9♣ 2♦. Positions 0,1 = 9♠ 9♦ (quads), 2,3 = A♥ K♣ (pair of nines).
const fixed: Round = {
  id: 1,
  settings: DIFFICULTIES.medium,
  community: hand('9h 9c 2d'),
  grid: hand('9s 9d Ah Kc 3s 4s 5s 6d 7d 8c Tc Jh Qh Ks 2h 3d'),
};

function play(actions: MatchAction[]): MatchState {
  const start = createMatch({
    players: [
      { id: 'p1', name: 'Ana' },
      { id: 'p2', name: 'Ben' },
    ],
    difficulty: 'medium',
    turnMode: 'sequential',
  });
  const opening: MatchAction[] = [
    { type: 'START_ROUND', round: fixed, now: T0 },
    { type: 'PHASE_TIMEOUT', phase: 'memorizing', roundId: fixed.id, now: T0 },
  ];
  return [...opening, ...actions].reduce(matchReducer, start);
}

const turn = (playerId: string, a: number, b: number): MatchAction[] => [
  { type: 'BEGIN_TURN', playerId, now: T0 },
  { type: 'TOGGLE_POSITION', playerId, position: a },
  { type: 'TOGGLE_POSITION', playerId, position: b },
  { type: 'SUBMIT_SELECTION', playerId, now: T0 },
];

function renderShared(state: MatchState) {
  const actions: MatchActions = { toggle: vi.fn(), submit: vi.fn(), nextRound: vi.fn(), beginTurn: vi.fn() };
  const onLeave = vi.fn();
  render(<MatchScreen view={viewFor(state, sharedScreenViewer(state))} actions={actions} onLeave={onLeave} />);
  return { actions, onLeave };
}

describe('MatchScreen on a shared device', () => {
  it('the first handoff says who picks first, hides the grid and starts the turn on request', () => {
    const { actions } = renderShared(play([]));
    expect(screen.getByRole('heading', { name: 'Ana picks first' })).toBeInTheDocument();
    expect(screen.getByText(/Ben, look away while Ana picks/)).toBeInTheDocument();
    expect(screen.queryByRole('group', { name: 'Card grid' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: "I'm Ana, start my turn" }));
    expect(actions.beginTurn).toHaveBeenCalledOnce();
  });

  it('between turns asks to pass the device, and can leave', () => {
    const { onLeave } = renderShared(play(turn('p1', 0, 1)));
    expect(screen.getByRole('heading', { name: 'Pass to Ben' })).toBeInTheDocument();
    expect(screen.getByText(/Ana.s turn is over/)).toBeInTheDocument();
    expect(screen.queryByRole('group', { name: 'Card grid' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Leave match' }));
    expect(onLeave).toHaveBeenCalledOnce();
  });

  it('during a turn shows who picks next and marks the active player', () => {
    renderShared(play(turn('p1', 0, 1).slice(0, 1)));
    expect(screen.getByTestId('opponent-status')).toHaveTextContent('Ben picks next.');
    expect(screen.getByTestId('scoreboard')).toHaveAccessibleName('Score: Ana 0, Ben 0, 0 ties, Ana to pick');
    expect(screen.getByTestId('grid-slot-0')).toBeEnabled();
  });

  it('keeps the scoreboard in a fixed order on Ben’s turn', () => {
    renderShared(play([...turn('p1', 0, 1), { type: 'BEGIN_TURN', playerId: 'p2', now: T0 }]));
    expect(screen.getByTestId('scoreboard')).toHaveAccessibleName('Score: Ana 0, Ben 0, 0 ties, Ben to pick');
    expect(screen.getByTestId('opponent-status')).toHaveTextContent('Ana has locked in ✓');
  });

  it('results name both players instead of saying "you"', () => {
    renderShared(
      play([...turn('p1', 0, 1), ...turn('p2', 2, 3), { type: 'PHASE_TIMEOUT', phase: 'revealing', roundId: 1, now: T0 }]),
    );
    expect(screen.getByRole('heading', { name: 'Ana wins the round' })).toBeInTheDocument();
    expect(screen.getByRole('list', { name: 'Ana’s five-card hand' })).toBeInTheDocument();
    expect(screen.getByRole('list', { name: 'Ben’s five-card hand' })).toBeInTheDocument();
    expect(screen.getByTestId('grid-slot-0')).toHaveAccessibleName(/Ana's pick$/);
    expect(screen.getByTestId('grid-slot-2')).toHaveAccessibleName(/Ben's pick$/);
  });
});
```

- [ ] **Step 2: Run the test and confirm it fails**

Run: `npx vitest run src/screens/MatchScreen.shared.test.tsx`
Expected: FAIL. `src/app/matchActions.ts` can't be resolved, and the handoff currently renders nothing.

- [ ] **Step 3: Create `src/app/matchActions.ts`**

```ts
/** What a match screen can do, whichever hook (computer, one device, online) runs the match. */
export interface MatchActions {
  toggle: (position: number) => void;
  submit: () => void;
  nextRound: () => void;
  /** Sequential (one device): the player up next starts their turn. */
  beginTurn: () => void;
}
```

In `src/app/useComputerMatch.ts`:
- delete the `export interface MatchActions { … }` block
- add `import type { MatchActions } from './matchActions';`
- add `const beginTurn = useCallback(() => {}, []);` next to the other callbacks, with the comment `// Vs computer is simultaneous: there are no handoffs.`
- change the memo to `useMemo(() => ({ toggle, submit, nextRound, beginTurn }), [toggle, submit, nextRound, beginTurn])`

Then run `grep -rn "MatchActions" src` and change every remaining `from '../app/useComputerMatch'` import of `MatchActions` to `from '../app/matchActions'` (`src/screens/MatchScreen.tsx` at least).

- [ ] **Step 4: Create `src/components/HandoffScreen.tsx`**

```tsx
import { useEffect, useRef, type ReactNode } from 'react';

interface HandoffScreenProps {
  /** The player who picks next. */
  nextName: string;
  /** The other player, who should look away. */
  otherName: string;
  /** True before the first turn of a round (nobody has picked yet). */
  firstTurn: boolean;
  scoreboard?: ReactNode;
  onReady: () => void;
  onLeave: () => void;
}

/**
 * One device: covers the board between turns so neither player sees the
 * other's picks. No timer runs while it is shown.
 */
export function HandoffScreen({ nextName, otherName, firstTurn, scoreboard, onReady, onLeave }: HandoffScreenProps) {
  const headingRef = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    headingRef.current?.focus();
  }, []);

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col justify-center px-4 py-10 text-center">
      {scoreboard}
      <section
        className="fade-up rounded-2xl border border-line bg-charcoal/80 p-6"
        aria-labelledby="handoff-heading"
      >
        <p className="text-[0.7rem] font-semibold uppercase tracking-[0.18em] text-gold">
          {firstTurn ? 'Memorizing is over' : `${otherName}’s turn is over`}
        </p>
        <h1
          id="handoff-heading"
          ref={headingRef}
          tabIndex={-1}
          className="mt-1 font-display text-3xl font-semibold text-ink outline-none"
        >
          {firstTurn ? `${nextName} picks first` : `Pass to ${nextName}`}
        </h1>
        <p className="mt-3 leading-relaxed text-ink/85">
          {otherName}, look away while {nextName} picks. The timer starts when you tap below.
        </p>
        <button
          type="button"
          onClick={onReady}
          className="mt-6 w-full rounded-xl bg-gold px-5 py-3.5 text-base font-semibold text-night transition hover:bg-gold-bright active:translate-y-px"
        >
          I'm {nextName}, start my turn
        </button>
        <button
          type="button"
          onClick={onLeave}
          className="mt-3 text-sm text-muted underline-offset-4 transition hover:text-ink hover:underline"
        >
          Leave match
        </button>
      </section>
    </main>
  );
}
```

- [ ] **Step 5: Add `active` to `Scoreboard`**

Replace `src/components/Scoreboard.tsx` with:

```tsx
import type { MatchPlayer, PlayerId } from '../game/match';

interface ScoreboardProps {
  /** The player shown on the left, in gold. */
  me: PlayerId;
  players: readonly MatchPlayer[];
  ties: number;
  /** One device: the player who is picking right now. */
  active?: PlayerId | null;
}

/** "You 2 · 1 tie · 1 Computer": the left player in gold, the other in blue. */
export function Scoreboard({ me, players, ties, active = null }: ScoreboardProps) {
  const mine = players.find((p) => p.id === me);
  const theirs = players.find((p) => p.id !== me);
  if (!mine || !theirs) return null;
  const tieText = `${ties} ${ties === 1 ? 'tie' : 'ties'}`;
  const activeName = players.find((p) => p.id === active)?.name;
  const marker = (id: PlayerId) =>
    id === active ? <span className="inline-block size-1.5 rounded-full bg-current align-middle" aria-hidden="true" /> : null;

  return (
    <div className="mb-3 flex justify-center lg:mb-4">
      <p
        className="inline-flex items-center gap-3 rounded-full border border-line bg-charcoal/80 px-4 py-1.5 text-sm"
        aria-label={`Score: ${mine.name} ${mine.wins}, ${theirs.name} ${theirs.wins}, ${tieText}${
          activeName ? `, ${activeName} to pick` : ''
        }`}
        data-testid="scoreboard"
      >
        <span className="inline-flex items-center gap-1.5 font-semibold text-gold">
          {marker(mine.id)}
          {mine.name} <span className="font-display text-base tabular-nums text-ink">{mine.wins}</span>
        </span>
        <span className="text-subtle" aria-hidden="true">·</span>
        <span className="text-muted tabular-nums">{tieText}</span>
        <span className="text-subtle" aria-hidden="true">·</span>
        <span className="inline-flex items-center gap-1.5 font-semibold text-rival">
          <span className="font-display text-base tabular-nums text-ink">{theirs.wins}</span> {theirs.name}
          {marker(theirs.id)}
        </span>
      </p>
    </div>
  );
}
```

- [ ] **Step 6: Add `selectedLabel` to `CardGrid`**

In `src/components/CardGrid.tsx`:
- add to `CardGridProps`, after `selected`:
  ```ts
  /** How a picked card is announced, e.g. "Ana's pick". */
  selectedLabel?: string;
  ```
- add `selectedLabel = 'your pick',` to the destructured props, after `selected,`
- in the `label` template, change `${isSelected ? ', your pick' : ''}` to `${isSelected ? `, ${selectedLabel}` : ''}`

- [ ] **Step 7: Add `shared` to `MatchResultPanel`**

In `src/components/MatchResultPanel.tsx`:
- add to the props interface:
  ```ts
  /** One device: name both players instead of saying "you". */
  shared?: boolean;
  ```
- destructure `shared = false`
- replace the `banner` line with:
  ```ts
  const banner = !winner
    ? "It's a tie"
    : winner.id === me && !shared
      ? 'You win the round'
      : `${winner.name} wins the round`;
  ```
- inside the map, replace `const name = …` with:
  ```ts
  const youLabel = isMe && !shared;
  const name = youLabel ? 'Your hand' : `${player.name}’s hand`;
  ```
- change the `HandCards` label to ``label={`${youLabel ? 'Your' : `${player.name}’s`} five-card hand`}``

- [ ] **Step 8: Update `src/screens/MatchScreen.tsx`**

- Change the import to `import type { MatchActions } from '../app/matchActions';` and add `import { HandoffScreen } from '../components/HandoffScreen';`.
- Keep the `'up-next'` text and the `'handoff'` announcement case from Task 1.
- Replace everything in `MatchScreen` from `const opponent = …` down to the `timer` declaration with:

```tsx
  const opponent = view.opponents[0] ?? null;
  // One device: two people share this screen, so name them instead of saying "you",
  // and keep the scoreboard in a fixed order instead of swapping sides each turn.
  const shared = view.turnMode === 'sequential';
  const scoreboard = (
    <Scoreboard
      me={shared ? (view.players[0]?.id ?? view.me) : view.me}
      players={view.players}
      ties={view.ties}
      active={shared && view.phase === 'selecting' ? view.turn : null}
    />
  );
  const viewerName = view.players.find((p) => p.id === view.me)?.name ?? '';
  const title = shared ? view.players.map((p) => p.name).join(' vs ') : `vs ${opponent?.name ?? 'opponent'}`;

  if (view.phase === 'waiting' || view.roundId === null) {
    return (
      <div className="grid min-h-dvh place-items-center text-muted" role="status">
        Dealing…
      </div>
    );
  }

  if (view.phase === 'handoff') {
    return (
      <HandoffScreen
        nextName={viewerName}
        otherName={opponent?.name ?? ''}
        firstTurn={opponent?.status === 'up-next'}
        scoreboard={scoreboard}
        onReady={actions.beginTurn}
        onLeave={onLeave}
      />
    );
  }
```

  Delete the temporary `if (view.phase === 'handoff') return null;` from Task 1.
- Change the `GameHeader` `difficulty` prop to the template literal `${settings.label} · ${title}`, and the sr-only `h1` text to `Memory Poker {title}`. For Vs computer both come out exactly as before ("Medium · vs Computer", "Memory Poker vs Computer").
- Replace the inline `<Scoreboard … />` element with `{scoreboard}`.
- On `CardGrid`, add `selectedLabel={shared && view.phase !== 'selecting' ? `${viewerName}'s pick` : undefined}`.
- On `MatchResultPanel`, add `shared={shared}`.
- Show the opponent status only where it makes sense on a shared screen. Change the `PhaseInstructions` child to:
  ```tsx
  {opponent && (!shared || view.phase === 'selecting') && <OpponentStatus opponent={opponent} />}
  ```

- [ ] **Step 9: Run the tests and confirm they pass**

Run: `npx vitest run src/screens/MatchScreen.shared.test.tsx src/screens/MatchScreen.test.tsx`
Expected: PASS. The Vs computer tests must still pass without changes.

- [ ] **Step 10: Run the full suite and commit**

Run: `npm test && npm run lint && npm run typecheck`
Expected: all three succeed.

```bash
git add src/app/matchActions.ts src/app/useComputerMatch.ts src/components/HandoffScreen.tsx \
  src/components/Scoreboard.tsx src/components/CardGrid.tsx src/components/MatchResultPanel.tsx \
  src/screens/MatchScreen.tsx src/screens/MatchScreen.shared.test.tsx
git commit -m "feat(ui): handoff screen and shared-screen wording for one-device matches

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Two players mode, from the lobby to results

**Files:**
- Create: `src/app/playerNames.ts`, `src/app/playerNames.test.ts`
- Create: `src/app/useLocalMatch.ts`
- Create: `src/screens/LocalMatchScreen.tsx`
- Test: `src/screens/LocalMatchScreen.test.tsx`
- Modify: `src/app/usePhaseTimer.ts`
- Modify: `src/game/gameConfig.ts`
- Modify: `src/screens/LobbyScreen.tsx`
- Modify: `src/app/App.tsx`
- Modify: `README.md`, `CLAUDE.md`, `docs/superpowers/specs/2026-11-13-multiplayer-design.md`

**Interfaces:**
- Consumes (from Tasks 1 and 2): `createMatch({ …, turnMode: 'sequential' })`, `sharedScreenViewer`, `viewFor`, the `BEGIN_TURN` action, `PHASE_TIMEOUT.turn`, `MatchActions`, `MatchScreen`
- Produces:
  - `normalizeNames(raw: readonly [string, string]): [string, string]`, plus `DEFAULT_NAMES` and `MAX_NAME_LENGTH = 16`
  - `useLocalMatch(names: readonly [string, string], difficulty: Difficulty, random: RandomFn): { view: MatchView; actions: MatchActions }`
  - `GameMode = 'solo' | 'computer' | 'local'`
  - `PhaseDeadline.turn?: string | null`, with `onTimeout(phase, roundId, now, turn)`

- [ ] **Step 1: Write the failing tests**

Create `src/app/playerNames.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { MAX_NAME_LENGTH, normalizeNames } from './playerNames';

describe('normalizeNames', () => {
  it('trims names and fills blanks with defaults', () => {
    expect(normalizeNames(['  Ana ', ''])).toEqual(['Ana', 'Player 2']);
    expect(normalizeNames(['   ', 'Ben'])).toEqual(['Player 1', 'Ben']);
  });

  it('caps the length', () => {
    const [first] = normalizeNames(['x'.repeat(40), 'Ben']);
    expect(first).toHaveLength(MAX_NAME_LENGTH);
  });

  it('keeps the two names distinct', () => {
    expect(normalizeNames(['Sam', 'sam'])).toEqual(['Sam', 'sam 2']);
  });
});
```

Create `src/screens/LocalMatchScreen.test.tsx`:

```tsx
import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from '../app/App';
import { createSeededRandom } from '../game/deck';
import { DIFFICULTIES, GAME_CONFIG } from '../game/gameConfig';

const MEDIUM = DIFFICULTIES.medium;

function advance(ms: number) {
  act(() => {
    vi.advanceTimersByTime(ms);
  });
}

const slot = (position: number) => screen.getByTestId(`grid-slot-${position}`);
const score = () => screen.getByTestId('scoreboard');

function startLocal(names: [string, string] = ['Ana', 'Ben']) {
  render(<App random={createSeededRandom(5)} />);
  fireEvent.click(screen.getByRole('radio', { name: /^Two players/ }));
  fireEvent.change(screen.getByRole('textbox', { name: 'Player 1' }), { target: { value: names[0] } });
  fireEvent.change(screen.getByRole('textbox', { name: 'Player 2' }), { target: { value: names[1] } });
  fireEvent.click(screen.getByRole('button', { name: 'Start medium game for two' }));
}

function takeTurn(name: string, a: number, b: number) {
  fireEvent.click(screen.getByRole('button', { name: `I'm ${name}, start my turn` }));
  fireEvent.click(slot(a));
  fireEvent.click(slot(b));
  fireEvent.click(screen.getByRole('button', { name: 'Lock in picks' }));
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('Two players, one device', () => {
  it('describes the mode in the lobby', () => {
    render(<App />);
    fireEvent.click(screen.getByRole('radio', { name: /^Two players/ }));
    expect(screen.getByText(/Pass the device between turns/)).toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: 'Player 1' })).toBeInTheDocument();
  });

  it('plays a round: memorize together, take turns with a handoff, compare hands', () => {
    startLocal();
    expect(score()).toHaveAccessibleName('Score: Ana 0, Ben 0, 0 ties');
    expect(screen.getAllByTestId(/grid-slot-/)).toHaveLength(16);

    advance(MEDIUM.memorizeSeconds * 1000);
    expect(screen.getByRole('heading', { name: 'Ana picks first' })).toBeInTheDocument();
    expect(screen.queryByTestId('grid-slot-0')).not.toBeInTheDocument();

    // No timer runs during a handoff.
    advance(MEDIUM.selectSeconds * 1000 * 2);
    expect(screen.getByRole('heading', { name: 'Ana picks first' })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: "I'm Ana, start my turn" }));
    expect(screen.getByTestId('countdown')).toHaveAccessibleName(`Select: ${MEDIUM.selectSeconds} seconds left`);
    fireEvent.click(slot(0));
    fireEvent.click(slot(1));
    fireEvent.click(screen.getByRole('button', { name: 'Lock in picks' }));

    expect(screen.getByRole('heading', { name: 'Pass to Ben' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: "I'm Ben, start my turn" }));
    // Ben gets a full timer and can't see Ana's picks.
    expect(screen.getByTestId('countdown')).toHaveAccessibleName(`Select: ${MEDIUM.selectSeconds} seconds left`);
    screen.getAllByTestId(/grid-slot-/).forEach((s) => {
      expect(s).toHaveAttribute('aria-pressed', 'false');
      expect(s).toHaveAccessibleName(/face-down card$/);
    });
    fireEvent.click(slot(2));
    fireEvent.click(slot(3));
    fireEvent.click(screen.getByRole('button', { name: 'Lock in picks' }));
    advance(GAME_CONFIG.revealMs);

    expect(screen.getByRole('heading', { name: /Ana wins the round|Ben wins the round|It's a tie/ })).toBeInTheDocument();
    expect(screen.getByRole('list', { name: 'Ana’s five-card hand' })).toBeInTheDocument();
    expect(screen.getByRole('list', { name: 'Ben’s five-card hand' })).toBeInTheDocument();
    const [ana, ben, ties] = (score().getAttribute('aria-label')?.match(/\d+/g) ?? []).map(Number);
    expect((ana ?? 0) + (ben ?? 0) + (ties ?? 0)).toBe(1);
  });

  it('a timed-out turn passes the device on, and the next round starts with the other player', () => {
    startLocal();
    advance(MEDIUM.memorizeSeconds * 1000);
    fireEvent.click(screen.getByRole('button', { name: "I'm Ana, start my turn" }));
    advance(MEDIUM.selectSeconds * 1000);

    expect(screen.getByRole('heading', { name: 'Pass to Ben' })).toBeInTheDocument();
    takeTurn('Ben', 2, 3);
    advance(GAME_CONFIG.revealMs);
    expect(screen.getByRole('heading', { name: 'Ben wins the round' })).toBeInTheDocument();
    expect(score()).toHaveAccessibleName('Score: Ana 0, Ben 1, 0 ties');

    fireEvent.click(screen.getByRole('button', { name: 'Next round' }));
    advance(MEDIUM.memorizeSeconds * 1000);
    expect(screen.getByRole('heading', { name: 'Ben picks first' })).toBeInTheDocument();
  });

  it('blank names fall back to Player 1 and Player 2', () => {
    startLocal(['', '  ']);
    expect(score()).toHaveAccessibleName('Score: Player 1 0, Player 2 0, 0 ties');
  });

  it('leaving returns to the lobby and stops every timer', () => {
    startLocal();
    advance(MEDIUM.memorizeSeconds * 1000);
    fireEvent.click(screen.getByRole('button', { name: 'Leave match' }));
    advance(60_000);
    expect(screen.getByRole('button', { name: 'Start medium game for two' })).toBeInTheDocument();
    expect(vi.getTimerCount()).toBe(0);
  });
});
```

- [ ] **Step 2: Run the tests and confirm they fail**

Run: `npx vitest run src/app/playerNames.test.ts src/screens/LocalMatchScreen.test.tsx`
Expected: FAIL. `./playerNames` can't be resolved, and there's no "Two players" radio.

- [ ] **Step 3: Create `src/app/playerNames.ts`**

```ts
export const DEFAULT_NAMES = ['Player 1', 'Player 2'] as const;
export const MAX_NAME_LENGTH = 16;

/** Trims names, fills blanks with defaults, caps the length and keeps the two names distinct. */
export function normalizeNames(raw: readonly [string, string]): [string, string] {
  const first = raw[0].trim().slice(0, MAX_NAME_LENGTH) || DEFAULT_NAMES[0];
  let second = raw[1].trim().slice(0, MAX_NAME_LENGTH) || DEFAULT_NAMES[1];
  if (second.toLowerCase() === first.toLowerCase()) second = `${second} 2`;
  return [first, second];
}
```

- [ ] **Step 4: Pass `turn` through `usePhaseTimer`**

In `src/app/usePhaseTimer.ts`:
- add to `PhaseDeadline`:
  ```ts
  /** Sequential turns: whose turn this deadline belongs to. */
  readonly turn?: string | null;
  ```
- change the `onTimeout` parameter type to `(phase: P, roundId: number, now: number, turn: string | null) => void`
- add `const turn = deadline?.turn ?? null;` beside the other derived values
- call `onTimeout(phase, roundId, Date.now(), turn)` and add `turn` to the effect's dependency array

The existing callers (`App`, `useComputerMatch`) pass three-parameter callbacks. TypeScript accepts those unchanged.

- [ ] **Step 5: Create `src/app/useLocalMatch.ts`**

```ts
import { useCallback, useMemo, useReducer } from 'react';
import { dealRound } from '../game/deal';
import type { Difficulty } from '../game/gameConfig';
import type { RandomFn } from '../game/gameTypes';
import {
  createMatch,
  matchReducer,
  sharedScreenViewer,
  viewFor,
  type MatchTimedPhase,
  type MatchView,
} from '../game/match';
import type { MatchActions } from './matchActions';
import { usePhaseTimer } from './usePhaseTimer';

/**
 * Two players on one device, on the shared match engine in `sequential` mode:
 * they memorize together, then pick in turn with a handoff screen before each
 * turn. The view always belongs to whoever holds the device.
 */
export function useLocalMatch(
  names: readonly [string, string],
  difficulty: Difficulty,
  random: RandomFn,
): { view: MatchView; actions: MatchActions } {
  const [state, dispatch] = useReducer(matchReducer, undefined, () =>
    matchReducer(
      createMatch({
        players: [
          { id: 'p1', name: names[0] },
          { id: 'p2', name: names[1] },
        ],
        difficulty,
        turnMode: 'sequential',
      }),
      { type: 'START_ROUND', round: dealRound(1, random, difficulty), now: Date.now() },
    ),
  );

  const deadline =
    'endsAt' in state
      ? {
          phase: state.phase,
          endsAt: state.endsAt,
          roundId: state.round.id,
          turn: state.phase === 'selecting' ? state.turn : null,
        }
      : null;
  const onTimeout = useCallback(
    (phase: MatchTimedPhase, roundId: number, now: number, turn: string | null) =>
      dispatch({ type: 'PHASE_TIMEOUT', phase, roundId, now, turn }),
    [],
  );
  usePhaseTimer(deadline, onTimeout);

  const viewer = sharedScreenViewer(state);

  const toggle = useCallback(
    (position: number) => dispatch({ type: 'TOGGLE_POSITION', playerId: viewer, position }),
    [viewer],
  );
  const submit = useCallback(() => dispatch({ type: 'SUBMIT_SELECTION', playerId: viewer, now: Date.now() }), [viewer]);
  const beginTurn = useCallback(() => dispatch({ type: 'BEGIN_TURN', playerId: viewer, now: Date.now() }), [viewer]);

  const lastRoundId = 'round' in state ? state.round.id : 0;
  const nextRound = useCallback(() => {
    // One device: a single press readies both players.
    dispatch({ type: 'NEXT_ROUND', playerId: viewer });
    dispatch({ type: 'START_ROUND', round: dealRound(lastRoundId + 1, random, difficulty), now: Date.now() });
  }, [viewer, lastRoundId, random, difficulty]);

  const view = useMemo(() => viewFor(state, viewer), [state, viewer]);
  const actions = useMemo(
    () => ({ toggle, submit, nextRound, beginTurn }),
    [toggle, submit, nextRound, beginTurn],
  );
  return { view, actions };
}
```

- [ ] **Step 6: Create `src/screens/LocalMatchScreen.tsx`**

```tsx
import { useLocalMatch } from '../app/useLocalMatch';
import type { Difficulty } from '../game/gameConfig';
import type { RandomFn } from '../game/gameTypes';
import { MatchScreen } from './MatchScreen';

interface LocalMatchScreenProps {
  names: readonly [string, string];
  difficulty: Difficulty;
  random: RandomFn;
  onLeave: () => void;
}

/** Two players taking turns on one device. Unmounting ends the match and its timers. */
export function LocalMatchScreen({ names, difficulty, random, onLeave }: LocalMatchScreenProps) {
  const { view, actions } = useLocalMatch(names, difficulty, random);
  return <MatchScreen view={view} actions={actions} onLeave={onLeave} />;
}
```

- [ ] **Step 7: Add the `'local'` mode to `src/game/gameConfig.ts`**

```ts
export type GameMode = 'solo' | 'computer' | 'local';

export const GAME_MODES: ReadonlyArray<{ readonly id: GameMode; readonly label: string; readonly summary: string }> = [
  { id: 'solo', label: 'Solo', summary: 'Find the best hand you can.' },
  { id: 'computer', label: 'Vs computer', summary: 'Same grid, secret picks. Best hand wins.' },
  { id: 'local', label: 'Two players', summary: 'One device. Take turns and pass it over.' },
];
```

```ts
export function isGameMode(value: unknown): value is GameMode {
  return GAME_MODES.some((mode) => mode.id === value);
}
```

- [ ] **Step 8: Update `src/screens/LobbyScreen.tsx`**

- Imports: add `import { DEFAULT_NAMES, MAX_NAME_LENGTH } from '../app/playerNames';`.
- Props: add
  ```ts
  names: readonly [string, string];
  onNamesChange: (names: [string, string]) => void;
  ```
  and destructure them.
- In `stepsFor`, replace the `vsComputer` constant and the Select and Reveal `body` values:
  ```ts
  const versus = mode !== 'solo';
  ```
  ```ts
      body:
        mode === 'computer'
          ? `Pick ${picksRequired} face-down grid positions from memory. The computer secretly picks ${picksRequired} at the same time, and you may both pick the same card.`
          : mode === 'local'
            ? `Players take turns picking ${picksRequired} face-down grid positions, each with their own ${settings.selectSeconds}s. Pass the device between turns, and look away while the other player picks.`
            : `Pick ${picksRequired} face-down grid positions from memory. You can change your mind until you lock in.`,
  ```
  ```ts
      body: versus
        ? `Both sets of picks are revealed. Each player's ${picksRequired} picks plus the ${communityCount} community cards make a five-card hand, and the higher hand wins the round.`
        : `The grid flips back. Your ${picksRequired} picks plus the ${communityCount} community cards make your five-card hand.`,
  ```
- Mode tiles: change the mode grid's `grid-cols-2` to `grid-cols-3`.
- Right after the mode `</fieldset>`, add:
  ```tsx
        {mode === 'local' && (
          <fieldset className="mx-auto mt-6 max-w-xl">
            <legend className="mx-auto mb-3 text-[0.7rem] font-semibold uppercase tracking-[0.2em] text-gold">
              Players
            </legend>
            <div className="grid grid-cols-2 gap-2 sm:gap-3">
              {([0, 1] as const).map((i) => (
                <label key={i} className="text-left text-xs font-medium text-muted">
                  Player {i + 1}
                  <input
                    type="text"
                    value={names[i]}
                    maxLength={MAX_NAME_LENGTH}
                    placeholder={DEFAULT_NAMES[i]}
                    autoComplete="off"
                    onChange={(event) => {
                      const next: [string, string] = [names[0], names[1]];
                      next[i] = event.target.value;
                      onNamesChange(next);
                    }}
                    className="mt-1 block w-full rounded-xl border border-line bg-charcoal/70 px-3 py-2.5 text-base text-ink placeholder:text-subtle focus:border-gold focus:outline-none"
                  />
                </label>
              ))}
            </div>
          </fieldset>
        )}
  ```
- Start button text:
  ```tsx
  Start {settings.label.toLowerCase()} game
  {mode === 'computer' ? ' vs computer' : mode === 'local' ? ' for two' : ''}
  ```
  Keep it on one line in JSX, i.e. `game{mode === 'computer' ? … : …}`, so the accessible name stays `Start medium game for two` without extra whitespace.

- [ ] **Step 9: Wire up `src/app/App.tsx`**

- Imports: add `import { normalizeNames } from './playerNames';` and `import { LocalMatchScreen } from '../screens/LocalMatchScreen';`.
- Replace the `computerMatch` state with:
  ```ts
  const [names, setNames] = useState<[string, string]>(['', '']);
  /** The running match (vs computer or one device), or null in solo/lobby. */
  const [match, setMatch] = useState<{ mode: Exclude<GameMode, 'solo'>; names: [string, string] } | null>(null);
  ```
- Replace `start` and `leaveMatch`:
  ```ts
  const start = useCallback(() => {
    if (mode === 'solo') {
      startSoloRound();
      return;
    }
    setMatch({ mode, names: normalizeNames(names) });
    window.scrollTo?.({ top: 0 });
  }, [mode, names, startSoloRound]);

  const leaveMatch = useCallback(() => setMatch(null), []);
  ```
- Replace the `computerMatch` render branch with:
  ```tsx
  if (match?.mode === 'computer') {
    return <ComputerMatchScreen difficulty={difficulty} random={random} onLeave={leaveMatch} />;
  }
  if (match?.mode === 'local') {
    return <LocalMatchScreen names={match.names} difficulty={difficulty} random={random} onLeave={leaveMatch} />;
  }
  ```
- Pass `names={names}` and `onNamesChange={setNames}` to `LobbyScreen`.

- [ ] **Step 10: Run the tests and confirm they pass**

Run: `npx vitest run src/app/playerNames.test.ts src/screens/LocalMatchScreen.test.tsx`
Expected: PASS.

Run: `npm test`
Expected: PASS for the whole suite, including the unchanged Solo (`App.test.tsx`) and Vs computer (`MatchScreen.test.tsx`) tests.

- [ ] **Step 11: Check it by hand in the browser**

Run: `npm run dev`. Then open the printed URL and check each of these:
1. Choose **Two players**, enter "Ana" and "Ben" and press **Start medium game for two**.
2. Both players see the grid face-up during memorizing. When it ends, "Ana picks first" covers the board.
3. Ana picks, then "Pass to Ben" shows. Ben's grid shows none of Ana's picks, and Ben's timer starts full.
4. The results name both players, outline Ana's picks in gold and Ben's in blue, and update the tally.
5. **Next round**: Ben picks first.
6. Check at a phone width (375 px) in the browser's device toolbar: the handoff screen fits, and no horizontal scrolling appears.

- [ ] **Step 12: Update the docs**

`README.md`: after the "Round rules (single-player)" section, add:

```markdown
## Two players, one device

Both players memorize the same grid together. Then they pick **in turn**, each with a full
selection timer. A handoff screen comes before every turn ("Ana picks first", "Pass to Ben"),
hides the board and runs no timer, so the other player can look away. The first player to pick
alternates every round. Both hands are revealed together, and the stronger hand wins the round
(`compareOutcomes`: a complete hand beats an incomplete one, and equal hands tie). A running
tally counts wins and ties.
```

`docs/superpowers/specs/2026-11-13-multiplayer-design.md`, section 1, "Sequential (one device)": replace the numbered list with:

```markdown
  1. Memorizing ends in a `handoff` to Player A ("Ana picks first"): no timer and the grid is
     hidden, so Player B can look away before any picks are made.
  2. Player A selects with the full select timer.
  3. `handoff` to Player B ("Pass to Ben").
  4. Player B selects with a fresh full select timer.
  5. Reveal.
```

Also add a row to the Decisions table: `| Vs computer | Added after the spec: a simultaneous-mode match against a computer opponent with imperfect memory (computerPlayer.ts). |`

`CLAUDE.md`, in the "Multiplayer (in progress)" build order: mark step 1 done (sequential and handoff) and step 3 done (`useLocalMatch`, `LocalMatchScreen`, `HandoffScreen`), and change the Modes bullet from "(pass-and-play)" to "(pass-and-play, built)".

- [ ] **Step 13: Run the full suite and commit**

Run: `npm test && npm run lint && npm run typecheck && npm run build`
Expected: all four succeed.

```bash
git add src/app/playerNames.ts src/app/playerNames.test.ts src/app/useLocalMatch.ts src/app/usePhaseTimer.ts \
  src/screens/LocalMatchScreen.tsx src/screens/LocalMatchScreen.test.tsx src/game/gameConfig.ts \
  src/screens/LobbyScreen.tsx src/app/App.tsx README.md CLAUDE.md \
  docs/superpowers/specs/2026-11-13-multiplayer-design.md
git commit -m "feat: two players on one device (pass-and-play)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```
