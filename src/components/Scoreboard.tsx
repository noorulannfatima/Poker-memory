import type { MatchPlayer, PlayerId } from '../game/match';

interface ScoreboardProps {
  /** The player shown on the left, in gold. */
  me: PlayerId;
  players: readonly MatchPlayer[];
  ties: number;
  /** One device: the player who is picking right now. */
  active?: PlayerId | null;
}

/** "You 2 · 1 tie · 1 Computer": the left player in gold, the other in blue. */
export function Scoreboard({ me, players, ties, active = null }: ScoreboardProps) {
  const mine = players.find((p) => p.id === me);
  const theirs = players.find((p) => p.id !== me);
  if (!mine || !theirs) return null;
  const tieText = `${ties} ${ties === 1 ? 'tie' : 'ties'}`;
  const activeName = players.find((p) => p.id === active)?.name;
  const marker = (id: PlayerId) =>
    id === active ? <span className="inline-block size-1.5 rounded-full bg-current align-middle" aria-hidden="true" /> : null;

  return (
    <div className="mb-3 flex justify-center lg:mb-4">
      <p
        className="inline-flex items-center gap-3 rounded-full border border-line bg-charcoal/80 px-4 py-1.5 text-sm"
        aria-label={`Score: ${mine.name} ${mine.wins}, ${theirs.name} ${theirs.wins}, ${tieText}${
          activeName ? `, ${activeName} to pick` : ''
        }`}
        data-testid="scoreboard"
      >
        <span className="inline-flex items-center gap-1.5 font-semibold text-gold">
          {marker(mine.id)}
          {mine.name} <span className="font-display text-base tabular-nums text-ink">{mine.wins}</span>
        </span>
        <span className="text-subtle" aria-hidden="true">·</span>
        <span className="text-muted tabular-nums">{tieText}</span>
        <span className="text-subtle" aria-hidden="true">·</span>
        <span className="inline-flex items-center gap-1.5 font-semibold text-rival">
          <span className="font-display text-base tabular-nums text-ink">{theirs.wins}</span> {theirs.name}
          {marker(theirs.id)}
        </span>
      </p>
    </div>
  );
}
