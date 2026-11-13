# Memory Poker

A browser memory-and-poker game: React 19, Vite, Tailwind 4, TypeScript and Vitest. The rules
and the architecture are in [README.md](README.md).

## Commands

```bash
npm run dev        # dev server
npm run server     # online-play game server (ws://localhost:8787/ws)
npm test           # Vitest (unit + UI flow)
npm run lint
npm run typecheck
npm run build
```

Run `npm test`, `npm run lint` and `npm run typecheck` before calling work done.

## Conventions

- `src/game` has no React or browser code. The rules must stay reusable on the Node server.
- Reducers are pure. The dealt `Round` and the current time (`now`) come in through actions.
- Each phase is a separate member of a union type, so impossible states can't be represented.
- Timeout actions carry `phase` and `roundId` (and `turn` where relevant), and stale ones are
  ignored.
- Face-down cards are `null` in anything that is rendered or sent over the network. Hidden card
  values must never reach the DOM or go over the network.
- Tunable settings belong in `src/game/gameConfig.ts`.
- `src/net` is shared with the Node server: no React, DOM or Node APIs.

## Multiplayer (in progress)

Full design: [docs/superpowers/specs/2026-11-13-multiplayer-design.md](docs/superpowers/specs/2026-11-13-multiplayer-design.md)

- **Modes:** Solo (unchanged), **Vs computer** (built), **Two players, one device**
  (pass-and-play, built) and **Online** (room code, built).
- **Exactly 2 players.** Rounds go on with a running tally (wins plus ties). Online, both players press
  Next round to continue; on one device a single press is enough.
- **Shared engine:** a pure `matchReducer` in `src/game/match.ts` runs in the browser (one device)
  and on the server (online). `viewFor(state, playerId)` hides face-down cards and the opponent's
  picks until the reveal.
  - **One device:** `turnMode: 'sequential'`. Players select in turn, each with a full timer,
    with a `handoff` screen in between. The first selector switches every round.
  - **Online:** `turnMode: 'simultaneous'`. Both players select under one timer.
- **Server:** `server/` is Node plus `ws` and imports `src/game`. Rooms are in memory and use
  4-letter codes. The server deals, keeps time and scores. A dropped player has a 30 s grace
  window to resume with a `sessionStorage` token, after which the opponent sees "Opponent left".
- **Client:** `useLocalMatch` and `useOnlineMatch` both return `{ view, actions }` for a shared
  `MatchScreen`. The shared components take narrow props, not the whole `GameState`.
- **Vs computer (built):** `useComputerMatch` runs `matchReducer` in `simultaneous` mode with a
  computer player. `src/game/computerPlayer.ts` picks the pair that looks best from an imperfect
  recollection of the grid; the per-level `computerMemory` in `gameConfig.ts` sets how often it
  remembers each card. It locks in partway through the select timer, or ~0.7 s after the human locks
  in. `MatchScreen`, `MatchResultPanel` and `Scoreboard` are mode-agnostic and take a `MatchView`.
- **Build order:**
  1. Match engine — done (`match.ts`, `picking.ts`, `viewFor`, tests; `simultaneous`, and
     `sequential` with `handoff`)
  2. Narrower component props — done (`CardGrid`, `PhaseInstructions` take explicit props)
  3. Two players on one device — done (`useLocalMatch`, `LocalMatchScreen`, `HandoffScreen`)
  4. Server — done
  5. Online client — done
