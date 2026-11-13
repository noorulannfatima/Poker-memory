# Online Play Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task by task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Two players on different devices play Memory Poker together. One creates a room and shares a 4-letter code, the other joins with it, and a small Node WebSocket server runs the match.

**Architecture:**
- **Server (`server/`):** runs the existing pure `matchReducer` (`simultaneous` mode). It owns the deal, the clock and the score, and sends each player only `viewFor(match, thatPlayer)`.
- **Shared message format (`src/net/protocol.ts`):** framework-free, so both the server and the browser import it.
- **Browser:** a `useOnlineMatch` hook owns the WebSocket, reconnects with a saved token, converts server deadlines to the local clock, and returns `{ state, actions, leave }`. `MatchScreen` renders online matches unchanged, apart from a connection banner and a "Waiting for Ben…" Next round state.

**Tech Stack:** Node 20+, `ws` 8, `tsx` (runs the TypeScript server), React 19, TypeScript 6 (strict), Vite 8, Vitest 4, React Testing Library.

**Spec:** `docs/superpowers/specs/2026-11-13-multiplayer-design.md`, sections 2–5 (build-order steps 4 and 5). Three deliberate deviations, recorded in the spec by Task 5:
1. **No `leave` on `pagehide`.** `pagehide` also fires on reload, which would end a game the spec says a reload should resume. A closed tab is covered by the 30 s grace window instead.
2. **No retries on the first connection.** If the very first connection fails before the room is joined, the browser does not retry. Resending `create` or `join` could create a duplicate room, so it shows "Couldn't reach the game server" instead. Retries apply once a session exists.
3. **Closed rooms are kept for 10 minutes and then forgotten.** During that time, late joins and resumes get `room-closed` instead of `room-not-found`.

## Global Constraints

- `src/game` and `src/net` stay free of React, DOM and Node APIs. Both the server and the browser import them.
- **The server is authoritative.** It deals each round with `dealRound` and `cryptoRandom`, keeps every timer and scores the round. Browsers only send intents.
- **Every player receives only `viewFor(match, thatPlayer)`.** Face-down cards and the opponent's picks never go over the network before the reveal.
- **Room codes** are 4 letters from `ABCDEFGHJKLMNPQRSTUVWXYZ` (no I or O) and are not case-sensitive.
- **Limits:**
  - reconnect grace window: 30 000 ms
  - a room closes after 600 000 ms (10 min) without activity
  - largest accepted message: 1024 bytes
  - at most 20 messages per second per connection
  - names up to 16 characters, blank becomes `Player`
- Online matches use `turnMode: 'simultaneous'` with exactly 2 players. Both players must press Next round.
- The TS config is `strict`, `noUncheckedIndexedAccess`, `verbatimModuleSyntax` (use `import type` for types) and `erasableSyntaxOnly` (no enums or namespaces).
- Existing Solo, Vs computer and Two players behavior and tests must not change.
- Before each commit, run `npm test`, `npm run lint` and `npm run typecheck`, and make sure all of them pass.
- End every commit message with:
  `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`

## File Structure

| File | Status | Responsibility |
|---|---|---|
| `src/net/protocol.ts` | create | Message types, `NET_CONFIG`, room-code rules, `parseClientMessage`, `cleanName` |
| `src/net/protocol.test.ts` | create | Tests for parsing and normalizing |
| `server/rooms.ts` | create | `RoomServer`: rooms, seats, timers, reconnects and rate limits. Independent of the transport. |
| `server/rooms.test.ts` | create | Room logic driven by fake connections and fake timers |
| `server/wsServer.ts` | create | `startServer`: connects `ws` sockets to `RoomServer` |
| `server/wsServer.test.ts` | create | A real-socket round trip and the payload limit |
| `server/main.ts` | create | The process entry point (`PORT`, default 8787) |
| `tsconfig.server.json`, `tsconfig.json` | create / modify | Type-check `server/` with Node types |
| `eslint.config.js` | modify | Node globals for `server/**` |
| `vite.config.ts` | modify | Dev proxy from `/ws` to `ws://localhost:8787` |
| `package.json` | modify | `ws`, `tsx`, `@types/ws`, and the `server` and `start:server` scripts |
| `src/test/setup.ts` | modify | Skip browser-only setup in node-environment tests; clear `sessionStorage` |
| `src/app/socket.ts` | create | The `SocketLike` / `SocketFactory` interfaces and `browserSocket` |
| `src/app/onlineSession.ts` | create | Save, load and clear `{ roomCode, token }` in `sessionStorage` |
| `src/app/serverUrl.ts` | create | `VITE_SERVER_URL`, or same-origin `/ws` |
| `src/app/useOnlineMatch.ts` | create | Connection, reconnection, clock offset and actions |
| `src/app/useOnlineMatch.test.tsx` | create | Hook tests with a fake socket |
| `src/test/online.ts` | create | `FakeSocket`, `fakeSockets()` and server-message fixtures for tests |
| `src/game/gameConfig.ts` | modify | Add the `'online'` game mode |
| `src/screens/LobbyScreen.tsx` | modify | Online name, Create room, Join room form and error alert |
| `src/components/WaitingRoom.tsx` | create | The room code, Copy and "Waiting for an opponent…" screen |
| `src/components/MatchResultPanel.tsx` | modify | A `waitingFor` state for Next round |
| `src/screens/MatchScreen.tsx` | modify | A `banner` slot and `waitingFor` |
| `src/screens/OnlineMatchScreen.tsx` | create | Connecting, waiting, match, connection banners and the room-closed screen |
| `src/screens/OnlineMatchScreen.test.tsx` | create | Tests of the online flow through `<App>` |
| `src/app/App.tsx` | modify | Online routing, resume on reload, the `createSocket` prop |
| `README.md`, `CLAUDE.md`, the spec | modify | How to run the server and how online play works |

---

### Task 1: The message format

**Files:**
- Create: `src/net/protocol.ts`
- Test: `src/net/protocol.test.ts`

**Interfaces:**
- Consumes: `isDifficulty` and `Difficulty` from `src/game/gameConfig.ts`; `MatchView` and `PlayerId` from `src/game/match.ts`
- Produces (later tasks use these exact names):
  - `NET_CONFIG = { reconnectGraceMs: 30_000, roomIdleMs: 600_000, maxMessageBytes: 1024, maxMessagesPerSecond: 20, maxNameLength: 16 }`
  - `ROOM_CODE_LENGTH = 4`, `ROOM_CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ'`
  - `type ErrorCode = 'room-not-found' | 'room-full' | 'room-closed' | 'bad-token'`
  - `type Presence = 'connected' | 'reconnecting' | 'left'`
  - `interface RoomView { code; difficulty; players: { id; name; presence }[]; closed }`
  - `type ClientMessage`: `create {name, difficulty}` | `join {roomCode, name}` | `resume {roomCode, token}` | `toggle {position}` | `submit` | `nextRound` | `leave`
  - `type ServerMessage`: `joined {roomCode, playerId, token}` | `state {room, view: MatchView | null, now}` | `error {code, message}`
  - `parseClientMessage(raw: string): ClientMessage | null`, `cleanName(value: unknown): string`, `normalizeRoomCode(value: string): string`, `isRoomCode(value: string): boolean`

- [ ] **Step 1: Write the failing test**

Create `src/net/protocol.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { NET_CONFIG, cleanName, isRoomCode, normalizeRoomCode, parseClientMessage } from './protocol';

const parse = (value: unknown) => parseClientMessage(JSON.stringify(value));

describe('parseClientMessage', () => {
  it('accepts every message type', () => {
    expect(parse({ type: 'create', name: 'Ana', difficulty: 'easy' })).toEqual({
      type: 'create',
      name: 'Ana',
      difficulty: 'easy',
    });
    expect(parse({ type: 'join', roomCode: 'kqpz', name: 'Ben' })).toEqual({ type: 'join', roomCode: 'KQPZ', name: 'Ben' });
    expect(parse({ type: 'resume', roomCode: 'KQPZ', token: 't' })).toEqual({ type: 'resume', roomCode: 'KQPZ', token: 't' });
    expect(parse({ type: 'toggle', position: 3 })).toEqual({ type: 'toggle', position: 3 });
    expect(parse({ type: 'submit' })).toEqual({ type: 'submit' });
    expect(parse({ type: 'nextRound' })).toEqual({ type: 'nextRound' });
    expect(parse({ type: 'leave' })).toEqual({ type: 'leave' });
  });

  it('rejects malformed and unknown messages', () => {
    expect(parseClientMessage('not json')).toBeNull();
    expect(parse(null)).toBeNull();
    expect(parse('submit')).toBeNull();
    expect(parse({ type: 'dance' })).toBeNull();
    expect(parse({ type: 'create', name: 'Ana', difficulty: 'impossible' })).toBeNull();
    expect(parse({ type: 'join', name: 'Ben' })).toBeNull();
    expect(parse({ type: 'resume', roomCode: 'KQPZ' })).toBeNull();
    expect(parse({ type: 'toggle', position: 1.5 })).toBeNull();
    expect(parse({ type: 'toggle', position: '3' })).toBeNull();
  });

  it('cleans player names', () => {
    expect(parse({ type: 'create', name: '  Ana  ', difficulty: 'easy' })).toMatchObject({ name: 'Ana' });
    expect(cleanName('   ')).toBe('Player');
    expect(cleanName(42)).toBe('Player');
    expect(cleanName('x'.repeat(40))).toHaveLength(NET_CONFIG.maxNameLength);
  });
});

describe('room codes', () => {
  it('normalizes what people type', () => {
    expect(normalizeRoomCode(' k-q p z9x')).toBe('KQPZ');
  });

  it('recognizes valid codes only', () => {
    expect(isRoomCode('KQPZ')).toBe(true);
    expect(isRoomCode('KQP')).toBe(false);
    expect(isRoomCode('KQPO')).toBe(false); // O is not in the alphabet
  });
});
```

- [ ] **Step 2: Run it and confirm it fails**

Run: `npx vitest run src/net/protocol.test.ts`
Expected: FAIL, because `./protocol` can't be resolved.

- [ ] **Step 3: Create `src/net/protocol.ts`**

