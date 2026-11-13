import { describe, expect, it } from 'vitest';
import { chooseComputerPicks, recallGrid } from './computerPlayer';
import { createSeededRandom } from './deck';
import { dealRound } from './deal';
import { DIFFICULTY_ORDER } from './gameConfig';
import { compareHands } from './pokerEvaluator';
import { evaluatePick, findBestPick } from './scoring';

describe('recallGrid', () => {
  it('remembers everything with perfect memory', () => {
    const round = dealRound(1, createSeededRandom(1));
    expect(recallGrid(round.grid, 1, createSeededRandom(2))).toEqual(round.grid);
  });

  it('only ever recalls cards that are actually on the grid', () => {
    const round = dealRound(1, createSeededRandom(1));
    const beliefs = recallGrid(round.grid, 0, createSeededRandom(3));
    for (const belief of beliefs) {
      if (belief) expect(round.grid).toContain(belief);
    }
    expect(beliefs.some((b) => b === null)).toBe(true);
  });
});

describe('chooseComputerPicks', () => {
  it('finds the best possible hand with perfect memory', () => {
    for (let seed = 0; seed < 25; seed++) {
      const round = dealRound(seed, createSeededRandom(seed));
      const [a, b] = chooseComputerPicks(round, 1, createSeededRandom(seed + 100));
      expect(compareHands(evaluatePick(round, a, b), findBestPick(round).hand)).toBe(0);
    }
  });

  it.each(DIFFICULTY_ORDER)('always returns two distinct valid positions on %s', (difficulty) => {
    const random = createSeededRandom(7);
    for (let seed = 0; seed < 60; seed++) {
      const round = dealRound(seed, createSeededRandom(seed), difficulty);
      for (const memory of [0, 0.3, 0.75, 1]) {
        const [a, b] = chooseComputerPicks(round, memory, random);
        expect(a).not.toBe(b);
        for (const p of [a, b]) {
          expect(Number.isInteger(p)).toBe(true);
          expect(p).toBeGreaterThanOrEqual(0);
          expect(p).toBeLessThan(round.grid.length);
        }
      }
    }
  });

  it('plays better with a better memory', () => {
    const optimalRate = (memory: number) => {
      const random = createSeededRandom(42);
      let optimal = 0;
      const rounds = 150;
      for (let seed = 0; seed < rounds; seed++) {
        const round = dealRound(seed, createSeededRandom(seed));
        const [a, b] = chooseComputerPicks(round, memory, random);
        if (compareHands(evaluatePick(round, a, b), findBestPick(round).hand) === 0) optimal++;
      }
      return optimal / rounds;
    };
    const weak = optimalRate(0.4);
    const strong = optimalRate(0.92);
    expect(strong).toBeGreaterThan(weak + 0.15);
  });

  it('is deterministic for a seeded random source', () => {
    const round = dealRound(1, createSeededRandom(9));
    expect(chooseComputerPicks(round, 0.6, createSeededRandom(4))).toEqual(
      chooseComputerPicks(round, 0.6, createSeededRandom(4)),
    );
  });
});
