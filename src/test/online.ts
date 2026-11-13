import { act } from '@testing-library/react';
import type { SocketFactory, SocketHandlers, SocketLike } from '../app/socket';
import { createSeededRandom } from '../game/deck';
import { dealRound } from '../game/deal';
import { createMatch, matchReducer, viewFor, type MatchAction, type MatchState } from '../game/match';
import type { ClientMessage, RoomView, ServerMessage } from '../net/protocol';

/** A socket the test drives by hand: open it, feed it server messages, drop it. */
export class FakeSocket implements SocketLike {
  readonly sent: ClientMessage[] = [];
  closed = false;
  readonly url: string;
  private readonly handlers: SocketHandlers;

  // Plain fields, not parameter properties: erasableSyntaxOnly forbids those.
  constructor(url: string, handlers: SocketHandlers) {
    this.url = url;
    this.handlers = handlers;
  }

  send(data: string): void {
    this.sent.push(JSON.parse(data) as ClientMessage);
  }

  close(): void {
    this.closed = true;
  }

  open(): void {
    act(() => this.handlers.onOpen());
  }

  receive(message: ServerMessage): void {
    act(() => this.handlers.onMessage(JSON.stringify(message)));
  }

  drop(): void {
    act(() => this.handlers.onClose());
  }
}

export function fakeSockets() {
  const sockets: FakeSocket[] = [];
  const factory: SocketFactory = (url, handlers) => {
    const socket = new FakeSocket(url, handlers);
    sockets.push(socket);
    return socket;
  };
  const latest = () => {
    const socket = sockets.at(-1);
    if (!socket) throw new Error('No socket was opened');
    return socket;
  };
  return { sockets, factory, latest };
}

export const ROOM_CODE = 'KQPZ';

export const JOINED: ServerMessage = { type: 'joined', roomCode: ROOM_CODE, playerId: 'p1', token: 'token-ana' };

export const BOTH_CONNECTED: RoomView['players'] = [
  { id: 'p1', name: 'Ana', presence: 'connected' },
  { id: 'p2', name: 'Ben', presence: 'connected' },
];

export function roomView(players: RoomView['players'] = BOTH_CONNECTED, closed = false): RoomView {
  return { code: ROOM_CODE, difficulty: 'medium', players, closed };
}

/** The server's match between Ana (p1) and Ben (p2), started at `now` and advanced by `actions`. */
export function serverMatch(actions: MatchAction[] = [], now = Date.now()): MatchState {
  const start = createMatch({
    players: [
      { id: 'p1', name: 'Ana' },
      { id: 'p2', name: 'Ben' },
    ],
    difficulty: 'medium',
  });
  const deal: MatchAction = { type: 'START_ROUND', round: dealRound(1, createSeededRandom(9), 'medium'), now };
  return [deal, ...actions].reduce(matchReducer, start);
}

/** What the server sends Ana for `match` (or the waiting room when null). */
export function stateMessage(
  match: MatchState | null,
  players: RoomView['players'] = BOTH_CONNECTED,
  closed = false,
  now = Date.now(),
): ServerMessage {
  return { type: 'state', room: roomView(players, closed), view: match ? viewFor(match, 'p1') : null, now };
}
