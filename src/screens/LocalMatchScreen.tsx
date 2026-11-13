import { useLocalMatch } from '../app/useLocalMatch';
import type { Difficulty } from '../game/gameConfig';
import type { RandomFn } from '../game/gameTypes';
import { MatchScreen } from './MatchScreen';

interface LocalMatchScreenProps {
  names: readonly [string, string];
  difficulty: Difficulty;
  random: RandomFn;
  onLeave: () => void;
}

/** Two players taking turns on one device. Unmounting ends the match and its timers. */
export function LocalMatchScreen({ names, difficulty, random, onLeave }: LocalMatchScreenProps) {
  const { view, actions } = useLocalMatch(names, difficulty, random);
  return <MatchScreen view={view} actions={actions} onLeave={onLeave} />;
}
