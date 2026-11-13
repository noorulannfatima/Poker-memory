# Multiplayer Design: Same Device and Online

**Date:** 2026-11-13
**Status:** Approved in brainstorming, awaiting spec review

## Goal

Add two-player Memory Poker in two modes:

- **One device (pass-and-play):** two players share one browser.
- **Online:** two players on different devices join one room with a room code.

Solo mode stays exactly as it is today.

## Decisions

| Topic | Decision |
|---|---|
| Players | Exactly 2. Players are stored as a list so this can grow later. |
| Online transport | A small Node WebSocket server (`ws`) that we write and host, which deals, keeps time and scores. |
| Finding a match | A 4-letter room code typed in by hand. No accounts, no public lobby, no join links. |
| Match format | Rounds go on with a running tally (wins per player plus ties) until a player leaves. No fixed length. |
| Next round | Both players must choose **Next round**. On one device a single tap is enough. |
| Online disconnect | The round's timer keeps running and the player has 30 s to resume with their picks intact. After that the room closes and the opponent sees "Opponent left". |
| Online difficulty | The player who creates the room picks it. |
| Names | Each player enters a name. On one device the defaults are "Player 1" and "Player 2". |
| Winner | `compareOutcomes`: a complete hand beats an incomplete one, two incomplete hands tie, and equal hands tie. |
| Unchanged | `deck`, `deal`, `pokerEvaluator`, `scoring`, the solo `gameReducer` and their tests. |

## Approach

**One shared match engine.** A new pure `matchReducer` in `src/game` runs in the browser for one-device play and on the Node server for online play. The rules live in one place, so both modes are tested by the same tests.

Rejected alternatives:

- **Separate code per mode:** the rules would drift apart, and every bug would need fixing twice.
- **One-device play through an in-memory fake server:** it hides a simple local flow behind networking ideas it doesn't need.

## 1. Match engine: `src/game/match.ts` (new, pure)

### State

`MatchState` holds:

- `players`: two entries, each with `id`, `name` and `wins`
- `ties`: the tie count
- `difficulty`
- `turnMode`: `'sequential'` for one device, `'simultaneous'` for online
- `firstSelector`: the index of the player who selects first this round. It switches every round.
- the current round's phase and its data

Time and randomness come in through actions (`now` and the dealt `Round`), as in `gameReducer`.

### Round phases

```
memorizing → selecting → revealing → results
                 │  ↑
                 ↓  │   (sequential mode only)
               handoff
```

- **Simultaneous (online):** both players select under one timer. Each player has their own `selected` list and a `locked` flag. The round moves to `revealing` when both have locked in or when the timer runs out. When the timer runs out, whatever each player has picked so far becomes final, with `reason: 'timeout'`.
- **Sequential (one device):**
  1. Player A selects with the full select timer.
  2. `handoff` phase: no timer and the grid is hidden. Player B taps to start.
  3. Player B selects with a fresh full select timer.
  4. Reveal.

  The player who selects first switches every round, because the second player has to remember the grid for longer.

Timeout actions carry `phase`, `roundId` and, in sequential mode, `turn`. Stale timeouts are ignored.

### Results

Each player's picks go through `scoreRound`. The round winner comes from `compareOutcomes`. The winner's `wins` goes up by one, or `ties` does on a tie.

### Next round

The `results` phase tracks which players have pressed `NEXT_ROUND`. On one device, a single `NEXT_ROUND` counts for both players. Once both are ready, `START_ROUND` with a freshly dealt `Round` begins the next round.

### Shared picking helper

The picking rule (a tap selects a position, tapping it again releases it, at most `picksRequired` picks, extra taps are ignored) moves into one small pure helper. `gameReducer` and `matchReducer` both use it.

### What each player can see: `viewFor(state, playerId) → MatchView`

- Face-down grid cards appear as `null`, so their values never reach the DOM or go over the network.
- The opponent's picks are hidden until `revealing`. Before then the view only shows the opponent's status: `selecting`, `locked`, `waiting` (in sequential mode, not their turn yet), `reconnecting` or `left`.
- On one device, the screen shows `viewFor(state, activePlayer)`.

## 2. Online server: `server/` (new)

### Layout

- A `server/` folder in this repo, with its own `tsconfig` and a single dependency, `ws`. It imports `src/game` directly.
- In development, Vite proxies `/ws` to the server, and `npm run server` starts it next to `npm run dev`.
- In production the server is deployed once (e.g. on Render or Fly.io), and the client reads its URL from `VITE_SERVER_URL`.

### Rooms

- Rooms are kept in memory, in a `Map<code, Room>`. There's no database, and restarting the server drops games in progress.
- **Room codes:** 4 letters from an alphabet without look-alike characters (no `O`/`0` or `I`/`1`). Codes are matched without regard to case.
- **Each room** stores the `MatchState`, two player slots (`socket`, `token`, `connected`, `graceTimer`) and the active phase timer.
- A room closes 10 minutes after its last activity, or when either player leaves or misses the grace window. Closing a room clears all of its timers.

### The server keeps the time

When a timed phase starts, the server sets one `setTimeout`, and when it fires it applies `PHASE_TIMEOUT` to the reducer. Browsers never decide when time is up. Every outgoing message includes the server's `now`, so each browser can adjust for its own clock being off.

### Messages (JSON)

| Browser → server | Server → browser |
|---|---|
| `create {name, difficulty}` | `joined {roomCode, playerId, token}` |
| `join {roomCode, name}` | `state {view, now}`, sent to each player after every change, as `viewFor(state, thatPlayer)` |
| `resume {roomCode, token}` | `error {code, message}` with codes `room-not-found`, `room-full`, `room-closed`, `bad-token` |
| `toggle {position}` | |
| `submit` | |
| `nextRound` | |
| `leave` | |