```ts
import { isDifficulty, type Difficulty } from '../game/gameConfig';
import type { MatchView, PlayerId } from '../game/match';

/**
 * The message format between the browser and the online game server (JSON over
 * WebSocket). Both sides import this file, so it must stay free of React,
 * DOM and Node APIs.
 */

export const NET_CONFIG = {
  /** A dropped player has this long to reconnect before the room closes. */
  reconnectGraceMs: 30_000,
  /** A room closes after this long without a message from either player. */
  roomIdleMs: 10 * 60_000,
  /** Largest accepted message from a browser, in bytes. */
  maxMessageBytes: 1024,
  /** Messages one connection may send per second before it is cut off. */
  maxMessagesPerSecond: 20,
  maxNameLength: 16,
} as const;

export const ROOM_CODE_LENGTH = 4;
/** Letters only, without look-alikes (no I or O). */
export const ROOM_CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ';

export type ErrorCode = 'room-not-found' | 'room-full' | 'room-closed' | 'bad-token';

export type Presence = 'connected' | 'reconnecting' | 'left';

export interface RoomView {
  readonly code: string;
  readonly difficulty: Difficulty;
  readonly players: ReadonlyArray<{ readonly id: PlayerId; readonly name: string; readonly presence: Presence }>;
  /** True once a player left or missed the reconnect window, or the room went idle. */
  readonly closed: boolean;
}

export type ClientMessage =
  | { readonly type: 'create'; readonly name: string; readonly difficulty: Difficulty }
  | { readonly type: 'join'; readonly roomCode: string; readonly name: string }
  | { readonly type: 'resume'; readonly roomCode: string; readonly token: string }
  | { readonly type: 'toggle'; readonly position: number }
  | { readonly type: 'submit' }
  | { readonly type: 'nextRound' }
  | { readonly type: 'leave' };

export type ServerMessage =
  | { readonly type: 'joined'; readonly roomCode: string; readonly playerId: PlayerId; readonly token: string }
  | { readonly type: 'state'; readonly room: RoomView; readonly view: MatchView | null; readonly now: number }
  | { readonly type: 'error'; readonly code: ErrorCode; readonly message: string };

/** Trims a name and caps its length; blank or missing names become "Player". */
export function cleanName(value: unknown): string {
  const name = typeof value === 'string' ? value.trim().slice(0, NET_CONFIG.maxNameLength) : '';
  return name || 'Player';
}

/** Upper-cases what someone typed and keeps only the first 4 letters. */
export function normalizeRoomCode(value: string): string {
  return value.toUpperCase().replace(/[^A-Z]/g, '').slice(0, ROOM_CODE_LENGTH);
}

export function isRoomCode(value: string): boolean {
  return value.length === ROOM_CODE_LENGTH && [...value].every((letter) => ROOM_CODE_ALPHABET.includes(letter));
}

/** Validates one raw message from a browser. Returns null for anything malformed or unknown. */
export function parseClientMessage(raw: string): ClientMessage | null {
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    return null;
  }
  if (typeof data !== 'object' || data === null) return null;
  const message = data as Record<string, unknown>;
  switch (message.type) {
    case 'create':
      return isDifficulty(message.difficulty)
        ? { type: 'create', name: cleanName(message.name), difficulty: message.difficulty }
        : null;
    case 'join':
      return typeof message.roomCode === 'string'
        ? { type: 'join', roomCode: normalizeRoomCode(message.roomCode), name: cleanName(message.name) }
        : null;
    case 'resume':
      return typeof message.roomCode === 'string' && typeof message.token === 'string'
        ? { type: 'resume', roomCode: normalizeRoomCode(message.roomCode), token: message.token.slice(0, 64) }
        : null;
    case 'toggle':
      return typeof message.position === 'number' && Number.isInteger(message.position)
        ? { type: 'toggle', position: message.position }
        : null;
    case 'submit':
      return { type: 'submit' };
    case 'nextRound':
      return { type: 'nextRound' };
    case 'leave':
      return { type: 'leave' };
    default:
      return null;
  }
}
```

- [ ] **Step 4: Run the test and confirm it passes**

Run: `npx vitest run src/net/protocol.test.ts`
Expected: PASS.

- [ ] **Step 5: Run the full suite and commit**

Run: `npm test && npm run lint && npm run typecheck`

```bash
git add src/net/protocol.ts src/net/protocol.test.ts
git commit -m "feat(net): message format for online play

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Room server logic

**Files:**
- Create: `server/rooms.ts`, `server/rooms.test.ts`, `tsconfig.server.json`
- Modify: `tsconfig.json`, `eslint.config.js`, `src/test/setup.ts`

**Interfaces:**
- Consumes (from Task 1): `NET_CONFIG`, `ROOM_CODE_ALPHABET`, `ROOM_CODE_LENGTH`, `parseClientMessage`, `ErrorCode`, `RoomView` and `ServerMessage`. Also `createMatch`, `matchReducer` and `viewFor` from `src/game/match.ts`, and `dealRound` and `cryptoRandom`.
- Produces:
  - `interface Connection { send(message: ServerMessage): void; close(): void }`
  - `class RoomServer`:
    - `constructor({ random?: RandomFn, log?: (message: string) => void })`
    - `handle(conn, raw: string): void`
    - `disconnect(conn): void`
    - `shutdown(): void`
  - Player ids are `'p1'` (creator) and `'p2'` (joiner).

- [ ] **Step 1: Set up the server's TypeScript, lint and test environments**

Create `tsconfig.server.json`:

```json
{
  "compilerOptions": {
    "tsBuildInfoFile": "./node_modules/.tmp/tsconfig.server.tsbuildinfo",
    "target": "ES2023",
    "lib": ["ES2023"],
    "module": "ESNext",
    "moduleResolution": "bundler",
    "types": ["node"],
    "skipLibCheck": true,
    "allowImportingTsExtensions": true,
    "verbatimModuleSyntax": true,
    "moduleDetection": "force",
    "noEmit": true,
    "strict": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "noFallthroughCasesInSwitch": true,
    "noUncheckedIndexedAccess": true,
    "erasableSyntaxOnly": true
  },
  "include": ["server"]
}
```

In `tsconfig.json`, add `{ "path": "./tsconfig.server.json" }` to `references`.

In `eslint.config.js`, add this block as the last argument of `tseslint.config(...)`:

```js
  {
    // The online game server runs on Node.
    files: ['server/**/*.ts'],
    languageOptions: { globals: globals.node },
  },
```

Replace `src/test/setup.ts` with the version below. Server tests run in Vitest's `node` environment, which has no `window` or storage:

```ts
import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach, vi } from 'vitest';

// Server tests run in the node environment, which has no window or storage.
const inBrowser = typeof window !== 'undefined';

// jsdom does not implement scrolling.
if (inBrowser) window.scrollTo = vi.fn() as unknown as typeof window.scrollTo;

afterEach(() => {
  cleanup();
  if (inBrowser) {
    localStorage.clear();
    sessionStorage.clear();
  }
});
```

- [ ] **Step 2: Write the failing tests**

Create `server/rooms.test.ts`:

```ts
// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createSeededRandom } from '../src/game/deck';
import { DIFFICULTIES, GAME_CONFIG } from '../src/game/gameConfig';
import type { MatchView } from '../src/game/match';
import { NET_CONFIG, ROOM_CODE_ALPHABET, type ClientMessage, type ServerMessage } from '../src/net/protocol';
import { RoomServer, type Connection } from './rooms';

const MEDIUM = DIFFICULTIES.medium;
const MEMORIZE_MS = MEDIUM.memorizeSeconds * 1000;
const SELECT_MS = MEDIUM.selectSeconds * 1000;

class FakeConn implements Connection {
  readonly sent: ServerMessage[] = [];
  closed = false;

  send(message: ServerMessage): void {
    this.sent.push(message);
  }

  close(): void {
    this.closed = true;
  }

  /** The most recent message of one type. */
  last<T extends ServerMessage['type']>(type: T): Extract<ServerMessage, { type: T }> {
    for (let i = this.sent.length - 1; i >= 0; i--) {
      const message = this.sent[i];
      if (message?.type === type) return message as Extract<ServerMessage, { type: T }>;
    }
    throw new Error(`No ${type} message was sent`);
  }

  view(): MatchView {
    const view = this.last('state').view;
    if (!view) throw new Error('No match view yet');
    return view;
  }
}

let server: RoomServer;
const say = (conn: Connection, message: ClientMessage) => server.handle(conn, JSON.stringify(message));
const advance = (ms: number) => vi.advanceTimersByTime(ms);

/** Ana creates a medium room and Ben joins it, which starts the first round. */
function startMatch() {
  const ana = new FakeConn();
  const ben = new FakeConn();
  say(ana, { type: 'create', name: 'Ana', difficulty: 'medium' });
  const code = ana.last('joined').roomCode;
  say(ben, { type: 'join', roomCode: code, name: 'Ben' });
  return { ana, ben, code };
}

beforeEach(() => {
  vi.useFakeTimers();
  server = new RoomServer({ random: createSeededRandom(3) });
});

afterEach(() => {
  server.shutdown();
  vi.useRealTimers();
});

describe('RoomServer — rooms', () => {
  it('create gives a 4-letter code and a token, then waits for an opponent', () => {
    const ana = new FakeConn();
    say(ana, { type: 'create', name: 'Ana', difficulty: 'medium' });
    const joined = ana.last('joined');
    expect(joined.roomCode).toHaveLength(4);
    expect([...joined.roomCode].every((letter) => ROOM_CODE_ALPHABET.includes(letter))).toBe(true);
    expect(joined.playerId).toBe('p1');
    expect(joined.token.length).toBeGreaterThan(10);

    const state = ana.last('state');
    expect(state.view).toBeNull();
    expect(state.room).toEqual({
      code: joined.roomCode,
      difficulty: 'medium',
      closed: false,
      players: [{ id: 'p1', name: 'Ana', presence: 'connected' }],
    });
  });

  it('joining starts the first round for both players on the server clock', () => {
    const { ana, ben } = startMatch();
    expect(ben.last('joined').playerId).toBe('p2');
    for (const conn of [ana, ben]) {
      const view = conn.view();
      expect(view.phase).toBe('memorizing');
      expect(view.grid).toHaveLength(16);
      expect(view.players.map((p) => p.name)).toEqual(['Ana', 'Ben']);
      expect(view.endsAt).toBe(Date.now() + MEMORIZE_MS);
    }
  });

  it('rejects unknown codes and full rooms; codes are not case-sensitive', () => {
    const { code } = startMatch();
    const cat = new FakeConn();
    say(cat, { type: 'join', roomCode: code === 'ZZZZ' ? 'YYYY' : 'ZZZZ', name: 'Cat' });
    expect(cat.last('error').code).toBe('room-not-found');
    say(cat, { type: 'join', roomCode: code.toLowerCase(), name: 'Cat' });
    expect(cat.last('error').code).toBe('room-full');
  });

  it('gives a second player with the same name a suffix', () => {
    const ana = new FakeConn();
    const twin = new FakeConn();
    say(ana, { type: 'create', name: 'Ana', difficulty: 'medium' });
    say(twin, { type: 'join', roomCode: ana.last('joined').roomCode, name: 'ana' });
    expect(twin.view().players.map((p) => p.name)).toEqual(['Ana', 'ana 2']);
  });
});

describe('RoomServer — a round', () => {
  it('runs memorize, select, reveal and results on server time, and tallies', () => {
    const { ana, ben } = startMatch();
    advance(MEMORIZE_MS);
    expect(ana.view().phase).toBe('selecting');

    say(ana, { type: 'toggle', position: 0 });
    say(ana, { type: 'toggle', position: 1 });
    say(ana, { type: 'submit' });
    expect(ben.view().opponents[0]?.status).toBe('locked');

    say(ben, { type: 'toggle', position: 2 });
    say(ben, { type: 'toggle', position: 3 });
    say(ben, { type: 'submit' });
    expect(ana.view().phase).toBe('revealing');

    advance(GAME_CONFIG.revealMs);
    const results = ana.view();
    expect(results.phase).toBe('results');
    expect(results.opponents[0]?.picks).toEqual([2, 3]);
    expect(results.players.reduce((sum, p) => sum + p.wins, results.ties)).toBe(1);
  });

  it('ends selection when the server timer runs out', () => {
    const { ana } = startMatch();
    advance(MEMORIZE_MS);
    say(ana, { type: 'toggle', position: 4 });
    advance(SELECT_MS);
    expect(ana.view().phase).toBe('revealing');
    advance(GAME_CONFIG.revealMs);
    expect(ana.view().results?.selections.p1).toEqual({ positions: [4], reason: 'timeout' });
  });

  it('starts the next round only when both players press Next round', () => {
    const { ana, ben } = startMatch();
    advance(MEMORIZE_MS);
    advance(SELECT_MS);
    advance(GAME_CONFIG.revealMs);

    say(ana, { type: 'nextRound' });
    expect(ana.view().phase).toBe('results');
    expect(ana.view().results?.ready).toEqual(['p1']);

    say(ben, { type: 'nextRound' });
    expect(ana.view().phase).toBe('memorizing');
    expect(ana.view().roundId).toBe(2);
  });

  it('never sends face-down cards or the opponent’s picks while selecting', () => {
    const { ana, ben } = startMatch();
    const grid = ana.view().grid; // face-up while memorizing
    const from = { ana: ana.sent.length, ben: ben.sent.length };

    advance(MEMORIZE_MS);
    say(ana, { type: 'toggle', position: 0 });
    say(ana, { type: 'toggle', position: 1 });
    say(ana, { type: 'submit' });
    say(ben, { type: 'toggle', position: 5 });

    const duringSelection = [...ana.sent.slice(from.ana), ...ben.sent.slice(from.ben)];
    expect(duringSelection.length).toBeGreaterThan(0);
    const wire = JSON.stringify(duringSelection);
    for (const card of grid) {
      expect(card).not.toBeNull();
      expect(wire).not.toContain(JSON.stringify(card));
    }
    for (const message of duringSelection) {
      if (message.type !== 'state') continue;
      for (const opponent of message.view?.opponents ?? []) expect(opponent.picks).toBeNull();
    }
  });
});

