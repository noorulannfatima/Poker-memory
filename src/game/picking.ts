import { GAME_CONFIG } from './gameConfig';

/**
 * The picking rule shared by every mode: tapping a position selects it,
 * tapping it again releases it, and once `max` positions are held extra taps
 * are ignored until one is released. Invalid positions are ignored.
 *
 * Returns the same array instance when nothing changes, so reducers can
 * cheaply detect a no-op.
 */
export function togglePick(
  selected: readonly number[],
  position: number,
  gridLength: number,
  max: number = GAME_CONFIG.picksRequired,
): readonly number[] {
  if (!Number.isInteger(position) || position < 0 || position >= gridLength) return selected;
  if (selected.includes(position)) return selected.filter((p) => p !== position);
  if (selected.length >= max) return selected;
  return [...selected, position];
}
