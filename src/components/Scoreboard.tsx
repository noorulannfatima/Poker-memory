import type { MatchPlayer, PlayerId } from '../game/match';

interface ScoreboardProps {
  me: PlayerId;
  players: readonly MatchPlayer[];
  ties: number;
}

/** "You 2 · 1 tie · 1 Computer" — this player on the left in gold, the opponent in blue. */
export function Scoreboard({ me, players, ties }: ScoreboardProps) {
  const mine = players.find((p) => p.id === me);
  const theirs = players.find((p) => p.id !== me);
  if (!mine || !theirs) return null;
  const tieText = `${ties} ${ties === 1 ? 'tie' : 'ties'}`;

  return (
    <div className="mb-3 flex justify-center lg:mb-4">
      <p
        className="inline-flex items-center gap-3 rounded-full border border-line bg-charcoal/80 px-4 py-1.5 text-sm"
        aria-label={`Score: ${mine.name} ${mine.wins}, ${theirs.name} ${theirs.wins}, ${tieText}`}
        data-testid="scoreboard"
      >
        <span className="font-semibold text-gold">
          {mine.name} <span className="font-display text-base tabular-nums text-ink">{mine.wins}</span>
        </span>
        <span className="text-subtle" aria-hidden="true">·</span>
        <span className="text-muted tabular-nums">{tieText}</span>
        <span className="text-subtle" aria-hidden="true">·</span>
        <span className="font-semibold text-rival">
          <span className="font-display text-base tabular-nums text-ink">{theirs.wins}</span> {theirs.name}
        </span>
      </p>
    </div>
  );
}