describe('RoomServer — bad input', () => {
  it('ignores malformed, unknown and out-of-phase messages, and strangers', () => {
    const { ana } = startMatch();
    const before = ana.sent.length;
    server.handle(ana, 'not json');
    server.handle(ana, JSON.stringify({ type: 'dance' }));
    say(ana, { type: 'toggle', position: 99 }); // still memorizing
    const stranger = new FakeConn();
    say(stranger, { type: 'submit' });

    expect(ana.sent).toHaveLength(before);
    expect(stranger.sent).toEqual([]);
    expect(ana.closed).toBe(false);
  });

  it('cuts off a connection that sends an oversized message', () => {
    const conn = new FakeConn();
    server.handle(conn, 'x'.repeat(NET_CONFIG.maxMessageBytes + 1));
    expect(conn.closed).toBe(true);
  });

  it('cuts off a connection that sends more than 20 messages a second', () => {
    const { ana } = startMatch();
    advance(1000); // a fresh one-second window
    for (let i = 0; i < NET_CONFIG.maxMessagesPerSecond; i++) say(ana, { type: 'toggle', position: 0 });
    expect(ana.closed).toBe(false);
    say(ana, { type: 'toggle', position: 0 });
    expect(ana.closed).toBe(true);
  });
});

describe('RoomServer — leaving and reconnecting', () => {
  it('a dropped player can resume within 30 s and keeps their picks', () => {
    const { ana, ben, code } = startMatch();
    advance(MEMORIZE_MS);
    say(ben, { type: 'toggle', position: 2 });
    const token = ben.last('joined').token;

    server.disconnect(ben);
    expect(ana.last('state').room.players[1]?.presence).toBe('reconnecting');

    advance(10_000);
    const benAgain = new FakeConn();
    say(benAgain, { type: 'resume', roomCode: code, token });
    expect(benAgain.last('joined').playerId).toBe('p2');
    expect(benAgain.view().myPicks).toEqual([2]);
    expect(ana.last('state').room.players[1]?.presence).toBe('connected');

    advance(NET_CONFIG.reconnectGraceMs); // the cancelled grace timer must not close the room
    expect(ana.last('state').room.closed).toBe(false);
  });

  it('missing the 30 s window closes the room for the opponent', () => {
    const { ana, ben, code } = startMatch();
    const token = ben.last('joined').token;
    server.disconnect(ben);
    advance(NET_CONFIG.reconnectGraceMs);

    const room = ana.last('state').room;
    expect(room.closed).toBe(true);
    expect(room.players[1]?.presence).toBe('left');

    const benAgain = new FakeConn();
    say(benAgain, { type: 'resume', roomCode: code, token });
    expect(benAgain.last('error').code).toBe('room-closed');
  });

  it('rejects a resume with a wrong token', () => {
    const { code } = startMatch();
    const imposter = new FakeConn();
    say(imposter, { type: 'resume', roomCode: code, token: 'nope' });
    expect(imposter.last('error').code).toBe('bad-token');
  });

  it('leaving closes the room at once and stops its timers', () => {
    const { ana, ben } = startMatch();
    say(ana, { type: 'leave' });
    const room = ben.last('state').room;
    expect(room.closed).toBe(true);
    expect(room.players[0]?.presence).toBe('left');

    const count = ben.sent.length;
    advance(MEMORIZE_MS + SELECT_MS);
    expect(ben.sent).toHaveLength(count);
  });

  it('closes an idle room after 10 minutes and forgets it 10 minutes later', () => {
    const ana = new FakeConn();
    say(ana, { type: 'create', name: 'Ana', difficulty: 'medium' });
    const code = ana.last('joined').roomCode;

    advance(NET_CONFIG.roomIdleMs - 1);
    expect(ana.last('state').room.closed).toBe(false);
    advance(1);
    expect(ana.last('state').room.closed).toBe(true);

    advance(NET_CONFIG.roomIdleMs);
    const late = new FakeConn();
    say(late, { type: 'join', roomCode: code, name: 'Late' });
    expect(late.last('error').code).toBe('room-not-found');
  });
});
```

- [ ] **Step 3: Run the tests and confirm they fail**

Run: `npx vitest run server/rooms.test.ts`
Expected: FAIL, because `./rooms` can't be resolved.

- [ ] **Step 4: Create `server/rooms.ts`**

```ts
import { dealRound } from '../src/game/deal';
import { cryptoRandom } from '../src/game/deck';
import type { Difficulty } from '../src/game/gameConfig';
import type { RandomFn } from '../src/game/gameTypes';
import { createMatch, matchReducer, viewFor, type MatchAction, type MatchState, type PlayerId } from '../src/game/match';
import {
  NET_CONFIG,
  ROOM_CODE_ALPHABET,
  ROOM_CODE_LENGTH,
  parseClientMessage,
  type ErrorCode,
  type RoomView,
  type ServerMessage,
} from '../src/net/protocol';

/** One browser connection, as the room server sees it. */
export interface Connection {
  send(message: ServerMessage): void;
  close(): void;
}

export interface RoomServerOptions {
  /** Deals and room codes. Defaults to crypto-quality randomness. */
  random?: RandomFn;
  /** Where ignored or rejected messages are reported. Silent by default. */
  log?: (message: string) => void;
}

type Timer = ReturnType<typeof setTimeout>;

interface Seat {
  readonly id: PlayerId;
  readonly name: string;
  readonly token: string;
  conn: Connection | null;
  left: boolean;
  graceTimer: Timer | null;
}

interface Room {
  readonly code: string;
  readonly difficulty: Difficulty;
  readonly seats: Seat[];
  match: MatchState | null;
  closed: boolean;
  nextRoundId: number;
  phaseTimer: Timer | null;
  idleTimer: Timer | null;
}

const ERROR_TEXT: Record<ErrorCode, string> = {
  'room-not-found': 'No room with that code.',
  'room-full': 'That room is already full.',
  'room-closed': 'That game has ended.',
  'bad-token': 'That game has ended.',
};

const encoder = new TextEncoder();

/**
 * Online rooms, independent of the transport: the WebSocket layer passes in raw text
 * messages and disconnects. The server owns the deal, the clock and the score,
 * and each player only ever receives `viewFor(match, thatPlayer)`.
 */
export class RoomServer {
  private readonly rooms = new Map<string, Room>();
  private readonly seated = new Map<Connection, { room: Room; seat: Seat }>();
  private readonly rates = new Map<Connection, { start: number; count: number }>();
  private readonly random: RandomFn;
  private readonly log: (message: string) => void;

  constructor({ random = cryptoRandom, log = () => {} }: RoomServerOptions = {}) {
    this.random = random;
    this.log = log;
  }

  /** Handles one raw text message from a connection. */
  handle(conn: Connection, raw: string): void {
    if (encoder.encode(raw).length > NET_CONFIG.maxMessageBytes || this.overRate(conn)) {
      this.log('Cutting off a connection: message too large or too frequent.');
      this.disconnect(conn);
      conn.close();
      return;
    }
    const message = parseClientMessage(raw);
    if (!message) {
      this.log('Ignoring a malformed or unknown message.');
      return;
    }
    switch (message.type) {
      case 'create':
        return this.create(conn, message.name, message.difficulty);
      case 'join':
        return this.join(conn, message.roomCode, message.name);
      case 'resume':
        return this.resume(conn, message.roomCode, message.token);
      case 'toggle':
        return this.play(conn, (playerId) => ({ type: 'TOGGLE_POSITION', playerId, position: message.position }));
      case 'submit':
        return this.play(conn, (playerId) => ({ type: 'SUBMIT_SELECTION', playerId, now: Date.now() }));
      case 'nextRound':
        return this.nextRound(conn);
      case 'leave': {
        const at = this.seated.get(conn);
        if (at) this.closeRoom(at.room, at.seat);
        return;
      }
    }
  }

  /** The connection closed. Its player gets a grace period to resume. */
  disconnect(conn: Connection): void {
    this.rates.delete(conn);
    const at = this.seated.get(conn);
    if (!at) return;
    this.seated.delete(conn);
    const { room, seat } = at;
    if (seat.conn !== conn) return;
    seat.conn = null;
    if (room.closed) return;
    seat.graceTimer = setTimeout(() => {
      seat.graceTimer = null;
      this.closeRoom(room, seat);
    }, NET_CONFIG.reconnectGraceMs);
    this.broadcast(room);
  }

  /** Stops every timer and forgets every room (tests and process shutdown). */
  shutdown(): void {
    for (const room of this.rooms.values()) this.clearTimers(room);
    this.rooms.clear();
    this.seated.clear();
    this.rates.clear();
  }

  private create(conn: Connection, name: string, difficulty: Difficulty): void {
    if (this.seated.has(conn)) return;
    const room: Room = {
      code: this.newCode(),
      difficulty,
      seats: [],
      match: null,
      closed: false,
      nextRoundId: 1,
      phaseTimer: null,
      idleTimer: null,
    };
    const seat = this.newSeat('p1', name);
    room.seats.push(seat);
    this.rooms.set(room.code, room);
    this.attach(conn, room, seat);
    this.touch(room);
    this.broadcast(room);
  }

  private join(conn: Connection, code: string, name: string): void {
    if (this.seated.has(conn)) return;
    const room = this.rooms.get(code);
    if (!room) return this.fail(conn, 'room-not-found');
    if (room.closed) return this.fail(conn, 'room-closed');
    if (room.seats.length >= 2) return this.fail(conn, 'room-full');

    const taken = room.seats.some((s) => s.name.toLowerCase() === name.toLowerCase());
    const seat = this.newSeat('p2', taken ? `${name.slice(0, NET_CONFIG.maxNameLength - 2)} 2` : name);
    room.seats.push(seat);
    this.attach(conn, room, seat);
    this.touch(room);
    room.match = createMatch({
      players: room.seats.map((s) => ({ id: s.id, name: s.name })),
      difficulty: room.difficulty,
    });
    this.dispatch(room, { type: 'START_ROUND', round: this.deal(room), now: Date.now() });
  }

  private resume(conn: Connection, code: string, token: string): void {
    if (this.seated.has(conn)) return;
    const room = this.rooms.get(code);
    if (!room) return this.fail(conn, 'room-not-found');
    if (room.closed) return this.fail(conn, 'room-closed');
    const seat = room.seats.find((s) => s.token === token);
    if (!seat) return this.fail(conn, 'bad-token');
    this.attach(conn, room, seat);
    this.touch(room);
    this.broadcast(room);
  }

  private play(conn: Connection, action: (playerId: PlayerId) => MatchAction): void {
    const at = this.seated.get(conn);
    if (!at || at.room.closed) return;
    this.touch(at.room);
    this.dispatch(at.room, action(at.seat.id));
  }

  private nextRound(conn: Connection): void {
    const at = this.seated.get(conn);
    if (!at || at.room.closed) return;
    const { room } = at;
    this.touch(room);
    this.dispatch(room, { type: 'NEXT_ROUND', playerId: at.seat.id });
    const match = room.match;
    if (match?.phase === 'results' && match.players.every((p) => match.ready.includes(p.id))) {
      this.dispatch(room, { type: 'START_ROUND', round: this.deal(room), now: Date.now() });
    }
  }

  /** Applies an action; on any change, reschedules the phase timer and tells both players. */
  private dispatch(room: Room, action: MatchAction): void {
    if (!room.match) return;
    const next = matchReducer(room.match, action);
    if (next === room.match) return;
    room.match = next;
    this.schedule(room);
    this.broadcast(room);
  }

