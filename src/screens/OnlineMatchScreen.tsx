import { useCallback, useEffect } from 'react';
import type { SocketFactory } from '../app/socket';
import { useOnlineMatch, type OnlineFailure, type OnlineIntent } from '../app/useOnlineMatch';
import { Scoreboard } from '../components/Scoreboard';
import { WaitingRoom } from '../components/WaitingRoom';
import { DIFFICULTIES } from '../game/gameConfig';
import type { MatchView } from '../game/match';
import { NET_CONFIG, type RoomView } from '../net/protocol';
import { MatchScreen } from './MatchScreen';

const FAILURE_TEXT: Record<OnlineFailure, string> = {
  'room-not-found': 'No room with that code.',
  'room-full': 'That room is already full.',
  'room-closed': 'That game has ended.',
  'bad-token': 'That game has ended.',
  'connection-lost': 'Connection lost.',
  'server-busy': 'The server is busy. Try again in a few minutes.',
  unreachable: 'Couldn’t reach the game server. Try again in a moment.',
};

interface OnlineMatchScreenProps {
  intent: OnlineIntent;
  url: string;
  createSocket?: SocketFactory;
  /** Back to the lobby, with an error to show there (or null). */
  onExit: (error: string | null) => void;
}

/** An online match, from connecting through the waiting room to the end of the match. */
export function OnlineMatchScreen({ intent, url, createSocket, onExit }: OnlineMatchScreenProps) {
  const { state, actions, leave } = useOnlineMatch(intent, { url, createSocket });
  const exit = useCallback(() => {
    leave();
    onExit(null);
  }, [leave, onExit]);

  useEffect(() => {
    if (state.failure) onExit(FAILURE_TEXT[state.failure]);
  }, [state.failure, onExit]);

  const { room, view } = state;
  if (state.phase === 'failed') return null;
  if (!room) {
    return (
      <p className="grid min-h-dvh place-items-center text-muted" role="status">
        Connecting…
      </p>
    );
  }
  if (room.closed) return <RoomClosed room={room} view={view} me={state.session?.playerId ?? null} onBack={exit} />;
  if (!view) {
    return (
      <WaitingRoom
        code={room.code}
        levelLabel={DIFFICULTIES[room.difficulty].label}
        reconnecting={state.phase === 'reconnecting'}
        onLeave={exit}
      />
    );
  }
  return (
    <MatchScreen
      view={view}
      actions={actions}
      onLeave={exit}
      banner={<ConnectionBanner reconnecting={state.phase === 'reconnecting'} room={room} me={view.me} />}
    />
  );
}

function ConnectionBanner({ reconnecting, room, me }: { reconnecting: boolean; room: RoomView; me: string }) {
  const away = room.players.find((p) => p.id !== me && p.presence === 'reconnecting');
  const seconds = NET_CONFIG.reconnectGraceMs / 1000;
  const text = reconnecting
    ? 'Connection lost. Reconnecting…'
    : away
      ? `${away.name} lost connection. Waiting up to ${seconds} seconds for them to come back…`
      : null;
  if (!text) return null;
  return (
    <p
      role="status"
      className="mb-3 rounded-xl border border-alert/40 bg-alert/10 px-4 py-2 text-center text-sm text-ink"
      data-testid="connection-banner"
    >
      {text}
    </p>
  );
}

function RoomClosed({
  room,
  view,
  me,
  onBack,
}: {
  room: RoomView;
  view: MatchView | null;
  me: string | null;
  onBack: () => void;
}) {
  const gone = room.players.find((p) => p.presence === 'left' && p.id !== me);
  const idleMinutes = NET_CONFIG.roomIdleMs / 60_000;
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col justify-center px-4 py-10 text-center">
      {view && <Scoreboard me={view.me} players={view.players} ties={view.ties} />}
      <section className="fade-up rounded-2xl border border-line bg-charcoal/80 p-6" aria-labelledby="closed-heading">
        <h1 id="closed-heading" className="font-display text-3xl font-semibold text-ink">
          {gone ? `${gone.name} left the game` : 'This room has closed'}
        </h1>
        <p className="mt-3 text-ink/85">
          {gone ? 'The match is over.' : `Nobody played for ${idleMinutes} minutes.`}
        </p>
        <button
          type="button"
          onClick={onBack}
          className="mt-6 w-full rounded-xl bg-gold px-5 py-3.5 font-semibold text-night transition hover:bg-gold-bright"
        >
          Back to lobby
        </button>
      </section>
    </main>
  );
}
