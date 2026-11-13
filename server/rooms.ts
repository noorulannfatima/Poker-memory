import { dealRound } from '../src/game/deal';
import { cryptoRandom } from '../src/game/deck';
import type { Difficulty } from '../src/game/gameConfig';
import type { RandomFn } from '../src/game/gameTypes';
import { createMatch, matchReducer, viewFor, type MatchAction, type MatchState, type PlayerId } from '../src/game/match';
import {
  NET_CONFIG,
  ROOM_CODE_ALPHABET,
  ROOM_CODE_LENGTH,
  parseClientMessage,
  type ErrorCode,
  type RoomView,
  type ServerMessage,
} from '../src/net/protocol';

/** One browser connection, as the room server sees it. */
export interface Connection {
  send(message: ServerMessage): void;
  close(): void;
}

export interface RoomServerOptions {
  /** Deals and room codes. Defaults to crypto-quality randomness. */
  random?: RandomFn;
  /** Where ignored or rejected messages are reported. Silent by default. */
  log?: (message: string) => void;
}

type Timer = ReturnType<typeof setTimeout>;

interface Seat {
  readonly id: PlayerId;
  readonly name: string;
  readonly token: string;
  conn: Connection | null;
  left: boolean;
  graceTimer: Timer | null;
}

interface Room {
  readonly code: string;
  readonly difficulty: Difficulty;
  readonly seats: Seat[];
  match: MatchState | null;
  closed: boolean;
  nextRoundId: number;
  phaseTimer: Timer | null;
  idleTimer: Timer | null;
}

const ERROR_TEXT: Record<ErrorCode, string> = {
  'room-not-found': 'No room with that code.',
  'room-full': 'That room is already full.',
  'room-closed': 'That game has ended.',
  'bad-token': 'That game has ended.',
  'server-busy': 'The server is busy. Try again in a few minutes.',
};

const encoder = new TextEncoder();

/**
 * Online rooms, independent of the transport: the WebSocket layer passes in raw text
 * messages and disconnects. The server owns the deal, the clock and the score,
 * and each player only ever receives `viewFor(match, thatPlayer)`.
 */
export class RoomServer {
  private readonly rooms = new Map<string, Room>();
  private readonly seated = new Map<Connection, { room: Room; seat: Seat }>();
  private readonly rates = new Map<Connection, { start: number; count: number }>();
  private readonly creates = new Map<Connection, number>();
  /** Connections already cut off: ws may still deliver buffered frames, which must not reset limits. */
  private readonly cutOff = new WeakSet<Connection>();
  private readonly random: RandomFn;
  private readonly log: (message: string) => void;

  constructor({ random = cryptoRandom, log = () => {} }: RoomServerOptions = {}) {
    this.random = random;
    this.log = log;
  }

  /** Handles one raw text message from a connection. */
  handle(conn: Connection, raw: string): void {
    if (this.cutOff.has(conn)) return;
    if (encoder.encode(raw).length > NET_CONFIG.maxMessageBytes || this.overRate(conn)) {
      this.log('Cutting off a connection: message too large or too frequent.');
      this.cutOff.add(conn);
      this.disconnect(conn);
      conn.close();
      return;
    }
    const message = parseClientMessage(raw);
    if (!message) {
      this.log('Ignoring a malformed or unknown message.');
      return;
    }
    switch (message.type) {
      case 'create':
        return this.create(conn, message.name, message.difficulty);
      case 'join':
        return this.join(conn, message.roomCode, message.name);
      case 'resume':
        return this.resume(conn, message.roomCode, message.token);
      case 'toggle':
        return this.play(conn, (playerId) => ({ type: 'TOGGLE_POSITION', playerId, position: message.position }));
      case 'submit':
        return this.play(conn, (playerId) => ({ type: 'SUBMIT_SELECTION', playerId, now: Date.now() }));
      case 'nextRound':
        return this.nextRound(conn);
      case 'leave': {
        const at = this.seated.get(conn);
        if (at) this.closeRoom(at.room, at.seat);
        return;
      }
    }
  }

