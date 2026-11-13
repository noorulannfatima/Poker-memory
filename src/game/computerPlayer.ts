import { sameCard } from './deck';
import type { Card, RandomFn, Round } from './gameTypes';
import { compareHands, evaluateHand, type EvaluatedHand } from './pokerEvaluator';

/**
 * A simple computer opponent with imperfect memory.
 *
 * It looks at the same grid during memorization, but each card is
 * remembered correctly only with probability `memory`. A lapse means the card
 * is either forgotten or confused with a card from another position. It then
 * picks the pair that looks strongest *according to its memory*, so a weak
 * memory leads to picks that turn out worse once the grid is revealed.
 */

/** What the computer believes is at each position (null = forgotten). */
export function recallGrid(grid: readonly Card[], memory: number, random: RandomFn): (Card | null)[] {
  return grid.map((card, position) => {
    if (random() < memory) return card;
    if (grid.length < 2 || random() < 0.5) return null;
    // Confuse this position with a different one.
    let other = Math.floor(random() * (grid.length - 1));
    if (other >= position) other += 1;
    return grid[other] ?? null;
  });
}

/** Chooses two distinct grid positions based on the computer's recollection. */
export function chooseComputerPicks(round: Round, memory: number, random: RandomFn): [number, number] {
  const beliefs = recallGrid(round.grid, memory, random);
  let best: EvaluatedHand | null = null;
  let options: Array<[number, number]> = [];

  for (let a = 0; a < beliefs.length; a++) {
    for (let b = a + 1; b < beliefs.length; b++) {
      const ca = beliefs[a];
      const cb = beliefs[b];
      // Forgotten cards, or two positions it believes hold the same card, can't be planned around.
      if (!ca || !cb || sameCard(ca, cb)) continue;
      const hand = evaluateHand([...round.community, ca, cb]);
      const cmp = best ? compareHands(hand, best) : 1;
      if (cmp > 0) {
        best = hand;
        options = [[a, b]];
      } else if (cmp === 0) {
        options.push([a, b]);
      }
    }
  }

  const choice = options[Math.floor(random() * options.length)];
  if (choice) return choice;

  // It remembers almost nothing: guess two distinct positions.
  const first = Math.floor(random() * round.grid.length);
  let second = Math.floor(random() * (round.grid.length - 1));
  if (second >= first) second += 1;
  return [first, second];
}
