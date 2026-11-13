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

## Architecture

```
src/
  game/            framework-free rules (reusable on a server later)
    gameTypes.ts     Card, Round, FinalSelection
    gameConfig.ts    all tunable settings
    deck.ts          create / Fisher–Yates shuffle / seeded RNG / crypto RNG
    deal.ts          deal grid + community from one shuffled deck
    pokerEvaluator.ts  five-card evaluation, comparison, descriptions
    scoring.ts       round outcome, best possible pick, outcome comparison
    gameReducer.ts   phase state machine: lobby → memorizing → selecting → revealing → results
  app/             App shell and timer hooks (usePhaseTimer, useRemaining)
  components/      PlayingCard, CardGrid, CommunityCards, CountdownTimer, GameHeader,
                   PhaseInstructions, ResultPanel
  screens/         LobbyScreen, GameScreen (results render inside GameScreen so the
                   revealed grid stays visible)
```

- The reducer is pure: the dealt round and the current time arrive in actions.
- Each phase is a separate union member, so impossible states can't be represented.
- Timeout actions carry `phase` and `roundId`, and stale ones are ignored.
- Face-down cards receive `null` instead of the card, so hidden values never reach the DOM
  (a face lingers only for the ~0.5 s flip animation).
