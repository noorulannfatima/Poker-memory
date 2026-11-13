# Memory Poker

A browser memory-and-poker game. Memorize a 4×4 grid of cards, then pick two
face-down positions from memory to make the best five-card hand with three
community cards.

## Scripts

```bash
npm install
npm run dev        # start the dev server
npm test           # unit + UI flow tests (Vitest + React Testing Library)
npm run lint       # ESLint
npm run typecheck  # TypeScript
npm run build      # type-check and production build
```

## Levels

| Level | Grid | Memorize | Select |
|---|---|---|---|
| Easy | 3×3 (9 cards) | 30 s | 45 s |
| Medium (default) | 4×4 (16 cards) | 20 s | 30 s |
| Difficult | 5×4 (20 cards) | 15 s | 20 s |

On every level the community cards are revealed only after the grid flips face-down.

Pick a level in the lobby. The choice is remembered in this browser, and **Play again** keeps it.
Each dealt round carries its level's settings, so the reducer and UI read timings and grid shape from
the round itself.

## Vs computer

Choose **Vs computer** in the lobby. You and the computer memorize the same grid, then each secretly
pick 2 cards at the same time (you may both pick the same card). Both picks are revealed together,
the higher five-card hand wins the round, and equal hands tie. A complete hand beats an incomplete
one. A scoreboard keeps the running tally until you leave the match.

The computer's memory depends on the level: it recalls each card correctly 50% of the time on
Easy, 75% on Medium and 92% on Difficult, and otherwise forgets the card or mixes it up with
another. It picks the pair that looks best from what it remembers.

## Round rules (single-player)

1. **Memorize:** the level's grid of distinct cards is dealt face-up (Medium: 16 cards, 20 s). No selection is possible.
2. **Board:** the grid flips face-down and 3 community cards (distinct from the grid) are revealed.
3. **Select (Medium: 30 s):** choose exactly 2 grid positions. Tap a chosen card to release it. Holding two,
   a third tap is ignored until you release one. **Lock in picks** submits early.
4. **Reveal:** the grid flips face-up. Your 2 picks plus the 3 community cards are evaluated as
   exactly one five-card hand (no 7-card best-five selection).

**Timeout rule:** when the selection timer ends, whatever has been chosen is locked in. With fewer
than 2 picks there is no five-card hand, so the round is an **incomplete hand**, which ranks below
every real hand (see `compareOutcomes`).

The results also show the **best possible pick** on the grid, found by checking every pair of grid positions.

Level settings (grid size, durations) and other tunables are in [`src/game/gameConfig.ts`](src/game/gameConfig.ts).

## Two players, one device

Both players memorize the same grid together. Then they pick **in turn**, each with a full
selection timer. A handoff screen comes before every turn ("Ana picks first", "Pass to Ben"),
hides the board and runs no timer, so the other player can look away. The first player to pick
alternates every round. Both hands are revealed together, and the stronger hand wins the round
(`compareOutcomes`: a complete hand beats an incomplete one, and equal hands tie). A running
tally counts wins and ties.

## Online play

One player chooses **Online → Create room** and shares the 4-letter code. The other chooses
**Online**, types the code and presses **Join room**. Both play the same grid at the same time on
their own devices, and the stronger hand wins the round. The game server deals, keeps time and
scores, and it never sends a face-down card to a device. If a connection drops, the game keeps
running and the player has 30 s to come back: reconnecting is automatic, and a reload works too.
After that the room closes. An unused room closes after 10 minutes. The server caps rooms (1000 in
total, 5 per connection); for serious public hosting, add per-IP limits at the proxy.

```bash
npm run server          # the game server on ws://localhost:8787/ws (restarts on changes)
npm run dev -- --host   # the app; Vite proxies /ws to the server. --host lets phones on your Wi-Fi join
```

To deploy, run `npm install && npm run start:server` on a Node 20+ host (it listens on `$PORT`),
and build the app with `VITE_SERVER_URL=wss://<your-server>/ws npm run build`.

## Architecture

```
server/
  rooms.ts, wsServer.ts, main.ts   Node room logic, WebSocket server and entry point
src/
  net/
    protocol.ts      the message format shared with the server
  game/            framework-free rules, shared with the online server
    gameTypes.ts     Card, Round, FinalSelection
    gameConfig.ts    all tunable settings
    deck.ts          create / Fisher–Yates shuffle / seeded RNG / crypto RNG
    deal.ts          deal grid + community from one shuffled deck
    pokerEvaluator.ts  five-card evaluation, comparison, descriptions
    scoring.ts       round outcome, best possible pick, outcome comparison
    gameReducer.ts   solo phase state machine: lobby → memorizing → selecting → revealing → results
    picking.ts       the shared select/release/max-2 picking rule
    match.ts         multi-player match engine (matchReducer, tally, viewFor per-player views)
    computerPlayer.ts  computer opponent with level-dependent imperfect memory
  app/             App shell, timer hooks (usePhaseTimer, useRemaining), useComputerMatch,
                   useLocalMatch, useOnlineMatch, socket, onlineSession, matchActions, playerNames
  components/      PlayingCard, CardGrid, CommunityCards, CountdownTimer, GameHeader,
                   PhaseInstructions, ResultPanel, Scoreboard, MatchResultPanel,
                   HandoffScreen, HandCards, WaitingRoom
  screens/         LobbyScreen, GameScreen (solo), MatchScreen, ComputerMatchScreen,
                   LocalMatchScreen, OnlineMatchScreen.
                   Results render inside the game screens so the revealed grid stays visible.
```

- The reducer is pure: the dealt round and the current time arrive in actions.
- Each phase is a separate union member, so impossible states can't be represented.
- Timeout actions carry `phase` and `roundId` (and `turn` for sequential selecting), and stale ones are ignored.
- Face-down cards receive `null` instead of the card, so hidden values never reach the DOM
  (a face lingers only for the ~0.5 s flip animation).
