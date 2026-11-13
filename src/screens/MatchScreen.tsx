import type { ReactNode } from 'react';
import type { MatchActions } from '../app/matchActions';
import { useRemaining } from '../app/usePhaseTimer';
import { CardGrid } from '../components/CardGrid';
import { CommunityCards } from '../components/CommunityCards';
import { CountdownTimer } from '../components/CountdownTimer';
import { GameHeader } from '../components/GameHeader';
import { HandoffScreen } from '../components/HandoffScreen';
import { MatchResultPanel } from '../components/MatchResultPanel';
import { PhaseInstructions } from '../components/PhaseInstructions';
import { Scoreboard } from '../components/Scoreboard';
import { GAME_CONFIG } from '../game/gameConfig';
import type { Card } from '../game/gameTypes';
import type { MatchView, OpponentView } from '../game/match';

interface MatchScreenProps {
  view: MatchView;
  actions: MatchActions;
  onLeave: () => void;
  /** Online: connection notices shown under the scoreboard. */
  banner?: ReactNode;
}

function OpponentStatus({ opponent }: { opponent: OpponentView }) {
  const text: Record<OpponentView['status'], string> = {
    waiting: `Waiting for ${opponent.name}…`,
    memorizing: `${opponent.name} is memorizing the same grid.`,
    selecting: `${opponent.name} is choosing…`,
    locked: `${opponent.name} has locked in ✓`,
    'up-next': `${opponent.name} picks next.`,
    revealed: `${opponent.name}’s picks are outlined in blue.`,
  };
  const active = opponent.status === 'selecting' || opponent.status === 'memorizing';
  return (
    <p className="flex items-center gap-2.5 text-sm text-ink/85" data-testid="opponent-status">
      <span
        className={`size-2.5 shrink-0 rounded-full ${opponent.status === 'locked' ? 'bg-[#7fd6a8]' : 'bg-rival'} ${
          active ? 'timer-urgent' : ''
        }`}
        aria-hidden="true"
      />
      <span aria-live="polite">{text[opponent.status]}</span>
    </p>
  );
}

function announcement(view: MatchView): string {
  const { settings } = view;
  switch (view.phase) {
    case 'waiting':
      return 'Waiting for the round to start.';
    case 'memorizing':
      return `${settings.label} level. Memorize the grid of ${view.grid.length} cards. ${settings.memorizeSeconds} seconds.`;
    case 'selecting':
      return `Cards are face-down and the community cards are revealed. Choose ${GAME_CONFIG.picksRequired} cards within ${settings.selectSeconds} seconds.`;
    case 'handoff':
      return 'Turn over. Pass the device to the next player.';
    case 'revealing':
      return 'Selection closed. Revealing both players’ picks.';
    case 'results':
      return 'Round complete. Results are shown.';
  }
}

export function MatchScreen({ view, actions, onLeave, banner }: MatchScreenProps) {
  const { settings } = view;
  const remaining = useRemaining(view.endsAt);
  const opponent = view.opponents[0] ?? null;
  // One device: two people share this screen, so name them instead of saying "you",
  // and keep the scoreboard in a fixed order instead of swapping sides each turn.
  const shared = view.turnMode === 'sequential';
  const scoreboard = (
    <Scoreboard
      me={shared ? (view.players[0]?.id ?? view.me) : view.me}
      players={view.players}
      ties={view.ties}
      active={shared && view.phase === 'selecting' ? view.turn : null}
    />
  );
  const viewerName = view.players.find((p) => p.id === view.me)?.name ?? '';
  const title = shared ? view.players.map((p) => p.name).join(' vs ') : `vs ${opponent?.name ?? 'opponent'}`;

  if (view.phase === 'waiting' || view.roundId === null) {
    return (
      <div className="grid min-h-dvh place-items-center text-muted" role="status">
        Dealing…
      </div>
    );
  }

  if (view.phase === 'handoff') {
    return (
      <HandoffScreen
        nextName={viewerName}
        otherName={opponent?.name ?? ''}
        firstTurn={opponent?.status === 'up-next'}
        scoreboard={scoreboard}
        onReady={actions.beginTurn}
        onLeave={onLeave}
      />
    );
  }

  const timer =
    view.phase === 'memorizing' ? (
      <CountdownTimer label="Memorize" remainingMs={remaining} totalMs={settings.memorizeSeconds * 1000} />
    ) : view.phase === 'selecting' ? (
      <CountdownTimer label="Select" remainingMs={remaining} totalMs={settings.selectSeconds * 1000} />
    ) : null;

  const results = view.results;
  // Online: this player is ready for the next round and the opponent isn't yet.
  const waitingFor =
    !shared && results?.ready.includes(view.me) && opponent && !results.ready.includes(opponent.id)
      ? opponent.name
      : null;
  const myOutcome = results?.outcomes[view.me];
  const anyoneFoundBest = results
    ? Object.values(results.outcomes).some((o) => o.kind === 'complete' && o.isBest)
    : false;
  const bestPositions = myOutcome && !anyoneFoundBest ? myOutcome.best.positions : [];
  const revealedGrid = view.grid.every((c): c is Card => c !== null) ? view.grid : null;
  const selectable = view.phase === 'selecting' && !view.myLocked && (view.turn === null || view.turn === view.me);

  return (
    <div
      className={`mx-auto flex min-h-dvh w-full max-w-6xl flex-col px-4 sm:px-6 ${
        selectable ? 'pb-24 lg:pb-8' : 'pb-8'
      }`}
    >
      <GameHeader phase={view.phase} difficulty={`${settings.label} · ${title}`} timer={timer} onExit={onLeave} />
      <h1 className="sr-only">Memory Poker {title}</h1>
      <p className="sr-only" role="status" aria-live="polite">
        {announcement(view)}
      </p>
      {scoreboard}
      {banner}

      <main className="game-layout flex-1">
        <div className="area-board">
          <CommunityCards cards={view.community} count={GAME_CONFIG.communityCount} />
        </div>

        <section aria-label="Grid" className="area-grid felt flex items-center justify-center rounded-3xl p-4 sm:p-7">
          <CardGrid
            roundId={view.roundId}
            cards={view.grid}
            columns={settings.gridColumns}
            rows={settings.gridRows}
            selected={view.myPicks}
            selectedLabel={shared && view.phase !== 'selecting' ? `${viewerName}'s pick` : undefined}
            selectable={selectable}
            revealing={view.phase === 'revealing'}
            opponent={opponent?.picks ? { name: opponent.name, picks: opponent.picks } : null}
            bestPositions={bestPositions}
            dimOthers={view.phase === 'results'}
            onToggle={actions.toggle}
          />
        </section>

        <div className="area-panel">
          {view.phase === 'results' && results && revealedGrid ? (
            <MatchResultPanel
              key={view.roundId}
              me={view.me}
              players={view.players}
              grid={revealedGrid}
              results={results}
              onNextRound={actions.nextRound}
              onLeave={onLeave}
              shared={shared}
              waitingFor={waitingFor}
            />
          ) : view.phase !== 'results' ? (
            <PhaseInstructions
              key={`${view.phase}-${view.myLocked}`}
              phase={view.phase}
              levelLabel={settings.label}
              gridCount={view.grid.length}
              selectedCount={view.myPicks.length}
              locked={view.phase === 'selecting' && view.myLocked}
              onSubmit={actions.submit}
            >
              {opponent && (!shared || view.phase === 'selecting') && <OpponentStatus opponent={opponent} />}
            </PhaseInstructions>
          ) : null}
        </div>
      </main>
    </div>
  );
}
