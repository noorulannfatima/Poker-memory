import { createDeck, cryptoRandom, shuffle } from './deck';
import { DEFAULT_DIFFICULTY, DIFFICULTIES, GAME_CONFIG, gridSize, type Difficulty } from './gameConfig';
import type { RandomFn, Round } from './gameTypes';

/**
 * Shuffles a fresh deck and deals the grid and community cards from it.
 * Because every card comes from one shuffled deck, all cards are distinct.
 */
export function dealRound(
  id: number,
  random: RandomFn = cryptoRandom,
  difficulty: Difficulty = DEFAULT_DIFFICULTY,
): Round {
  const settings = DIFFICULTIES[difficulty];
  const size = gridSize(settings);
  const deck = shuffle(createDeck(), random);
  const grid = deck.slice(0, size);
  const community = deck.slice(size, size + GAME_CONFIG.communityCount);
  return { id, settings, grid, community };
}
