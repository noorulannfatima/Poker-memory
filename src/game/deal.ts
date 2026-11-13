import { createDeck, cryptoRandom, shuffle } from './deck';
import { GAME_CONFIG, GRID_SIZE } from './gameConfig';
import type { RandomFn, Round } from './gameTypes';

/**
 * Shuffles a fresh deck and deals the grid and community cards from it.
 * Because every card comes from one shuffled deck, all cards are distinct.
 */
export function dealRound(id: number, random: RandomFn = cryptoRandom): Round {
  const deck = shuffle(createDeck(), random);
  const grid = deck.slice(0, GRID_SIZE);
  const community = deck.slice(GRID_SIZE, GRID_SIZE + GAME_CONFIG.communityCount);
  return { id, grid, community };
}
