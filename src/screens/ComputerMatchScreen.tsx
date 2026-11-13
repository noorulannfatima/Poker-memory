import { useComputerMatch } from '../app/useComputerMatch';
import type { Difficulty } from '../game/gameConfig';
import type { RandomFn } from '../game/gameTypes';
import { MatchScreen } from './MatchScreen';

interface ComputerMatchScreenProps {
  difficulty: Difficulty;
  random: RandomFn;
  onLeave: () => void;
}

/** A You-vs-Computer match. Remount (new `key`) to start a fresh match and tally. */
export function ComputerMatchScreen({ difficulty, random, onLeave }: ComputerMatchScreenProps) {
  const { view, actions } = useComputerMatch(difficulty, random);
  return <MatchScreen view={view} actions={actions} onLeave={onLeave} />;
}