  private schedule(room: Room): void {
    if (room.phaseTimer) clearTimeout(room.phaseTimer);
    room.phaseTimer = null;
    const match = room.match;
    if (!match || !('endsAt' in match)) return;
    const { phase, endsAt } = match;
    const roundId = match.round.id;
    room.phaseTimer = setTimeout(() => {
      room.phaseTimer = null;
      this.dispatch(room, { type: 'PHASE_TIMEOUT', phase, roundId, now: Date.now() });
    }, Math.max(0, endsAt - Date.now()));
  }

  private broadcast(room: Room): void {
    const roomView: RoomView = {
      code: room.code,
      difficulty: room.difficulty,
      closed: room.closed,
      players: room.seats.map(
        (s): RoomView['players'][number] => ({
          id: s.id,
          name: s.name,
          presence: s.left ? 'left' : s.conn ? 'connected' : 'reconnecting',
        }),
      ),
    };
    const now = Date.now();
    for (const seat of room.seats) {
      seat.conn?.send({ type: 'state', room: roomView, view: room.match ? viewFor(room.match, seat.id) : null, now });
    }
  }

  private closeRoom(room: Room, leaver: Seat | null): void {
    if (room.closed) return;
    room.closed = true;
    if (leaver) leaver.left = true;
    this.clearTimers(room);
    this.broadcast(room);
    for (const seat of room.seats) {
      if (seat.conn) this.seated.delete(seat.conn);
      seat.conn = null;
    }
    // Keep the closed room for a while so late joins and resumes hear 'room-closed'.
    room.idleTimer = setTimeout(() => this.rooms.delete(room.code), NET_CONFIG.roomIdleMs);
  }

  /** Activity: push back the idle close. */
  private touch(room: Room): void {
    if (room.closed) return;
    if (room.idleTimer) clearTimeout(room.idleTimer);
    room.idleTimer = setTimeout(() => this.closeRoom(room, null), NET_CONFIG.roomIdleMs);
  }

  private clearTimers(room: Room): void {
    if (room.phaseTimer) clearTimeout(room.phaseTimer);
    if (room.idleTimer) clearTimeout(room.idleTimer);
    room.phaseTimer = null;
    room.idleTimer = null;
    for (const seat of room.seats) {
      if (seat.graceTimer) clearTimeout(seat.graceTimer);
      seat.graceTimer = null;
    }
  }

  private attach(conn: Connection, room: Room, seat: Seat): void {
    const previous = seat.conn;
    if (previous && previous !== conn) {
      this.seated.delete(previous);
      previous.close();
    }
    if (seat.graceTimer) clearTimeout(seat.graceTimer);
    seat.graceTimer = null;
    seat.conn = conn;
    this.seated.set(conn, { room, seat });
    conn.send({ type: 'joined', roomCode: room.code, playerId: seat.id, token: seat.token });
  }

  private fail(conn: Connection, code: ErrorCode): void {
    conn.send({ type: 'error', code, message: ERROR_TEXT[code] });
  }

  private deal(room: Room) {
    return dealRound(room.nextRoundId++, this.random, room.difficulty);
  }

  private newSeat(id: PlayerId, name: string): Seat {
    return { id, name, token: crypto.randomUUID(), conn: null, left: false, graceTimer: null };
  }

  private newCode(): string {
    for (;;) {
      let code = '';
      for (let i = 0; i < ROOM_CODE_LENGTH; i++) {
        code += ROOM_CODE_ALPHABET.charAt(Math.floor(this.random() * ROOM_CODE_ALPHABET.length));
      }
      if (!this.rooms.has(code)) return code;
    }
  }

  private overRate(conn: Connection): boolean {
    const now = Date.now();
    const window = this.rates.get(conn);
    if (!window || now - window.start >= 1000) {
      this.rates.set(conn, { start: now, count: 1 });
      return false;
    }
    window.count += 1;
    return window.count > NET_CONFIG.maxMessagesPerSecond;
  }
}
```

- [ ] **Step 5: Run the tests and confirm they pass**

Run: `npx vitest run server/rooms.test.ts`
Expected: PASS.

- [ ] **Step 6: Run the full suite and commit**

Run: `npm test && npm run lint && npm run typecheck`
Expected: all succeed. The typecheck now also covers `server/` through `tsconfig.server.json`.

```bash
git add server/rooms.ts server/rooms.test.ts tsconfig.server.json tsconfig.json eslint.config.js src/test/setup.ts
git commit -m "feat(server): room logic for online play

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: WebSocket server and dev wiring

**Files:**
- Create: `server/wsServer.ts`, `server/wsServer.test.ts`, `server/main.ts`
- Modify: `package.json` (dependencies and scripts), `vite.config.ts`

**Interfaces:**
- Consumes (from Task 2): `RoomServer` and `Connection`. From Task 1: `NET_CONFIG` and `ServerMessage`.
- Produces:
  - `startServer({ port, random?, log? }): Promise<RunningServer>`, with `RunningServer = { port: number; close(): Promise<void> }`. It serves WebSockets at path `/ws`.
  - npm scripts `server` (watch mode) and `start:server`.
  - The dev proxy sends `/ws` to `ws://localhost:8787`.

- [ ] **Step 1: Install the dependencies**

Run: `npm install ws tsx && npm install -D @types/ws`

`tsx` runs the TypeScript server directly, in development and when hosted, so it goes in `dependencies`.

Add these to `package.json` `scripts`:

```json
    "server": "tsx watch server/main.ts",
    "start:server": "tsx server/main.ts",
```

- [ ] **Step 2: Write the failing test**

Create `server/wsServer.test.ts`:

```ts
// @vitest-environment node
import { afterEach, describe, expect, it } from 'vitest';
import { WebSocket } from 'ws';
import { NET_CONFIG, type ServerMessage } from '../src/net/protocol';
import { startServer, type RunningServer } from './wsServer';

let server: RunningServer | null = null;

afterEach(async () => {
  await server?.close();
  server = null;
});

function connect(port: number) {
  const socket = new WebSocket(`ws://localhost:${port}/ws`);
  const messages: ServerMessage[] = [];
  socket.on('message', (data) => messages.push(JSON.parse(data.toString()) as ServerMessage));
  const opened = new Promise<void>((resolve, reject) => {
    socket.once('open', () => resolve());
    socket.once('error', reject);
  });
  const closed = new Promise<number>((resolve) => socket.once('close', (code) => resolve(code)));
  /** Resolves with the first message (already received or still to come) that matches. */
  const waitFor = (matches: (message: ServerMessage) => boolean) =>
    new Promise<ServerMessage>((resolve) => {
      const found = messages.find(matches);
      if (found) return resolve(found);
      const onMessage = () => {
        const hit = messages.find(matches);
        if (!hit) return;
        socket.off('message', onMessage);
        resolve(hit);
      };
      socket.on('message', onMessage);
    });
  const send = (message: unknown) => socket.send(JSON.stringify(message));
  return { socket, opened, closed, waitFor, send };
}

describe('startServer', () => {
  it('lets two browsers create and join a room over WebSocket', async () => {
    server = await startServer({ port: 0 });
    const ana = connect(server.port);
    await ana.opened;
    ana.send({ type: 'create', name: 'Ana', difficulty: 'easy' });
    const joined = await ana.waitFor((m) => m.type === 'joined');
    if (joined.type !== 'joined') throw new Error('expected joined');

    const ben = connect(server.port);
    await ben.opened;
    ben.send({ type: 'join', roomCode: joined.roomCode, name: 'Ben' });
    const state = await ben.waitFor((m) => m.type === 'state' && m.view?.phase === 'memorizing');
    if (state.type !== 'state') throw new Error('expected state');
    expect(state.view?.grid).toHaveLength(9);
    await ana.waitFor((m) => m.type === 'state' && m.view !== null);

    ana.socket.close();
    ben.socket.close();
  });

  it('cuts off a client that sends an oversized message', async () => {
    server = await startServer({ port: 0 });
    const client = connect(server.port);
    await client.opened;
    client.socket.send('x'.repeat(NET_CONFIG.maxMessageBytes + 1));
    await expect(client.closed).resolves.toEqual(expect.any(Number));
  });
});
```

- [ ] **Step 3: Run it and confirm it fails**

Run: `npx vitest run server/wsServer.test.ts`
Expected: FAIL, because `./wsServer` can't be resolved.

- [ ] **Step 4: Create `server/wsServer.ts` and `server/main.ts`**

`server/wsServer.ts`:

```ts
import type { AddressInfo } from 'node:net';
import { WebSocket, WebSocketServer } from 'ws';
import type { RandomFn } from '../src/game/gameTypes';
import { NET_CONFIG } from '../src/net/protocol';
import { RoomServer, type Connection } from './rooms';

export interface RunningServer {
  readonly port: number;
  close(): Promise<void>;
}

export interface StartServerOptions {
  /** 0 picks a free port (tests). */
  readonly port: number;
  readonly random?: RandomFn;
  readonly log?: (message: string) => void;
}

/** Serves online Memory Poker over WebSocket at `/ws`. */
export function startServer({ port, random, log }: StartServerOptions): Promise<RunningServer> {
  const rooms = new RoomServer({ random, log });
  const wss = new WebSocketServer({ port, path: '/ws', maxPayload: NET_CONFIG.maxMessageBytes });

  wss.on('connection', (socket) => {
    const conn: Connection = {
      send: (message) => {
        if (socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify(message));
      },
      close: () => socket.terminate(),
    };
    socket.on('message', (data, isBinary) => {
      if (isBinary) {
        conn.close();
        return;
      }
      rooms.handle(conn, data.toString());
    });
    socket.on('close', () => rooms.disconnect(conn));
    // ws reports oversized frames as errors; drop the socket.
    socket.on('error', () => socket.terminate());
  });

  return new Promise((resolve, reject) => {
    wss.once('error', reject);
    wss.once('listening', () => {
      const { port: actualPort } = wss.address() as AddressInfo;
      resolve({
        port: actualPort,
        close: () =>
          new Promise<void>((done) => {
            rooms.shutdown();
            for (const client of wss.clients) client.terminate();
            wss.close(() => done());
          }),
      });
    });
  });
}
```

`server/main.ts`:

```ts
import { startServer } from './wsServer';

const port = Number(process.env.PORT ?? 8787);
const server = await startServer({ port, log: (message) => console.warn(message) });
console.log(`Memory Poker server listening on ws://localhost:${server.port}/ws`);
```

- [ ] **Step 5: Add the dev proxy**

In `vite.config.ts`, add a `server` key to the `defineConfig({...})` object, next to `plugins`:

```ts
  server: {
    proxy: {
      // The online game server (npm run server) during development.
      '/ws': { target: 'ws://localhost:8787', ws: true },
    },
  },
```

- [ ] **Step 6: Run the tests and confirm they pass**

Run: `npx vitest run server/wsServer.test.ts`
Expected: PASS.

Then start the server by hand: `npm run start:server`. It should print `Memory Poker server listening on ws://localhost:8787/ws`. Stop it with Ctrl+C.

- [ ] **Step 7: Run the full suite and commit**

Run: `npm test && npm run lint && npm run typecheck && npm run build`

