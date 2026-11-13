export const DEFAULT_NAMES = ['Player 1', 'Player 2'] as const;
export const MAX_NAME_LENGTH = 16;

/** Trims names, fills blanks with defaults, caps the length and keeps the two names distinct. */
export function normalizeNames(raw: readonly [string, string]): [string, string] {
  const first = raw[0].trim().slice(0, MAX_NAME_LENGTH) || DEFAULT_NAMES[0];
  let second = raw[1].trim().slice(0, MAX_NAME_LENGTH) || DEFAULT_NAMES[1];
  if (second.toLowerCase() === first.toLowerCase()) second = `${second} 2`;
  return [first, second];
}
