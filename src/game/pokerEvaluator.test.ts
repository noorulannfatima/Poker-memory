import { describe, expect, it } from 'vitest';
import { hand } from '../test/cards';
import { shuffle, createSeededRandom } from './deck';
import { compareCards, evaluateHand, InvalidHandError, type HandCategory } from './pokerEvaluator';

const ranksOf = (text: string) => evaluateHand(hand(text)).cards.map((card) => card.rank);

describe('evaluateHand — categories', () => {
  const cases: Array<[HandCategory, string]> = [
    ['royal-flush', 'As Ks Qs Js Ts'],
    ['straight-flush', '9h 8h 7h 6h 5h'],
    ['straight-flush', 'Ad 2d 3d 4d 5d'],
    ['four-of-a-kind', '7c 7d 7h 7s Kd'],
    ['full-house', 'Qs Qh Qd 4c 4s'],
    ['flush', 'Ac Jc 8c 4c 2c'],
    ['straight', '9c 8d 7h 6s 5c'],
    ['straight', 'Ah Kd Qc Js Th'],
    ['straight', 'Ah 2d 3c 4s 5h'],
    ['three-of-a-kind', '8s 8h 8d Kc 3s'],
    ['two-pair', 'Js Jd 4c 4h Ac'],
    ['pair', 'Ts Td Ac 7h 2s'],
    ['high-card', 'Ks Jd 9c 6h 3s'],
  ];

  it.each(cases)('recognises %s from %s', (category, cards) => {
    expect(evaluateHand(hand(cards)).category).toBe(category);
  });

  it('gives human-readable labels', () => {
    expect(evaluateHand(hand('As Ks Qs Js Ts')).label).toBe('Royal Flush');
    expect(evaluateHand(hand('Js Jd 4c 4h Ac')).label).toBe('Two Pair');
  });
});

describe('evaluateHand — edge cases', () => {
  it('treats A-2-3-4-5 as a five-high straight with the ace displayed last', () => {
    const result = evaluateHand(hand('2d Ah 4s 3c 5h'));
    expect(result.tiebreak).toEqual([5]);
    expect(result.cards.map((card) => card.rank)).toEqual([5, 4, 3, 2, 14]);
    expect(result.description).toMatch(/wheel/i);
  });

  it('does not allow wrap-around straights', () => {
    expect(evaluateHand(hand('Qh Kd Ac 2s 3h')).category).toBe('high-card');
    expect(evaluateHand(hand('Kh Ad 2c 3s 4h')).category).toBe('high-card');
  });

  it('a near straight with a pair is just a pair', () => {
    expect(evaluateHand(hand('5h 6d 7c 8s 8h')).category).toBe('pair');
  });

  it('a steel wheel is a straight flush, not a royal flush', () => {
    const result = evaluateHand(hand('Ad 2d 3d 4d 5d'));
    expect(result.category).toBe('straight-flush');
    expect(result.tiebreak).toEqual([5]);
  });

  it('orders cards by significance for display', () => {
    expect(ranksOf('3s Kc 8h 8d 8s')).toEqual([8, 8, 8, 13, 3]);
    expect(ranksOf('4c Ac Js 4h Jd')).toEqual([11, 11, 4, 4, 14]);
    expect(ranksOf('4c 4s Qs Qh Qd')).toEqual([12, 12, 12, 4, 4]);
  });

  it('describes hands', () => {
    expect(evaluateHand(hand('Ts Td Ac 7h 2s')).description).toBe('Pair of Tens with A, 7, 2 kickers.');
    expect(evaluateHand(hand('Qs Qh Qd 4c 4s')).description).toBe('Queens full of Fours.');
    expect(evaluateHand(hand('6s 6h 6d 6c 2s')).description).toBe('Four Sixes with a Two kicker.');
    expect(evaluateHand(hand('Js Jd 4c 4h Ac')).description).toBe('Jacks and Fours with an Ace kicker.');
    expect(evaluateHand(hand('Js Jd 4c 4h 9c')).description).toBe('Jacks and Fours with a Nine kicker.');
    expect(evaluateHand(hand('Ks Jd 9c 6h 3s')).description).toBe('King high with J, 9, 6, 3.');
  });

  it('rejects hands that are not exactly five distinct cards', () => {
    expect(() => evaluateHand(hand('As Ks Qs Js'))).toThrow(InvalidHandError);
    expect(() => evaluateHand(hand('As Ks Qs Js Ts 9s'))).toThrow(InvalidHandError);
    expect(() => evaluateHand(hand('As As Qs Js Ts'))).toThrow(/Duplicate/);
  });

  it('is independent of input order', () => {
    const cards = hand('Js Jd 4c 4h Ac');
    const baseline = evaluateHand(cards);
    const random = createSeededRandom(3);
    for (let i = 0; i < 20; i++) {
      const result = evaluateHand(shuffle(cards, random));
      expect(result.category).toBe(baseline.category);
      expect(result.tiebreak).toEqual(baseline.tiebreak);
      expect(compareCards(cards, shuffle(cards, random))).toBe(0);
    }
  });
});