```bash
git add server/wsServer.ts server/wsServer.test.ts server/main.ts package.json package-lock.json vite.config.ts
git commit -m "feat(server): WebSocket server, scripts and dev proxy

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Browser connection hook

**Files:**
- Create: `src/app/socket.ts`, `src/app/onlineSession.ts`, `src/app/serverUrl.ts`, `src/app/useOnlineMatch.ts`, `src/test/online.ts`
- Test: `src/app/useOnlineMatch.test.tsx`

**Interfaces:**
- Consumes (from Task 1): `ClientMessage`, `ServerMessage`, `RoomView`, `ErrorCode` and `NET_CONFIG`. From the existing app: `MatchActions` (`src/app/matchActions.ts`) and `MatchView`.
- Produces:
  - `src/app/socket.ts`:
    - `interface SocketHandlers { onOpen(): void; onMessage(data: string): void; onClose(): void }`
    - `interface SocketLike { send(data: string): void; close(): void }`
    - `type SocketFactory = (url: string, handlers: SocketHandlers) => SocketLike`
    - `browserSocket: SocketFactory`
  - `src/app/onlineSession.ts`: `loadSession(): SavedSession | null`, `saveSession(s)`, `clearSession()`, and `SavedSession = { roomCode; token }`
  - `src/app/serverUrl.ts`: `serverUrl(): string`
  - `src/app/useOnlineMatch.ts`:
    - `type OnlineIntent`: `{type:'create', name, difficulty}` | `{type:'join', roomCode, name}` | `{type:'resume', roomCode, token}`
    - `type OnlineFailure = ErrorCode | 'connection-lost' | 'unreachable'`
    - `interface OnlineState { phase: 'connecting' | 'in-room' | 'reconnecting' | 'failed'; session; room; view; failure }`
    - `useOnlineMatch(intent, { url, createSocket? }): { state: OnlineState; actions: MatchActions; leave: () => void }`
  - `src/test/online.ts`: `FakeSocket`, `fakeSockets()`, `ROOM_CODE`, `JOINED`, `BOTH_CONNECTED`, `roomView()`, `serverMatch()` and `stateMessage()`

- [ ] **Step 1: Create the test helpers in `src/test/online.ts`**

```ts
import { act } from '@testing-library/react';
import type { SocketFactory, SocketHandlers, SocketLike } from '../app/socket';
import { createSeededRandom } from '../game/deck';
import { dealRound } from '../game/deal';
import { createMatch, matchReducer, viewFor, type MatchAction, type MatchState } from '../game/match';
import type { ClientMessage, RoomView, ServerMessage } from '../net/protocol';

/** A socket the test drives by hand: open it, feed it server messages, drop it. */
export class FakeSocket implements SocketLike {
  readonly sent: ClientMessage[] = [];
  closed = false;
  readonly url: string;
  private readonly handlers: SocketHandlers;

  // Plain fields, not parameter properties: erasableSyntaxOnly forbids those.
  constructor(url: string, handlers: SocketHandlers) {
    this.url = url;
    this.handlers = handlers;
  }

  send(data: string): void {
    this.sent.push(JSON.parse(data) as ClientMessage);
  }

  close(): void {
    this.closed = true;
  }

  open(): void {
    act(() => this.handlers.onOpen());
  }

  receive(message: ServerMessage): void {
    act(() => this.handlers.onMessage(JSON.stringify(message)));
  }

  drop(): void {
    act(() => this.handlers.onClose());
  }
}

export function fakeSockets() {
  const sockets: FakeSocket[] = [];
  const factory: SocketFactory = (url, handlers) => {
    const socket = new FakeSocket(url, handlers);
    sockets.push(socket);
    return socket;
  };
  const latest = () => {
    const socket = sockets.at(-1);
    if (!socket) throw new Error('No socket was opened');
    return socket;
  };
  return { sockets, factory, latest };
}

export const ROOM_CODE = 'KQPZ';

export const JOINED: ServerMessage = { type: 'joined', roomCode: ROOM_CODE, playerId: 'p1', token: 'token-ana' };

export const BOTH_CONNECTED: RoomView['players'] = [
  { id: 'p1', name: 'Ana', presence: 'connected' },
  { id: 'p2', name: 'Ben', presence: 'connected' },
];

export function roomView(players: RoomView['players'] = BOTH_CONNECTED, closed = false): RoomView {
  return { code: ROOM_CODE, difficulty: 'medium', players, closed };
}

/** The server's match between Ana (p1) and Ben (p2), started at `now` and advanced by `actions`. */
export function serverMatch(actions: MatchAction[] = [], now = Date.now()): MatchState {
  const start = createMatch({
    players: [
      { id: 'p1', name: 'Ana' },
      { id: 'p2', name: 'Ben' },
    ],
    difficulty: 'medium',
  });
  const deal: MatchAction = { type: 'START_ROUND', round: dealRound(1, createSeededRandom(9), 'medium'), now };
  return [deal, ...actions].reduce(matchReducer, start);
}

/** What the server sends Ana for `match` (or the waiting room when null). */
export function stateMessage(
  match: MatchState | null,
  players: RoomView['players'] = BOTH_CONNECTED,
  closed = false,
  now = Date.now(),
): ServerMessage {
  return { type: 'state', room: roomView(players, closed), view: match ? viewFor(match, 'p1') : null, now };
}
```

- [ ] **Step 2: Write the failing tests**

Create `src/app/useOnlineMatch.test.tsx`:

```tsx
import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DIFFICULTIES } from '../game/gameConfig';
import { NET_CONFIG } from '../net/protocol';
import { BOTH_CONNECTED, JOINED, ROOM_CODE, fakeSockets, serverMatch, stateMessage } from '../test/online';
import { loadSession } from './onlineSession';
import { useOnlineMatch, type OnlineIntent } from './useOnlineMatch';

const URL = 'ws://test.local/ws';
const CREATE: OnlineIntent = { type: 'create', name: 'Ana', difficulty: 'medium' };

function setup(intent: OnlineIntent = CREATE) {
  const fake = fakeSockets();
  const hook = renderHook(() => useOnlineMatch(intent, { url: URL, createSocket: fake.factory }));
  return { fake, hook, state: () => hook.result.current.state };
}

/** Connect and join, as Ana. */
function joined(intent: OnlineIntent = CREATE) {
  const ctx = setup(intent);
  ctx.fake.latest().open();
  ctx.fake.latest().receive(JOINED);
  return ctx;
}

const advance = (ms: number) => act(() => vi.advanceTimersByTime(ms));

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('useOnlineMatch', () => {
  it('sends the intent once connected and remembers the room', () => {
    const { fake, state } = setup();
    expect(fake.latest().url).toBe(URL);
    expect(state().phase).toBe('connecting');

    fake.latest().open();
    expect(fake.latest().sent).toEqual([CREATE]);

    fake.latest().receive(JOINED);
    fake.latest().receive(stateMessage(null, [{ id: 'p1', name: 'Ana', presence: 'connected' }]));
    expect(state()).toMatchObject({
      phase: 'in-room',
      session: { roomCode: ROOM_CODE, playerId: 'p1', token: 'token-ana' },
      view: null,
    });
    expect(state().room?.code).toBe(ROOM_CODE);
    expect(loadSession()).toEqual({ roomCode: ROOM_CODE, token: 'token-ana' });
  });

  it('converts server deadlines to this device’s clock', () => {
    const { fake, state } = joined();
    const serverNow = Date.now() + 5000;
    fake.latest().receive(stateMessage(serverMatch([], serverNow), BOTH_CONNECTED, false, serverNow));
    expect(state().view?.endsAt).toBe(Date.now() + DIFFICULTIES.medium.memorizeSeconds * 1000);
  });

  it('sends player actions', () => {
    const { fake, hook } = joined();
    act(() => {
      hook.result.current.actions.toggle(3);
      hook.result.current.actions.submit();
      hook.result.current.actions.nextRound();
    });
    expect(fake.latest().sent.slice(1)).toEqual([{ type: 'toggle', position: 3 }, { type: 'submit' }, { type: 'nextRound' }]);
  });

  it('reconnects with growing delays and resumes with the saved token', () => {
    const { fake, state } = joined();
    fake.latest().drop();
    expect(state().phase).toBe('reconnecting');
    expect(fake.sockets).toHaveLength(1);

    advance(1000);
    expect(fake.sockets).toHaveLength(2);
    fake.latest().drop(); // that attempt failed too

    advance(1999);
    expect(fake.sockets).toHaveLength(2);
    advance(1);
    expect(fake.sockets).toHaveLength(3);

    fake.latest().open();
    expect(fake.latest().sent).toEqual([{ type: 'resume', roomCode: ROOM_CODE, token: 'token-ana' }]);
    fake.latest().receive(JOINED);
    expect(state().phase).toBe('in-room');
  });

  it('gives up after 30 s and reports the connection as lost', () => {
    const { fake, state } = joined();
    fake.latest().drop();
    for (let i = 0; i < 10 && state().phase !== 'failed'; i++) {
      advance(NET_CONFIG.reconnectGraceMs); // fires the pending retry
      fake.latest().drop();
    }
    expect(state()).toMatchObject({ phase: 'failed', failure: 'connection-lost' });
    expect(loadSession()).toBeNull();
  });

  it('a server error fails the intent and closes the socket', () => {
    const { fake, state } = setup({ type: 'join', roomCode: 'ABCD', name: 'Ben' });
    fake.latest().open();
    fake.latest().receive({ type: 'error', code: 'room-not-found', message: 'No room with that code.' });
    expect(state()).toMatchObject({ phase: 'failed', failure: 'room-not-found' });
    expect(fake.latest().closed).toBe(true);
  });

  it('does not retry when the server can’t be reached before joining', () => {
    const { fake, state } = setup();
    fake.latest().drop();
    expect(state()).toMatchObject({ phase: 'failed', failure: 'unreachable' });
    advance(5000);
    expect(fake.sockets).toHaveLength(1);
  });

  it('resumes a saved room when asked to', () => {
    const { fake } = setup({ type: 'resume', roomCode: ROOM_CODE, token: 'token-ana' });
    fake.latest().open();
    expect(fake.latest().sent).toEqual([{ type: 'resume', roomCode: ROOM_CODE, token: 'token-ana' }]);
  });

  it('leave tells the server, forgets the room and stops reconnecting', () => {
    const { fake, hook } = joined();
    act(() => hook.result.current.leave());
    expect(fake.latest().sent.at(-1)).toEqual({ type: 'leave' });
    expect(fake.latest().closed).toBe(true);
    expect(loadSession()).toBeNull();
    fake.latest().drop();
    advance(5000);
    expect(fake.sockets).toHaveLength(1);
  });

  it('stops reconnecting once the room has closed', () => {
    const { fake } = joined();
    fake.latest().receive(stateMessage(null, BOTH_CONNECTED, true));
    expect(loadSession()).toBeNull();
    fake.latest().drop();
    advance(5000);
    expect(fake.sockets).toHaveLength(1);
  });

  it('unmounting closes the socket and cancels a pending retry', () => {
    const { fake, hook } = joined();
    fake.latest().drop();
    hook.unmount();
    advance(5000);
    expect(fake.sockets).toHaveLength(1);
  });
});
```

- [ ] **Step 3: Run the tests and confirm they fail**

Run: `npx vitest run src/app/useOnlineMatch.test.tsx`
Expected: FAIL, because `../app/socket`, `./onlineSession` and `./useOnlineMatch` can't be resolved.

- [ ] **Step 4: Create `src/app/socket.ts`, `src/app/onlineSession.ts` and `src/app/serverUrl.ts`**

`src/app/socket.ts`:

```ts
export interface SocketHandlers {
  onOpen(): void;
  onMessage(data: string): void;
  onClose(): void;
}

/** The small part of a WebSocket the online hook uses, so tests can fake it. */
export interface SocketLike {
  send(data: string): void;
  close(): void;
}

export type SocketFactory = (url: string, handlers: SocketHandlers) => SocketLike;

/** A real browser WebSocket behind `SocketLike`. An error is always followed by close. */
export const browserSocket: SocketFactory = (url, handlers) => {
  const ws = new WebSocket(url);
  ws.addEventListener('open', () => handlers.onOpen());
  ws.addEventListener('message', (event: MessageEvent) => {
    if (typeof event.data === 'string') handlers.onMessage(event.data);
  });
  ws.addEventListener('close', () => handlers.onClose());
  return {
    send: (data) => {
      if (ws.readyState === WebSocket.OPEN) ws.send(data);
    },
    close: () => ws.close(),
  };
};
```

`src/app/onlineSession.ts`:

```ts
const KEY = 'memory-poker:online';

export interface SavedSession {
  readonly roomCode: string;
  readonly token: string;
}

