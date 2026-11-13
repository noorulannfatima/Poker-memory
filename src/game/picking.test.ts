import { describe, expect, it } from 'vitest';
import { togglePick } from './picking';

describe('togglePick', () => {
  it('selects and releases a position', () => {
    expect(togglePick([], 3, 16)).toEqual([3]);
    expect(togglePick([3, 5], 3, 16)).toEqual([5]);
  });

  it('ignores a third pick while holding two', () => {
    const held = [1, 2];
    expect(togglePick(held, 3, 16)).toBe(held);
  });

  it('ignores positions outside the grid and non-integers', () => {
    const held = [1];
    expect(togglePick(held, 9, 9)).toBe(held);
    expect(togglePick(held, -1, 9)).toBe(held);
    expect(togglePick(held, 1.5, 9)).toBe(held);
  });

  it('respects a custom maximum', () => {
    expect(togglePick([1, 2], 3, 16, 3)).toEqual([1, 2, 3]);
  });
});
