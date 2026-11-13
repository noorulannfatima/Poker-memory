import { describe, expect, it } from 'vitest';
import { MAX_NAME_LENGTH, normalizeNames } from './playerNames';

describe('normalizeNames', () => {
  it('trims names and fills blanks with defaults', () => {
    expect(normalizeNames(['  Ana ', ''])).toEqual(['Ana', 'Player 2']);
    expect(normalizeNames(['   ', 'Ben'])).toEqual(['Player 1', 'Ben']);
  });

  it('caps the length', () => {
    const [first] = normalizeNames(['x'.repeat(40), 'Ben']);
    expect(first).toHaveLength(MAX_NAME_LENGTH);
  });

  it('keeps the two names distinct', () => {
    expect(normalizeNames(['Sam', 'sam'])).toEqual(['Sam', 'sam 2']);
  });
});