/** The online room this tab is in, so a reload can resume it. Storage may be unavailable. */
export function loadSession(): SavedSession | null {
  try {
    const raw = sessionStorage.getItem(KEY);
    if (!raw) return null;
    const value: unknown = JSON.parse(raw);
    if (typeof value !== 'object' || value === null) return null;
    const { roomCode, token } = value as Record<string, unknown>;
    return typeof roomCode === 'string' && typeof token === 'string' ? { roomCode, token } : null;
  } catch {
    return null;
  }
}

export function saveSession(session: SavedSession): void {
  try {
    sessionStorage.setItem(KEY, JSON.stringify(session));
  } catch {
    // A reload just won't resume the room.
  }
}

export function clearSession(): void {
  try {
    sessionStorage.removeItem(KEY);
  } catch {
    // Nothing to clear.
  }
}
```

`src/app/serverUrl.ts`:

```ts
/**
 * Where the online game server is. Set VITE_SERVER_URL (for example
 * wss://poker.example.com/ws) when the server is hosted separately.
 * Otherwise the page's own host is used, and the Vite dev server proxies
 * `/ws` to `npm run server`.
 */
export function serverUrl(): string {
  const configured: unknown = import.meta.env.VITE_SERVER_URL;
  if (typeof configured === 'string' && configured !== '') return configured;
  const scheme = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${scheme}//${window.location.host}/ws`;
}
```

- [ ] **Step 5: Create `src/app/useOnlineMatch.ts`**

```ts
import { useCallback, useEffect, useMemo, useReducer, useRef } from 'react';
import type { Difficulty } from '../game/gameConfig';
import type { MatchView } from '../game/match';
import { NET_CONFIG, type ClientMessage, type ErrorCode, type RoomView, type ServerMessage } from '../net/protocol';
import type { MatchActions } from './matchActions';
import { clearSession, saveSession, type SavedSession } from './onlineSession';
import { browserSocket, type SocketFactory, type SocketLike } from './socket';

export type OnlineIntent =
  | { readonly type: 'create'; readonly name: string; readonly difficulty: Difficulty }
  | { readonly type: 'join'; readonly roomCode: string; readonly name: string }
  | { readonly type: 'resume'; readonly roomCode: string; readonly token: string };

export type OnlineFailure = ErrorCode | 'connection-lost' | 'unreachable';

export interface OnlineSession {
  readonly roomCode: string;
  readonly playerId: string;
  readonly token: string;
}

export interface OnlineState {
  readonly phase: 'connecting' | 'in-room' | 'reconnecting' | 'failed';
  readonly session: OnlineSession | null;
  readonly room: RoomView | null;
  /** The latest match view, with `endsAt` converted to this device's clock. */
  readonly view: MatchView | null;
  readonly failure: OnlineFailure | null;
}

type OnlineEvent =
  | { readonly type: 'joined'; readonly session: OnlineSession }
  | { readonly type: 'state'; readonly room: RoomView; readonly view: MatchView | null; readonly offset: number }
  | { readonly type: 'dropped' }
  | { readonly type: 'failed'; readonly failure: OnlineFailure };

const INITIAL: OnlineState = { phase: 'connecting', session: null, room: null, view: null, failure: null };

function onlineReducer(state: OnlineState, event: OnlineEvent): OnlineState {
  switch (event.type) {
    case 'joined':
      return { ...state, phase: 'in-room', session: event.session, failure: null };
    case 'state': {
      const { view, offset } = event;
      return {
        ...state,
        room: event.room,
        // The server's clock may differ from this device's: shift deadlines by the difference.
        view: view && view.endsAt !== null ? { ...view, endsAt: view.endsAt - offset } : view,
      };
    }
    case 'dropped':
      return state.phase === 'failed' ? state : { ...state, phase: 'reconnecting' };
    case 'failed':
      return { ...state, phase: 'failed', failure: event.failure };
  }
}

export interface UseOnlineMatchOptions {
  readonly url: string;
  readonly createSocket?: SocketFactory;
}

/**
 * One online match: connects, sends the intent (create, join or resume), and
 * keeps the latest room and match view from the server. When a joined
 * connection drops, it retries with growing delays (1 s, 2 s, 4 s…) for up to
 * 30 s and resumes with the saved token.
 */
export function useOnlineMatch(
  intent: OnlineIntent,
  { url, createSocket = browserSocket }: UseOnlineMatchOptions,
): { state: OnlineState; actions: MatchActions; leave: () => void } {
  const [state, dispatch] = useReducer(onlineReducer, INITIAL);
  const socketRef = useRef<SocketLike | null>(null);
  const stopRef = useRef<() => void>(() => {});

  useEffect(() => {
    let socket: SocketLike | null = null;
    let stopped = false;
    let resumeFrom: SavedSession | null =
      intent.type === 'resume' ? { roomCode: intent.roomCode, token: intent.token } : null;
    let droppedAt: number | null = null;
    let attempt = 0;
    let retry: ReturnType<typeof setTimeout> | null = null;

    const send = (message: ClientMessage) => socket?.send(JSON.stringify(message));

    const stop = () => {
      stopped = true;
      if (retry) clearTimeout(retry);
      retry = null;
      if (socketRef.current === socket) socketRef.current = null;
      socket?.close();
      socket = null;
    };

    const fail = (failure: OnlineFailure) => {
      clearSession();
      dispatch({ type: 'failed', failure });
      stop();
    };

    const onMessage = (data: string) => {
      if (stopped) return;
      let message: ServerMessage;
      try {
        message = JSON.parse(data) as ServerMessage;
      } catch {
        return;
      }
      switch (message.type) {
        case 'joined':
          droppedAt = null;
          attempt = 0;
          resumeFrom = { roomCode: message.roomCode, token: message.token };
          saveSession(resumeFrom);
          dispatch({
            type: 'joined',
            session: { roomCode: message.roomCode, playerId: message.playerId, token: message.token },
          });
          return;
        case 'state':
          dispatch({ type: 'state', room: message.room, view: message.view, offset: message.now - Date.now() });
          if (message.room.closed) {
            // The game is over: nothing to resume, so never reconnect.
            clearSession();
            resumeFrom = null;
            stopped = true;
          }
          return;
        case 'error':
          fail(message.code);
          return;
      }
    };

    const onClose = () => {
      if (stopped) return;
      if (socketRef.current === socket) socketRef.current = null;
      socket = null;
      // Before joining there is nothing to resume, and resending create/join could duplicate a room.
      if (!resumeFrom) {
        fail('unreachable');
        return;
      }
      const now = Date.now();
      droppedAt ??= now;
      const remaining = NET_CONFIG.reconnectGraceMs - (now - droppedAt);
      if (remaining <= 0) {
        fail('connection-lost');
        return;
      }
      dispatch({ type: 'dropped' });
      retry = setTimeout(connect, Math.min(1000 * 2 ** attempt, remaining));
      attempt += 1;
    };

    function connect() {
      retry = null;
      socket = createSocket(url, {
        onOpen: () => {
          if (resumeFrom) send({ type: 'resume', ...resumeFrom });
          else if (intent.type !== 'resume') send(intent);
        },
        onMessage,
        onClose,
      });
      socketRef.current = socket;
    }

    stopRef.current = stop;
    connect();
    return stop;
  }, [intent, url, createSocket]);

  const sendAction = useCallback((message: ClientMessage) => {
    socketRef.current?.send(JSON.stringify(message));
  }, []);

  const leave = useCallback(() => {
    sendAction({ type: 'leave' });
    clearSession();
    stopRef.current();
  }, [sendAction]);

  const actions = useMemo<MatchActions>(
    () => ({
      toggle: (position) => sendAction({ type: 'toggle', position }),
      submit: () => sendAction({ type: 'submit' }),
      nextRound: () => sendAction({ type: 'nextRound' }),
      // Online play is simultaneous: there are no handoffs.
      beginTurn: () => {},
    }),
    [sendAction],
  );

  return { state, actions, leave };
}
```

- [ ] **Step 6: Run the tests and confirm they pass**

Run: `npx vitest run src/app/useOnlineMatch.test.tsx`
Expected: PASS.

- [ ] **Step 7: Run the full suite and commit**

Run: `npm test && npm run lint && npm run typecheck`

```bash
git add src/app/socket.ts src/app/onlineSession.ts src/app/serverUrl.ts src/app/useOnlineMatch.ts \
  src/app/useOnlineMatch.test.tsx src/test/online.ts
git commit -m "feat(online): connection hook with reconnect and clock offset

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Online mode, from the lobby to results

**Files:**
- Create: `src/components/WaitingRoom.tsx`, `src/screens/OnlineMatchScreen.tsx`
- Test: `src/screens/OnlineMatchScreen.test.tsx`
- Modify: `src/game/gameConfig.ts`, `src/screens/LobbyScreen.tsx`, `src/screens/MatchScreen.tsx`, `src/components/MatchResultPanel.tsx`, `src/app/App.tsx`, `README.md`, `CLAUDE.md`, `docs/superpowers/specs/2026-11-13-multiplayer-design.md`

**Interfaces:**
- Consumes (from Task 4): `useOnlineMatch`, `OnlineIntent`, `OnlineFailure`, `loadSession`, `serverUrl`, `SocketFactory`, and the test helpers in `src/test/online.ts`. From Task 1: `NET_CONFIG`, `normalizeRoomCode`, `isRoomCode` and `RoomView`.
- Produces:
  - `GameMode` gains `'online'`.
  - `App` gains an optional `createSocket?: SocketFactory` prop (tests).
  - `MatchScreen` gains `banner?: ReactNode`.
  - `MatchResultPanel` gains `waitingFor?: string | null`.
  - New props on `LobbyScreen`:
    - `onlineName: string`
    - `onOnlineNameChange: (name: string) => void`
    - `onJoin: (roomCode: string) => void`
    - `onlineError: string | null`

- [ ] **Step 1: Write the failing tests**

Create `src/screens/OnlineMatchScreen.test.tsx`:

