import { RANKS, SUITS, type Card, type RandomFn } from './gameTypes';

/** Returns a fresh, ordered 52-card deck. */
export function createDeck(): Card[] {
  const deck: Card[] = [];
  for (const suit of SUITS) {
    for (const rank of RANKS) {
      deck.push({ rank, suit });
    }
  }
  return deck;
}

/**
 * Fisher–Yates shuffle. Returns a new array; the input is not mutated.
 * Inject `random` for deterministic tests.
 */
export function shuffle<T>(items: readonly T[], random: RandomFn = Math.random): T[] {
  const result = items.slice();
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    const tmp = result[i] as T;
    result[i] = result[j] as T;
    result[j] = tmp;
  }
  return result;
}

/**
 * Small, fast seeded PRNG (mulberry32). Useful for reproducible tests and,
 * later, for a server to replay a round from a stored seed.
 */
export function createSeededRandom(seed: number): RandomFn {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Uses the Web Crypto API when available so live games get a high-quality
 * shuffle; falls back to Math.random elsewhere.
 */
export function cryptoRandom(): number {
  const c = globalThis.crypto;
  if (c && typeof c.getRandomValues === 'function') {
    const buf = new Uint32Array(1);
    c.getRandomValues(buf);
    return (buf[0] as number) / 4294967296;
  }
  return Math.random();
}

export function cardId(card: Card): string {
  return `${card.rank}${card.suit[0]}`;
}

export function sameCard(a: Card, b: Card): boolean {
  return a.rank === b.rank && a.suit === b.suit;
}