  /** The connection closed. Its player gets a grace period to resume. */
  disconnect(conn: Connection): void {
    this.rates.delete(conn);
    this.creates.delete(conn);
    const at = this.seated.get(conn);
    if (!at) return;
    this.seated.delete(conn);
    const { room, seat } = at;
    if (seat.conn !== conn) return;
    seat.conn = null;
    if (room.closed) return;
    seat.graceTimer = setTimeout(() => {
      seat.graceTimer = null;
      this.closeRoom(room, seat);
    }, NET_CONFIG.reconnectGraceMs);
    this.broadcast(room);
  }

  /** Stops every timer and forgets every room (tests and process shutdown). */
  shutdown(): void {
    for (const room of this.rooms.values()) this.clearTimers(room);
    this.rooms.clear();
    this.seated.clear();
    this.rates.clear();
    this.creates.clear();
  }

  private create(conn: Connection, name: string, difficulty: Difficulty): void {
    if (this.seated.has(conn)) return;
    const made = this.creates.get(conn) ?? 0;
    const code = this.rooms.size >= NET_CONFIG.maxRooms || made >= NET_CONFIG.maxRoomsPerConnection ? null : this.newCode();
    if (code === null) return this.fail(conn, 'server-busy');
    this.creates.set(conn, made + 1);
    const room: Room = {
      code,
      difficulty,
      seats: [],
      match: null,
      closed: false,
      nextRoundId: 1,
      phaseTimer: null,
      idleTimer: null,
    };
    const seat = this.newSeat('p1', name);
    room.seats.push(seat);
    this.rooms.set(room.code, room);
    this.attach(conn, room, seat);
    this.touch(room);
    this.broadcast(room);
  }

  private join(conn: Connection, code: string, name: string): void {
    if (this.seated.has(conn)) return;
    const room = this.rooms.get(code);
    if (!room) return this.fail(conn, 'room-not-found');
    if (room.closed) return this.fail(conn, 'room-closed');
    if (room.seats.length >= 2) return this.fail(conn, 'room-full');

    const taken = room.seats.some((s) => s.name.toLowerCase() === name.toLowerCase());
    const seat = this.newSeat('p2', taken ? `${name.slice(0, NET_CONFIG.maxNameLength - 2)} 2` : name);
    room.seats.push(seat);
    this.attach(conn, room, seat);
    this.touch(room);
    room.match = createMatch({
      players: room.seats.map((s) => ({ id: s.id, name: s.name })),
      difficulty: room.difficulty,
      turnMode: 'simultaneous',
    });
    this.dispatch(room, { type: 'START_ROUND', round: this.deal(room), now: Date.now() });
  }

  private resume(conn: Connection, code: string, token: string): void {
    if (this.seated.has(conn)) return;
    const room = this.rooms.get(code);
    if (!room) return this.fail(conn, 'room-not-found');
    if (room.closed) return this.fail(conn, 'room-closed');
    const seat = room.seats.find((s) => s.token === token);
    if (!seat) return this.fail(conn, 'bad-token');
    this.attach(conn, room, seat);
    this.touch(room);
    this.broadcast(room);
  }

  private play(conn: Connection, action: (playerId: PlayerId) => MatchAction): void {
    const at = this.seated.get(conn);
    if (!at || at.room.closed) return;
    this.touch(at.room);
    this.dispatch(at.room, action(at.seat.id));
  }

  private nextRound(conn: Connection): void {
    const at = this.seated.get(conn);
    if (!at || at.room.closed) return;
    const { room } = at;
    this.touch(room);
    this.dispatch(room, { type: 'NEXT_ROUND', playerId: at.seat.id });
    const match = room.match;
    if (match?.phase === 'results' && match.players.every((p) => match.ready.includes(p.id))) {
      this.dispatch(room, { type: 'START_ROUND', round: this.deal(room), now: Date.now() });
    }
  }

  /** Applies an action; on any change, reschedules the phase timer and tells both players. */
  private dispatch(room: Room, action: MatchAction): void {
    if (!room.match) return;
    const next = matchReducer(room.match, action);
    if (next === room.match) return;
    room.match = next;
    this.schedule(room);
    this.broadcast(room);
  }