```tsx
import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from '../app/App';
import { loadSession, saveSession } from '../app/onlineSession';
import { DIFFICULTIES } from '../game/gameConfig';
import { matchReducer, type MatchAction } from '../game/match';
import { BOTH_CONNECTED, JOINED, ROOM_CODE, fakeSockets, serverMatch, stateMessage } from '../test/online';

const MEDIUM = DIFFICULTIES.medium;

function advance(ms: number) {
  act(() => {
    vi.advanceTimersByTime(ms);
  });
}

function renderApp() {
  const fake = fakeSockets();
  render(<App createSocket={fake.factory} />);
  return fake;
}

function chooseOnline(name = 'Ana') {
  fireEvent.click(screen.getByRole('radio', { name: /^Online/ }));
  fireEvent.change(screen.getByRole('textbox', { name: 'Your name' }), { target: { value: name } });
}

/** Create a room as Ana and get to the memorizing phase of round 1. */
function inMatch() {
  const fake = renderApp();
  chooseOnline();
  fireEvent.click(screen.getByRole('button', { name: 'Create medium room' }));
  const socket = fake.latest();
  socket.open();
  socket.receive(JOINED);
  socket.receive(stateMessage(serverMatch()));
  return { fake, socket };
}

const memorizeOver = (): MatchAction => ({ type: 'PHASE_TIMEOUT', phase: 'memorizing', roundId: 1, now: Date.now() });
const pick = (playerId: string, position: number): MatchAction => ({ type: 'TOGGLE_POSITION', playerId, position });
const lockIn = (playerId: string): MatchAction => ({ type: 'SUBMIT_SELECTION', playerId, now: Date.now() });

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('Online play', () => {
  it('the lobby offers create and join, and cleans up typed room codes', () => {
    renderApp();
    chooseOnline();
    expect(screen.getByRole('button', { name: 'Create medium room' })).toBeEnabled();
    const join = screen.getByRole('button', { name: 'Join room' });
    expect(join).toBeDisabled();
    fireEvent.change(screen.getByRole('textbox', { name: 'Room code' }), { target: { value: 'k-q p z9' } });
    expect(screen.getByRole('textbox', { name: 'Room code' })).toHaveValue('KQPZ');
    expect(join).toBeEnabled();
    expect(screen.getByText(/Your opponent picks at the same time on their own device/)).toBeInTheDocument();
  });

  it('shows the room code until an opponent joins, then plays a round', () => {
    const fake = renderApp();
    chooseOnline();
    fireEvent.click(screen.getByRole('button', { name: 'Create medium room' }));
    const socket = fake.latest();
    expect(screen.getByText('Connecting…')).toBeInTheDocument();

    socket.open();
    expect(socket.sent).toEqual([{ type: 'create', name: 'Ana', difficulty: 'medium' }]);
    socket.receive(JOINED);
    socket.receive(stateMessage(null, [{ id: 'p1', name: 'Ana', presence: 'connected' }]));
    expect(screen.getByTestId('room-code')).toHaveTextContent(ROOM_CODE);
    expect(screen.getByText('Waiting for an opponent to join…')).toBeInTheDocument();

    socket.receive(stateMessage(serverMatch()));
    expect(screen.getAllByTestId(/grid-slot-/)).toHaveLength(16);
    expect(screen.getByTestId('scoreboard')).toHaveAccessibleName('Score: Ana 0, Ben 0, 0 ties');

    socket.receive(stateMessage(serverMatch([memorizeOver()])));
    fireEvent.click(screen.getByTestId('grid-slot-0'));
    expect(socket.sent.at(-1)).toEqual({ type: 'toggle', position: 0 });

    socket.receive(stateMessage(serverMatch([memorizeOver(), pick('p1', 0), pick('p1', 1)])));
    fireEvent.click(screen.getByRole('button', { name: 'Lock in picks' }));
    expect(socket.sent.at(-1)).toEqual({ type: 'submit' });

    const results = serverMatch([
      memorizeOver(),
      pick('p1', 0),
      pick('p1', 1),
      lockIn('p1'),
      pick('p2', 2),
      pick('p2', 3),
      lockIn('p2'),
      { type: 'PHASE_TIMEOUT', phase: 'revealing', roundId: 1, now: Date.now() },
    ]);
    socket.receive(stateMessage(results));
    expect(screen.getByRole('heading', { name: /You win the round|Ben wins the round|It's a tie/ })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Next round' }));
    expect(socket.sent.at(-1)).toEqual({ type: 'nextRound' });
    socket.receive(stateMessage(matchReducer(results, { type: 'NEXT_ROUND', playerId: 'p1' })));
    expect(screen.getByRole('button', { name: 'Waiting for Ben…' })).toBeDisabled();
  });

  it('shows the countdown on this device’s clock when the server clock differs', () => {
    const { socket } = inMatch();
    const serverNow = Date.now() - 60_000;
    socket.receive(stateMessage(serverMatch([], serverNow), BOTH_CONNECTED, false, serverNow));
    expect(screen.getByTestId('countdown')).toHaveAccessibleName(`Memorize: ${MEDIUM.memorizeSeconds} seconds left`);
  });

  it('a join error returns to the lobby with a message', () => {
    const fake = renderApp();
    chooseOnline('Ben');
    fireEvent.change(screen.getByRole('textbox', { name: 'Room code' }), { target: { value: 'ABCD' } });
    fireEvent.click(screen.getByRole('button', { name: 'Join room' }));
    fake.latest().open();
    expect(fake.latest().sent).toEqual([{ type: 'join', roomCode: 'ABCD', name: 'Ben' }]);

    fake.latest().receive({ type: 'error', code: 'room-not-found', message: 'No room with that code.' });
    expect(screen.getByRole('alert')).toHaveTextContent('No room with that code.');
    expect(screen.getByRole('button', { name: 'Join room' })).toBeInTheDocument();
  });

  it('shows connection banners for either side and resumes after a drop', () => {
    const { fake, socket } = inMatch();
    socket.drop();
    expect(screen.getByTestId('connection-banner')).toHaveTextContent('Connection lost. Reconnecting…');

    advance(1000);
    const again = fake.latest();
    again.open();
    expect(again.sent).toEqual([{ type: 'resume', roomCode: ROOM_CODE, token: 'token-ana' }]);
    again.receive(JOINED);
    again.receive(stateMessage(serverMatch()));
    expect(screen.queryByTestId('connection-banner')).not.toBeInTheDocument();

    again.receive(
      stateMessage(serverMatch(), [
        { id: 'p1', name: 'Ana', presence: 'connected' },
        { id: 'p2', name: 'Ben', presence: 'reconnecting' },
      ]),
    );
    expect(screen.getByTestId('connection-banner')).toHaveTextContent(/Ben lost connection/);
  });

  it('when the opponent leaves, says so and goes back to the lobby', () => {
    const { socket } = inMatch();
    socket.receive(
      stateMessage(
        serverMatch(),
        [
          { id: 'p1', name: 'Ana', presence: 'connected' },
          { id: 'p2', name: 'Ben', presence: 'left' },
        ],
        true,
      ),
    );
    expect(screen.getByRole('heading', { name: 'Ben left the game' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Back to lobby' }));
    expect(screen.getByRole('button', { name: 'Create medium room' })).toBeInTheDocument();
  });

  it('leaving mid-match tells the server, forgets the room and stops every timer', () => {
    const { socket } = inMatch();
    fireEvent.click(screen.getByRole('button', { name: 'Exit to lobby' }));
    expect(socket.sent.at(-1)).toEqual({ type: 'leave' });
    expect(socket.closed).toBe(true);
    expect(loadSession()).toBeNull();
    advance(60_000);
    expect(screen.getByRole('button', { name: 'Create medium room' })).toBeInTheDocument();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('a reload resumes the saved room', () => {
    saveSession({ roomCode: ROOM_CODE, token: 'token-ana' });
    const fake = renderApp();
    fake.latest().open();
    expect(fake.latest().sent).toEqual([{ type: 'resume', roomCode: ROOM_CODE, token: 'token-ana' }]);
  });
});
```

- [ ] **Step 2: Run the tests and confirm they fail**

Run: `npx vitest run src/screens/OnlineMatchScreen.test.tsx`
Expected: FAIL. There's no "Online" radio, and `App` has no `createSocket` prop.

- [ ] **Step 3: Add the mode to `src/game/gameConfig.ts`**

- Change `GameMode` to `'solo' | 'computer' | 'local' | 'online'`.
- Add `{ id: 'online', label: 'Online', summary: 'Play a friend on another device.' }` as the last entry in `GAME_MODES`.
- Replace the doc comment directly above `export type GameMode` with `/** Ways to play. Online play needs the game server (npm run server). */`.

- [ ] **Step 4: Create `src/components/WaitingRoom.tsx`**

```tsx
import { useState } from 'react';

interface WaitingRoomProps {
  code: string;
  levelLabel: string;
  /** This device lost its connection and is trying to get it back. */
  reconnecting: boolean;
  onLeave: () => void;
}

/** Online: the room exists, and its code is shown until an opponent joins. */
export function WaitingRoom({ code, levelLabel, reconnecting, onLeave }: WaitingRoomProps) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  };

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col justify-center px-4 py-10 text-center">
      <section className="fade-up rounded-2xl border border-line bg-charcoal/80 p-6" aria-labelledby="waiting-heading">
        <p className="text-[0.7rem] font-semibold uppercase tracking-[0.18em] text-gold">{levelLabel} room</p>
        <h1 id="waiting-heading" className="mt-1 font-display text-3xl font-semibold text-ink">
          Share this code
        </h1>
        <p
          className="mt-4 font-display text-5xl font-semibold tracking-[0.3em] text-gold-bright"
          data-testid="room-code"
        >
          {code}
        </p>
        <button
          type="button"
          onClick={() => void copy()}
          className="mt-4 rounded-xl border border-gold/60 px-4 py-2 text-sm font-semibold text-gold transition hover:bg-gold/10"
        >
          {copied ? 'Copied ✓' : 'Copy code'}
        </button>
        <p className="mt-5 text-ink/85" role="status">
          {reconnecting ? 'Connection lost. Reconnecting…' : 'Waiting for an opponent to join…'}
        </p>
        <button
          type="button"
          onClick={onLeave}
          className="mt-4 text-sm text-muted underline-offset-4 transition hover:text-ink hover:underline"
        >
          Leave room
        </button>
      </section>
    </main>
  );
}
```

- [ ] **Step 5: Add `waitingFor` to `MatchResultPanel` and `banner` to `MatchScreen`**

In `src/components/MatchResultPanel.tsx`:
- Add this prop:
  ```ts
  /** Online: this player pressed Next round and is waiting for this opponent. */
  waitingFor?: string | null;
  ```
  Destructure it as `waitingFor = null`.
- Change the Next round button to:
  ```tsx
        <button
          type="button"
          onClick={onNextRound}
          disabled={waitingFor !== null}
          className="flex-1 rounded-xl bg-gold px-5 py-3.5 font-semibold text-night shadow-[0_8px_24px_-10px_rgb(216_180_106/0.7)] transition hover:bg-gold-bright active:translate-y-px disabled:cursor-not-allowed disabled:opacity-60"
        >
          {waitingFor !== null ? `Waiting for ${waitingFor}…` : 'Next round'}
        </button>
  ```

In `src/screens/MatchScreen.tsx`:
- Add `import type { ReactNode } from 'react';`. Add `banner?: ReactNode;` to `MatchScreenProps`, with the doc comment `/** Online: connection notices shown under the scoreboard. */`. Destructure `banner`.
- Right after the line `{scoreboard}` in the main layout, add `{banner}`.
- Next to the existing `const results = view.results;`, add:
  ```ts
  // Online: this player is ready for the next round and the opponent isn't yet.
  const waitingFor =
    !shared && results?.ready.includes(view.me) && opponent && !results.ready.includes(opponent.id)
      ? opponent.name
      : null;
  ```
  Then pass `waitingFor={waitingFor}` to `MatchResultPanel`.

- [ ] **Step 6: Create `src/screens/OnlineMatchScreen.tsx`**