The round starts automatically once the second player joins. The server deals every round with `dealRound` and `cryptoRandom`.

### Checking messages

- The server checks that the room exists, that the token or socket belongs to that room, and that the message is well formed, then passes it to `matchReducer`. The reducer ignores moves made at the wrong time.
- Face-down cards are never sent, so even raw network traffic can't reveal them.

### Reconnecting

- When a socket closes, the player's slot is marked disconnected, the round's timer keeps running, the opponent's view shows `reconnecting`, and a 30 s grace timer starts.
- A `resume` with a valid token within 30 s cancels the grace timer, reattaches the socket and sends the latest `state`. Picks made before the drop are kept.
- When the grace timer fires, the opponent's view shows `left` and the room closes.

## 3. Browser and UI

### Lobby

The lobby gets a mode picker: **Solo** (unchanged), **Two players, one device** and **Online**. The difficulty picker stays and applies to every mode.

- **One device:** two name fields, then **Start**.
- **Online:** a name field, then **Create room** (uses the current difficulty) or **Join room** (a 4-letter code field). Join errors appear inline, and the player stays in the lobby.
- **Waiting screen** (after creating a room): the room code in large type, a **Copy** button and "Waiting for opponent…".

### Hooks

Both hooks return `{ view: MatchView, actions }`, so `MatchScreen` can't tell which mode it's in.

- **`useLocalMatch(names, difficulty, random)`:** runs `matchReducer` with `useReducer`. It sends timeouts the same way the existing `usePhaseTimer` does, deals each round in the browser and shows `viewFor(state, activePlayer)`.
- **`useOnlineMatch()`:** owns the WebSocket and turns actions into messages. It stores the latest `state`, computes the clock offset from the server's `now` for countdowns, and keeps `{roomCode, token}` in `sessionStorage` so it can resume.

### Component changes

`CardGrid`, `CommunityCards`, `CountdownTimer` and `GameHeader` are narrowed to the props they use, such as cards that may be hidden, selected positions and whether the grid can be clicked, instead of the whole `GameState`. The solo `GameScreen` is updated to pass those props. Solo play doesn't change.

### New components

- **`MatchScreen`:** the two-player game screen, built from the components above.
- **Scoreboard strip** (in the header): `Ana 2 · 1 tie · 1 Ben`, with a marker on whoever is selecting.
- **`HandoffScreen`** (one device): covers the whole screen and shows "Pass to Ben" with an "I'm Ben, show my turn" button. The grid isn't rendered while it's up.
- **Opponent status** (online): "Selecting…", "Locked in ✓", "Reconnecting…" or "Opponent left" (with a **Back to lobby** button).
- **`MatchResultPanel`:** both hands side by side, each player's picks outlined on the revealed grid in that player's color, a banner saying who won or that it's a tie, and the best possible pick. Buttons: **Next round** (online it shows "Waiting for Ben…" until both have pressed it) and **Leave**.

## 4. Error handling

- **Joining:** `room-not-found`, `room-full` and `room-closed` appear as messages in the lobby.
- **Server unreachable or connection lost:** the browser retries with increasing delays (1 s, 2 s, 4 s and so on) for up to 30 s, with a "Reconnecting…" banner. After that it shows "Connection lost" and returns to the lobby. This matches the server's grace window.
- **Bad messages:** the server ignores and logs JSON it can't parse, unknown message types and invalid positions. Limits: 1 KB per message and 20 messages per second per socket. A socket that goes over either limit is disconnected.
- **Leaving or closing the tab:** sends `leave` (also on `pagehide`), so the opponent sees "Opponent left" right away. If that message never arrives, the grace window covers it.

## 5. Testing (Vitest)

All existing tests keep passing without changes.

- **`src/game/match.test.ts`** (pure functions, seeded deals):
  - simultaneous mode: both players lock in, timeout with an incomplete hand, ties, the tally updating
  - sequential mode: turn order, handoff, the first selector switching each round, each player getting a full timer
  - stale or wrong-phase moves and timeouts are ignored
  - `viewFor` never includes face-down cards or the opponent's picks before `revealing`
- **Shared picking helper:** unit tests. `gameReducer` tests still pass.
- **Server tests:** start the real `ws` server on a random port with fake timers and two test clients, then cover:
  - create and join, room full, unknown code
  - a whole round played through to results
  - a timeout run by the server
  - disconnecting and resuming within 30 s, and missing the window (`left`)
  - a check that every raw message sent during `selecting` contains no face-down cards
- **UI tests (React Testing Library):**
  - one device: names, Player A's turn, the handoff screen hides the grid, Player B's turn, the results show the winner and the tally, Next round
  - online: `useOnlineMatch` with a fake socket covering the waiting screen, a whole round, and the reconnecting banner
- **Manual check:** two browser windows against the local server, plus one phone on the local network.

## Build order

Each step can be shipped and tested on its own:

1. Match engine (`match.ts`, the picking helper, `viewFor`, tests)
2. Narrower component props (solo play unchanged)
3. Two players on one device (lobby mode, `useLocalMatch`, `MatchScreen`, `HandoffScreen`, `MatchResultPanel`)
4. Server (`server/`, rooms, messages, reconnecting, tests)
5. Online client (`useOnlineMatch`, lobby create and join, waiting screen, opponent status)

## Out of scope

- More than 2 players, public matchmaking, join links, accounts, saved stats
- Keeping rooms across server restarts, or running more than one server
- Spectators and chat
