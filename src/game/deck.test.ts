import { describe, expect, it } from 'vitest';
import { cardId, createDeck, createSeededRandom, cryptoRandom, shuffle } from './deck';
import { dealRound } from './deal';
import { DIFFICULTIES, DIFFICULTY_ORDER, GAME_CONFIG, gridSize } from './gameConfig';

const GRID_SIZE = gridSize(DIFFICULTIES.medium);

describe('createDeck', () => {
  it('creates 52 unique cards: 13 ranks × 4 suits', () => {
    const deck = createDeck();
    expect(deck).toHaveLength(52);
    expect(new Set(deck.map(cardId)).size).toBe(52);
    for (const suit of ['spades', 'hearts', 'diamonds', 'clubs']) {
      expect(deck.filter((card) => card.suit === suit)).toHaveLength(13);
    }
  });
});

describe('shuffle', () => {
  it('keeps every card and does not mutate the input', () => {
    const deck = createDeck();
    const before = deck.map(cardId);
    const shuffled = shuffle(deck, createSeededRandom(1));
    expect(deck.map(cardId)).toEqual(before);
    expect(shuffled.map(cardId).sort()).toEqual([...before].sort());
  });

  it('is deterministic for the same seed and differs across seeds', () => {
    const a = shuffle(createDeck(), createSeededRandom(42)).map(cardId);
    const b = shuffle(createDeck(), createSeededRandom(42)).map(cardId);
    const other = shuffle(createDeck(), createSeededRandom(43)).map(cardId);
    expect(a).toEqual(b);
    expect(a).not.toEqual(other);
  });

  it('actually changes the order', () => {
    const ordered = createDeck().map(cardId);
    const shuffled = shuffle(createDeck(), createSeededRandom(7)).map(cardId);
    expect(shuffled).not.toEqual(ordered);
  });

  it('is roughly uniform over positions', () => {
    // Track where the first item lands over many shuffles of a short list.
    const random = createSeededRandom(99);
    const counts = [0, 0, 0, 0];
    const trials = 8000;
    for (let i = 0; i < trials; i++) {
      const result = shuffle([0, 1, 2, 3], random);
      counts[result.indexOf(0)]! += 1;
    }
    for (const count of counts) {
      expect(count / trials).toBeGreaterThan(0.22);
      expect(count / trials).toBeLessThan(0.28);
    }
  });
});

describe('cryptoRandom', () => {
  it('returns values in [0, 1)', () => {
    for (let i = 0; i < 100; i++) {
      const value = cryptoRandom();
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThan(1);
    }
  });
});

describe('dealRound', () => {
  it('deals 16 grid cards and 3 community cards, all distinct', () => {
    for (let seed = 0; seed < 50; seed++) {
      const round = dealRound(seed, createSeededRandom(seed));
      expect(round.grid).toHaveLength(GRID_SIZE);
      expect(round.community).toHaveLength(GAME_CONFIG.communityCount);
      const ids = [...round.grid, ...round.community].map(cardId);
      expect(new Set(ids).size).toBe(GRID_SIZE + GAME_CONFIG.communityCount);
    }
  });

  it.each(DIFFICULTY_ORDER)('deals the right grid for %s, all cards distinct', (difficulty) => {
    const settings = DIFFICULTIES[difficulty];
    const round = dealRound(1, createSeededRandom(3), difficulty);
    expect(round.settings).toBe(settings);
    expect(round.grid).toHaveLength(settings.gridColumns * settings.gridRows);
    const ids = [...round.grid, ...round.community].map(cardId);
    expect(new Set(ids).size).toBe(round.grid.length + GAME_CONFIG.communityCount);
  });

  it('is reproducible with an injected random function', () => {
    const a = dealRound(1, createSeededRandom(5));
    const b = dealRound(1, createSeededRandom(5));
    expect(a).toEqual(b);
  });

  it('produces different deals with the default random source', () => {
    const a = dealRound(1).grid.map(cardId);
    const b = dealRound(2).grid.map(cardId);
    expect(a).not.toEqual(b);
  });
});