```tsx
import { useCallback, useEffect } from 'react';
import type { SocketFactory } from '../app/socket';
import { useOnlineMatch, type OnlineFailure, type OnlineIntent } from '../app/useOnlineMatch';
import { Scoreboard } from '../components/Scoreboard';
import { WaitingRoom } from '../components/WaitingRoom';
import { DIFFICULTIES } from '../game/gameConfig';
import type { MatchView } from '../game/match';
import { NET_CONFIG, type RoomView } from '../net/protocol';
import { MatchScreen } from './MatchScreen';

const FAILURE_TEXT: Record<OnlineFailure, string> = {
  'room-not-found': 'No room with that code.',
  'room-full': 'That room is already full.',
  'room-closed': 'That game has ended.',
  'bad-token': 'That game has ended.',
  'connection-lost': 'Connection lost.',
  unreachable: 'Couldn’t reach the game server. Try again in a moment.',
};

interface OnlineMatchScreenProps {
  intent: OnlineIntent;
  url: string;
  createSocket?: SocketFactory;
  /** Back to the lobby, with an error to show there (or null). */
  onExit: (error: string | null) => void;
}

/** An online match, from connecting through the waiting room to the end of the match. */
export function OnlineMatchScreen({ intent, url, createSocket, onExit }: OnlineMatchScreenProps) {
  const { state, actions, leave } = useOnlineMatch(intent, { url, createSocket });
  const exit = useCallback(() => {
    leave();
    onExit(null);
  }, [leave, onExit]);

  useEffect(() => {
    if (state.failure) onExit(FAILURE_TEXT[state.failure]);
  }, [state.failure, onExit]);

  const { room, view } = state;
  if (state.phase === 'failed') return null;
  if (!room) {
    return (
      <p className="grid min-h-dvh place-items-center text-muted" role="status">
        Connecting…
      </p>
    );
  }
  if (room.closed) return <RoomClosed room={room} view={view} me={state.session?.playerId ?? null} onBack={exit} />;
  if (!view) {
    return (
      <WaitingRoom
        code={room.code}
        levelLabel={DIFFICULTIES[room.difficulty].label}
        reconnecting={state.phase === 'reconnecting'}
        onLeave={exit}
      />
    );
  }
  return (
    <MatchScreen
      view={view}
      actions={actions}
      onLeave={exit}
      banner={<ConnectionBanner reconnecting={state.phase === 'reconnecting'} room={room} me={view.me} />}
    />
  );
}

function ConnectionBanner({ reconnecting, room, me }: { reconnecting: boolean; room: RoomView; me: string }) {
  const away = room.players.find((p) => p.id !== me && p.presence === 'reconnecting');
  const seconds = NET_CONFIG.reconnectGraceMs / 1000;
  const text = reconnecting
    ? 'Connection lost. Reconnecting…'
    : away
      ? `${away.name} lost connection. Waiting up to ${seconds} seconds for them to come back…`
      : null;
  if (!text) return null;
  return (
    <p
      role="status"
      className="mb-3 rounded-xl border border-alert/40 bg-alert/10 px-4 py-2 text-center text-sm text-ink"
      data-testid="connection-banner"
    >
      {text}
    </p>
  );
}

function RoomClosed({
  room,
  view,
  me,
  onBack,
}: {
  room: RoomView;
  view: MatchView | null;
  me: string | null;
  onBack: () => void;
}) {
  const gone = room.players.find((p) => p.presence === 'left' && p.id !== me);
  const idleMinutes = NET_CONFIG.roomIdleMs / 60_000;
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col justify-center px-4 py-10 text-center">
      {view && <Scoreboard me={view.me} players={view.players} ties={view.ties} />}
      <section className="fade-up rounded-2xl border border-line bg-charcoal/80 p-6" aria-labelledby="closed-heading">
        <h1 id="closed-heading" className="font-display text-3xl font-semibold text-ink">
          {gone ? `${gone.name} left the game` : 'This room has closed'}
        </h1>
        <p className="mt-3 text-ink/85">
          {gone ? 'The match is over.' : `Nobody played for ${idleMinutes} minutes.`}
        </p>
        <button
          type="button"
          onClick={onBack}
          className="mt-6 w-full rounded-xl bg-gold px-5 py-3.5 font-semibold text-night transition hover:bg-gold-bright"
        >
          Back to lobby
        </button>
      </section>
    </main>
  );
}
```

- [ ] **Step 7: Update `src/screens/LobbyScreen.tsx`**

- Imports:
  - Add `import { useState, type CSSProperties } from 'react';`, replacing the existing `CSSProperties`-only import.
  - Add `import { NET_CONFIG, isRoomCode, normalizeRoomCode } from '../net/protocol';`.
- Props: add
  ```ts
  onlineName: string;
  onOnlineNameChange: (name: string) => void;
  onJoin: (roomCode: string) => void;
  /** Why the last online attempt failed, shown under the join form. */
  onlineError: string | null;
  ```
  and destructure them. Inside the component, add `const [roomCode, setRoomCode] = useState('');`.
- In `stepsFor`, change the Select `body` so online gets its own sentence. Insert this branch before the `mode === 'local'` branch:
  ```ts
          : mode === 'online'
            ? `Pick ${picksRequired} face-down grid positions from memory. Your opponent picks at the same time on their own device, and you may both pick the same card.`
  ```
  The full expression becomes `mode === 'computer' ? … : mode === 'online' ? … : mode === 'local' ? … : …`.
- In the mode tile grid, change `sm:grid-cols-3` to `sm:grid-cols-2`, so the four modes sit 2×2 from `sm` up and stack on phones.
- Right after the `{mode === 'local' && (…)}` block, add:
  ```tsx
        {mode === 'online' && (
          <fieldset className="mx-auto mt-6 max-w-xl text-left">
            <legend className="mx-auto mb-3 text-[0.7rem] font-semibold uppercase tracking-[0.2em] text-gold">
              Online
            </legend>
            <label className="block text-xs font-medium text-muted">
              Your name
              <input
                type="text"
                value={onlineName}
                maxLength={NET_CONFIG.maxNameLength}
                placeholder="Player"
                autoComplete="off"
                onChange={(event) => onOnlineNameChange(event.target.value)}
                className="mt-1 block w-full rounded-xl border border-line bg-charcoal/70 px-3 py-2.5 text-base text-ink placeholder:text-subtle focus:border-gold focus:outline-none"
              />
            </label>
            <form
              className="mt-3 flex items-end gap-2"
              onSubmit={(event) => {
                event.preventDefault();
                if (isRoomCode(roomCode)) onJoin(roomCode);
              }}
            >
              <label className="block flex-1 text-xs font-medium text-muted">
                Room code
                <input
                  type="text"
                  value={roomCode}
                  autoCapitalize="characters"
                  autoComplete="off"
                  spellCheck={false}
                  placeholder="ABCD"
                  onChange={(event) => setRoomCode(normalizeRoomCode(event.target.value))}
                  className="mt-1 block w-full rounded-xl border border-line bg-charcoal/70 px-3 py-2.5 font-display text-lg uppercase tracking-[0.3em] text-ink placeholder:text-subtle focus:border-gold focus:outline-none"
                />
              </label>
              <button
                type="submit"
                disabled={!isRoomCode(roomCode)}
                className="rounded-xl border border-gold/60 px-4 py-2.5 font-semibold text-gold transition hover:bg-gold/10 disabled:cursor-not-allowed disabled:border-line disabled:text-subtle"
              >
                Join room
              </button>
            </form>
            {onlineError && (
              <p role="alert" className="mt-3 text-sm text-alert">
                {onlineError}
              </p>
            )}
          </fieldset>
        )}
  ```
- Replace the contents of the start button with:
  ```tsx
          {mode === 'online'
            ? `Create ${settings.label.toLowerCase()} room`
            : `Start ${settings.label.toLowerCase()} game${mode === 'computer' ? ' vs computer' : mode === 'local' ? ' for two' : ''}`}
  ```

- [ ] **Step 8: Wire up `src/app/App.tsx`**

- Imports:
  ```ts
  import { OnlineMatchScreen } from '../screens/OnlineMatchScreen';
  import { loadSession } from './onlineSession';
  import { serverUrl } from './serverUrl';
  import type { SocketFactory } from './socket';
  import type { OnlineIntent } from './useOnlineMatch';
  ```
- Add to `AppProps`:
  ```ts
  /** Injectable socket for online-play tests. Defaults to a real WebSocket. */
  createSocket?: SocketFactory;
  ```
  Destructure it as `{ random = cryptoRandom, createSocket }`.
- Change the `match` state type to `{ mode: 'computer' | 'local'; names: [string, string] } | null`.
- Add state:
  ```ts
  const [onlineName, setOnlineName] = useState('');
  // A saved session means this tab was in an online room before a reload: resume it.
  const [online, setOnline] = useState<OnlineIntent | null>(() => {
    const saved = loadSession();
    return saved ? { type: 'resume', roomCode: saved.roomCode, token: saved.token } : null;
  });
  const [onlineError, setOnlineError] = useState<string | null>(null);
  ```
- In `start`, after the `solo` branch, add:
  ```ts
    if (mode === 'online') {
      setOnlineError(null);
      setOnline({ type: 'create', name: onlineName, difficulty });
      return;
    }
  ```
  and add `onlineName` and `difficulty` to its dependency array.
- Add these callbacks after `leaveMatch`:
  ```ts
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
  ```
- Make this the first render branch:
  ```tsx
  if (online) {
    return <OnlineMatchScreen intent={online} url={serverUrl()} createSocket={createSocket} onExit={exitOnline} />;
  }
  ```
- Pass these to `LobbyScreen`: `onlineName={onlineName}`, `onOnlineNameChange={setOnlineName}`, `onJoin={joinRoom}` and `onlineError={onlineError}`.

- [ ] **Step 9: Run the tests and confirm they pass**

Run: `npx vitest run src/screens/OnlineMatchScreen.test.tsx`
Expected: PASS.

Run: `npm test`
Expected: the whole suite passes, including the unchanged Solo, Vs computer and Two players tests.

- [ ] **Step 10: Check it by hand in two browsers**

Run `npm run server` in one terminal and `npm run dev -- --host` in another. Then:
1. In window A, choose **Online**, enter "Ana" and press **Create medium room**. A code appears.
2. In window B (or a phone on the same Wi-Fi, using the network URL Vite prints), choose **Online**, enter "Ben", type the code and press **Join room**. Both windows start memorizing together, with the same countdown.
3. Both players pick and lock in. Each side shows "Ben has locked in ✓" for the other. The results match on both screens.
4. Press **Next round** in A and check that it shows "Waiting for Ben…". Press it in B, and the next round starts on both.
5. Reload B in the middle of a round. B resumes with its picks, and A briefly shows "Ben lost connection…".
6. Close B's tab. After 30 s, A shows "Ben left the game".
7. At 375 px width: check the lobby's online form and the waiting room fit with no sideways scrolling.

- [ ] **Step 11: Update the docs**

`README.md`: after the "Two players, one device" section, add:

````markdown
## Online play

One player chooses **Online → Create room** and shares the 4-letter code. The other chooses
**Online**, types the code and presses **Join room**. Both play the same grid at the same time on
their own devices, and the stronger hand wins the round. The game server deals, keeps time and
scores, and it never sends a face-down card to a device. If a connection drops, the game keeps
running and the player has 30 s to come back: reconnecting is automatic, and a reload works too.
After that the room closes. An unused room closes after 10 minutes.

```bash
npm run server          # the game server on ws://localhost:8787/ws (restarts on changes)
npm run dev -- --host   # the app; Vite proxies /ws to the server. --host lets phones on your Wi-Fi join
```

To deploy, run `npm install && npm run start:server` on a Node 20+ host (it listens on `$PORT`),
and build the app with `VITE_SERVER_URL=wss://<your-server>/ws npm run build`.
````

Also, in the README architecture tree:
- add `net/protocol.ts` (the message format shared with the server)
- add a top-level `server/` entry (`rooms.ts`, `wsServer.ts`, `main.ts`)
- under `app/`, add `useOnlineMatch`, `socket` and `onlineSession`
- under `components/`, add `WaitingRoom`
- under `screens/`, add `OnlineMatchScreen`

`CLAUDE.md`:
- Add `npm run server` to the Commands block.
- Change the Modes bullet so Online is marked "(room code, built)".
- Mark build-order steps 4 and 5 done.
- Add this bullet to Conventions: "`src/net` is shared with the Node server: no React, DOM or Node APIs."

`docs/superpowers/specs/2026-11-13-multiplayer-design.md`, section 4 (Error handling):
- Replace the "Leaving or closing the tab" bullet with:
  `- **Leaving:** the Leave and Exit buttons send leave, so the opponent sees "Opponent left" right away. Closing the tab does not send leave, because pagehide also fires on reload, which must resume. The 30 s grace window covers a closed tab.`
- Add after the "Server unreachable" bullet:
  `- **First connection:** if the very first connection fails before the room is joined, the browser shows "Couldn't reach the game server" instead of retrying, since resending create or join could duplicate a room.`
- Add to section 2 Rooms: `- A closed room is kept for 10 minutes so late joins and resumes get room-closed, then it is forgotten.`

- [ ] **Step 12: Run the full suite and commit**

Run: `npm test && npm run lint && npm run typecheck && npm run build`
Expected: all four succeed.

```bash
git add src/game/gameConfig.ts src/components/WaitingRoom.tsx src/components/MatchResultPanel.tsx \
  src/screens/MatchScreen.tsx src/screens/OnlineMatchScreen.tsx src/screens/OnlineMatchScreen.test.tsx \
  src/screens/LobbyScreen.tsx src/app/App.tsx README.md CLAUDE.md \
  docs/superpowers/specs/2026-11-13-multiplayer-design.md
git commit -m "feat: online play with room codes

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```