  private schedule(room: Room): void {
    if (room.phaseTimer) clearTimeout(room.phaseTimer);
    room.phaseTimer = null;
    const match = room.match;
    if (!match || !('endsAt' in match)) return;
    const { phase, endsAt } = match;
    const roundId = match.round.id;
    room.phaseTimer = setTimeout(() => {
      room.phaseTimer = null;
      this.dispatch(room, { type: 'PHASE_TIMEOUT', phase, roundId, now: Date.now() });
    }, Math.max(0, endsAt - Date.now()));
  }

  private broadcast(room: Room): void {
    const roomView: RoomView = {
      code: room.code,
      difficulty: room.difficulty,
      closed: room.closed,
      players: room.seats.map(
        (s): RoomView['players'][number] => ({
          id: s.id,
          name: s.name,
          presence: s.left ? 'left' : s.conn ? 'connected' : 'reconnecting',
        }),
      ),
    };
    const now = Date.now();
    for (const seat of room.seats) {
      seat.conn?.send({ type: 'state', room: roomView, view: room.match ? viewFor(room.match, seat.id) : null, now });
    }
  }

  private closeRoom(room: Room, leaver: Seat | null): void {
    if (room.closed) return;
    room.closed = true;
    if (leaver) leaver.left = true;
    this.clearTimers(room);
    this.broadcast(room);
    for (const seat of room.seats) {
      if (seat.conn) this.seated.delete(seat.conn);
      seat.conn = null;
    }
    // Keep the closed room for a while so late joins and resumes hear 'room-closed'.
    room.idleTimer = setTimeout(() => this.rooms.delete(room.code), NET_CONFIG.roomIdleMs);
  }

  /** Activity: push back the idle close. */
  private touch(room: Room): void {
    if (room.closed) return;
    if (room.idleTimer) clearTimeout(room.idleTimer);
    room.idleTimer = setTimeout(() => this.closeRoom(room, null), NET_CONFIG.roomIdleMs);
  }

  private clearTimers(room: Room): void {
    if (room.phaseTimer) clearTimeout(room.phaseTimer);
    if (room.idleTimer) clearTimeout(room.idleTimer);
    room.phaseTimer = null;
    room.idleTimer = null;
    for (const seat of room.seats) {
      if (seat.graceTimer) clearTimeout(seat.graceTimer);
      seat.graceTimer = null;
    }
  }

  private attach(conn: Connection, room: Room, seat: Seat): void {
    const previous = seat.conn;
    if (previous && previous !== conn) {
      this.seated.delete(previous);
      previous.close();
    }
    if (seat.graceTimer) clearTimeout(seat.graceTimer);
    seat.graceTimer = null;
    seat.conn = conn;
    this.seated.set(conn, { room, seat });
    conn.send({ type: 'joined', roomCode: room.code, playerId: seat.id, token: seat.token });
  }

  private fail(conn: Connection, code: ErrorCode): void {
    conn.send({ type: 'error', code, message: ERROR_TEXT[code] });
  }

  private deal(room: Room) {
    return dealRound(room.nextRoundId++, this.random, room.difficulty);
  }

  private newSeat(id: PlayerId, name: string): Seat {
    return { id, name, token: crypto.randomUUID(), conn: null, left: false, graceTimer: null };
  }

  /** A free room code, or null if 20 random tries all collide. */
  private newCode(): string | null {
    for (let attempt = 0; attempt < 20; attempt++) {
      let code = '';
      for (let i = 0; i < ROOM_CODE_LENGTH; i++) {
        code += ROOM_CODE_ALPHABET.charAt(Math.floor(this.random() * ROOM_CODE_ALPHABET.length));
      }
      if (!this.rooms.has(code)) return code;
    }
    return null;
  }

  private overRate(conn: Connection): boolean {
    const now = Date.now();
    const window = this.rates.get(conn);
    if (!window || now - window.start >= 1000) {
      this.rates.set(conn, { start: now, count: 1 });
      return false;
    }
    window.count += 1;
    return window.count > NET_CONFIG.maxMessagesPerSecond;
  }
}