describe('compareHands — category ordering', () => {
  const ladder = [
    'Ks Jd 9c 6h 3s', // high card
    'Ts Td Ac 7h 2s', // pair
    'Js Jd 4c 4h Ac', // two pair
    '8s 8h 8d Kc 3s', // trips
    'Ah 2d 3c 4s 5h', // straight (wheel — the lowest straight)
    'Ac Jc 8c 4c 2c', // flush
    'Qs Qh Qd 4c 4s', // full house
    '7c 7d 7h 7s Kd', // quads
    'Ad 2d 3d 4d 5d', // straight flush (lowest)
    'As Ks Qs Js Ts', // royal flush
  ];

  it('ranks each category above the one before it', () => {
    for (let i = 1; i < ladder.length; i++) {
      expect(compareCards(hand(ladder[i]!), hand(ladder[i - 1]!))).toBeGreaterThan(0);
      expect(compareCards(hand(ladder[i - 1]!), hand(ladder[i]!))).toBeLessThan(0);
    }
  });
});

describe('compareHands — within a category (kickers)', () => {
  const wins: Array<[string, string, string]> = [
    ['high card: second kicker', 'Ks Qd 9c 6h 3s', 'Kd Jd 9h 6s 3c'],
    ['high card: last kicker', 'Ks Qd 9c 6h 4s', 'Kd Qh 9h 6s 3c'],
    ['pair: higher pair', 'Qs Qd 3c 4h 2s', 'Js Jd Ac Kh 9s'],
    ['pair: kicker', 'Ts Td Ac 7h 2s', 'Tc Th Kc 7d 2d'],
    ['pair: third kicker', 'Ts Td Ac 7h 3s', 'Tc Th Ad 7d 2d'],
    ['two pair: top pair', 'Ks Kd 2c 2h 3s', 'Qs Qd Jc Jh As'],
    ['two pair: second pair', 'Ks Kd 5c 5h 3s', 'Kc Kh 4c 4h As'],
    ['two pair: kicker', 'Ks Kd 5c 5h 9s', 'Kc Kh 5d 5s 8s'],
    ['trips: rank', '9s 9h 9d 2c 3s', '8s 8h 8d Ac Ks'],
    ['straight: higher top card', '6c 5d 4h 3s 2c', 'Ah 2d 3c 4s 5h'],
    ['straight: broadway beats king-high', 'Ah Kd Qc Js Th', 'Kh Qd Jc Ts 9h'],
    ['flush: second card', 'Ac Qc 8c 4c 2c', 'Ah Jh 9h 5h 3h'],
    ['flush: last card', 'Ac Qc 8c 4c 3c', 'Ah Qh 8h 4h 2h'],
    ['full house: trips rank first', '3s 3h 3d 2c 2s', '2h 2d 2c As Ah'],
    ['full house: pair rank second', 'Qs Qh Qd 5c 5s', 'Qc Qh Qd 4c 4s'],
    ['quads: kicker', '7c 7d 7h 7s Kd', '7c 7d 7h 7s Qd'],
    ['straight flush: higher', '9h 8h 7h 6h 5h', '8s 7s 6s 5s 4s'],
  ];

  it.each(wins)('%s', (_name, winner, loser) => {
    expect(compareCards(hand(winner), hand(loser))).toBeGreaterThan(0);
    expect(compareCards(hand(loser), hand(winner))).toBeLessThan(0);
  });
});

describe('compareHands — ties', () => {
  const ties: Array<[string, string, string]> = [
    ['identical high card in different suits', 'Ks Qd 9c 6h 3s', 'Kd Qh 9h 6s 3c'],
    ['same pair and kickers', 'Ts Td Ac 7h 2s', 'Tc Th Ad 7d 2d'],
    ['same two pair and kicker', 'Ks Kd 5c 5h 9s', 'Kc Kh 5d 5s 9d'],
    ['same straight', '9c 8d 7h 6s 5c', '9h 8c 7d 6c 5s'],
    ['wheel vs wheel', 'Ah 2d 3c 4s 5h', 'Ad 2c 3h 4h 5s'],
    ['same flush ranks', 'Ac Qc 8c 4c 2c', 'Ah Qh 8h 4h 2h'],
    ['royal vs royal', 'As Ks Qs Js Ts', 'Ah Kh Qh Jh Th'],
  ];

  it.each(ties)('%s', (_name, a, b) => {
    expect(compareCards(hand(a), hand(b))).toBe(0);
  });
});
