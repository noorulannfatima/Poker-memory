// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createSeededRandom } from '../src/game/deck';
import { DIFFICULTIES, GAME_CONFIG } from '../src/game/gameConfig';
import type { MatchView } from '../src/game/match';
import { NET_CONFIG, ROOM_CODE_ALPHABET, type ClientMessage, type ServerMessage } from '../src/net/protocol';
import { RoomServer, type Connection } from './rooms';

const MEDIUM = DIFFICULTIES.medium;
const MEMORIZE_MS = MEDIUM.memorizeSeconds * 1000;
const SELECT_MS = MEDIUM.selectSeconds * 1000;

class FakeConn implements Connection {
  readonly sent: ServerMessage[] = [];
  closed = false;

  send(message: ServerMessage): void {
    this.sent.push(message);
  }

  close(): void {
    this.closed = true;
  }

  /** The most recent message of one type. */
  last<T extends ServerMessage['type']>(type: T): Extract<ServerMessage, { type: T }> {
    for (let i = this.sent.length - 1; i >= 0; i--) {
      const message = this.sent[i];
      if (message?.type === type) return message as Extract<ServerMessage, { type: T }>;
    }
    throw new Error(`No ${type} message was sent`);
  }

  view(): MatchView {
    const view = this.last('state').view;
    if (!view) throw new Error('No match view yet');
    return view;
  }
}

let server: RoomServer;
const say = (conn: Connection, message: ClientMessage) => server.handle(conn, JSON.stringify(message));
const advance = (ms: number) => vi.advanceTimersByTime(ms);

/** Ana creates a medium room and Ben joins it, which starts the first round. */
function startMatch() {
  const ana = new FakeConn();
  const ben = new FakeConn();
  say(ana, { type: 'create', name: 'Ana', difficulty: 'medium' });
  const code = ana.last('joined').roomCode;
  say(ben, { type: 'join', roomCode: code, name: 'Ben' });
  return { ana, ben, code };
}

beforeEach(() => {
  vi.useFakeTimers();
  server = new RoomServer({ random: createSeededRandom(3) });
});

afterEach(() => {
  server.shutdown();
  vi.useRealTimers();
});

describe('RoomServer — rooms', () => {
  it('create gives a 4-letter code and a token, then waits for an opponent', () => {
    const ana = new FakeConn();
    say(ana, { type: 'create', name: 'Ana', difficulty: 'medium' });
    const joined = ana.last('joined');
    expect(joined.roomCode).toHaveLength(4);
    expect([...joined.roomCode].every((letter) => ROOM_CODE_ALPHABET.includes(letter))).toBe(true);
    expect(joined.playerId).toBe('p1');
    expect(joined.token.length).toBeGreaterThan(10);

    const state = ana.last('state');
    expect(state.view).toBeNull();
    expect(state.room).toEqual({
      code: joined.roomCode,
      difficulty: 'medium',
      closed: false,
      players: [{ id: 'p1', name: 'Ana', presence: 'connected' }],
    });
  });

  it('joining starts the first round for both players on the server clock', () => {
    const { ana, ben } = startMatch();
    expect(ben.last('joined').playerId).toBe('p2');
    for (const conn of [ana, ben]) {
      const view = conn.view();
      expect(view.phase).toBe('memorizing');
      expect(view.grid).toHaveLength(16);
      expect(view.players.map((p) => p.name)).toEqual(['Ana', 'Ben']);
      expect(view.endsAt).toBe(Date.now() + MEMORIZE_MS);
    }
  });

  it('rejects unknown codes and full rooms; codes are not case-sensitive', () => {
    const { code } = startMatch();
    const cat = new FakeConn();
    say(cat, { type: 'join', roomCode: code === 'ZZZZ' ? 'YYYY' : 'ZZZZ', name: 'Cat' });
    expect(cat.last('error').code).toBe('room-not-found');
    say(cat, { type: 'join', roomCode: code.toLowerCase(), name: 'Cat' });
    expect(cat.last('error').code).toBe('room-full');
  });

  it('gives a second player with the same name a suffix', () => {
    const ana = new FakeConn();
    const twin = new FakeConn();
    say(ana, { type: 'create', name: 'Ana', difficulty: 'medium' });
    say(twin, { type: 'join', roomCode: ana.last('joined').roomCode, name: 'ana' });
    expect(twin.view().players.map((p) => p.name)).toEqual(['Ana', 'ana 2']);
  });
});

describe('RoomServer — a round', () => {
  it('runs memorize, select, reveal and results on server time, and tallies', () => {
    const { ana, ben } = startMatch();
    advance(MEMORIZE_MS);
    expect(ana.view().phase).toBe('selecting');

    say(ana, { type: 'toggle', position: 0 });
    say(ana, { type: 'toggle', position: 1 });
    say(ana, { type: 'submit' });
    expect(ben.view().opponents[0]?.status).toBe('locked');

    say(ben, { type: 'toggle', position: 2 });
    say(ben, { type: 'toggle', position: 3 });
    say(ben, { type: 'submit' });
    expect(ana.view().phase).toBe('revealing');

    advance(GAME_CONFIG.revealMs);
    const results = ana.view();
    expect(results.phase).toBe('results');
    expect(results.opponents[0]?.picks).toEqual([2, 3]);
    expect(results.players.reduce((sum, p) => sum + p.wins, results.ties)).toBe(1);
  });

  it('ends selection when the server timer runs out', () => {
    const { ana } = startMatch();
    advance(MEMORIZE_MS);
    say(ana, { type: 'toggle', position: 4 });
    advance(SELECT_MS);
    expect(ana.view().phase).toBe('revealing');
    advance(GAME_CONFIG.revealMs);
    expect(ana.view().results?.selections.p1).toEqual({ positions: [4], reason: 'timeout' });
  });

  it('starts the next round only when both players press Next round', () => {
    const { ana, ben } = startMatch();
    advance(MEMORIZE_MS);
    advance(SELECT_MS);
    advance(GAME_CONFIG.revealMs);

    say(ana, { type: 'nextRound' });
    expect(ana.view().phase).toBe('results');
    expect(ana.view().results?.ready).toEqual(['p1']);

    say(ben, { type: 'nextRound' });
    expect(ana.view().phase).toBe('memorizing');
    expect(ana.view().roundId).toBe(2);
  });

  it('never sends face-down cards or the opponent’s picks while selecting', () => {
    const { ana, ben } = startMatch();
    const grid = ana.view().grid; // face-up while memorizing
    const from = { ana: ana.sent.length, ben: ben.sent.length };

    advance(MEMORIZE_MS);
    say(ana, { type: 'toggle', position: 0 });
    say(ana, { type: 'toggle', position: 1 });
    say(ana, { type: 'submit' });
    say(ben, { type: 'toggle', position: 5 });

    const duringSelection = [...ana.sent.slice(from.ana), ...ben.sent.slice(from.ben)];
    expect(duringSelection.length).toBeGreaterThan(0);
    const wire = JSON.stringify(duringSelection);
    for (const card of grid) {
      expect(card).not.toBeNull();
      expect(wire).not.toContain(JSON.stringify(card));
    }
    for (const message of duringSelection) {
      if (message.type !== 'state') continue;
      for (const opponent of message.view?.opponents ?? []) expect(opponent.picks).toBeNull();
    }
  });
});

describe('RoomServer — bad input', () => {
  it('ignores malformed, unknown and out-of-phase messages, and strangers', () => {
    const { ana } = startMatch();
    const before = ana.sent.length;
    server.handle(ana, 'not json');
    server.handle(ana, JSON.stringify({ type: 'dance' }));
    say(ana, { type: 'toggle', position: 99 }); // still memorizing
    const stranger = new FakeConn();
    say(stranger, { type: 'submit' });

    expect(ana.sent).toHaveLength(before);
    expect(stranger.sent).toEqual([]);
    expect(ana.closed).toBe(false);
  });

  it('cuts off a connection that sends an oversized message', () => {
    const conn = new FakeConn();
    server.handle(conn, 'x'.repeat(NET_CONFIG.maxMessageBytes + 1));
    expect(conn.closed).toBe(true);
  });

  it('cuts off a connection that sends more than 20 messages a second', () => {
    const { ana } = startMatch();
    advance(1000); // a fresh one-second window
    for (let i = 0; i < NET_CONFIG.maxMessagesPerSecond; i++) say(ana, { type: 'toggle', position: 0 });
    expect(ana.closed).toBe(false);
    say(ana, { type: 'toggle', position: 0 });
    expect(ana.closed).toBe(true);
  });
});

describe('RoomServer — bounded room creation', () => {
  it('stops a connection that creates and leaves too many rooms', () => {
    const conn = new FakeConn();
    for (let i = 0; i < NET_CONFIG.maxRoomsPerConnection; i++) {
      say(conn, { type: 'create', name: 'Ana', difficulty: 'medium' });
      say(conn, { type: 'leave' });
    }
    say(conn, { type: 'create', name: 'Ana', difficulty: 'medium' });
    expect(conn.last('error').code).toBe('server-busy');
  });

  it('refuses new rooms once the server holds the maximum', () => {
    for (let i = 0; i < NET_CONFIG.maxRooms; i++) {
      say(new FakeConn(), { type: 'create', name: 'Ana', difficulty: 'medium' });
    }
    const late = new FakeConn();
    say(late, { type: 'create', name: 'Late', difficulty: 'medium' });
    expect(late.last('error').code).toBe('server-busy');
  });

  it('gives up finding a free code instead of hanging', () => {
    server.shutdown();
    server = new RoomServer({ random: () => 0 });
    const first = new FakeConn();
    say(first, { type: 'create', name: 'Ana', difficulty: 'medium' });
    expect(first.last('joined').roomCode).toBe(ROOM_CODE_ALPHABET.charAt(0).repeat(4));
    const second = new FakeConn();
    say(second, { type: 'create', name: 'Ben', difficulty: 'medium' });
    expect(second.last('error').code).toBe('server-busy');
  });
});

describe('RoomServer — leaving and reconnecting', () => {
  it('a dropped player can resume within 30 s and keeps their picks', () => {
    const { ana, ben, code } = startMatch();
    advance(MEMORIZE_MS);
    say(ben, { type: 'toggle', position: 2 });
    const token = ben.last('joined').token;

    server.disconnect(ben);
    expect(ana.last('state').room.players[1]?.presence).toBe('reconnecting');

    advance(10_000);
    const benAgain = new FakeConn();
    say(benAgain, { type: 'resume', roomCode: code, token });
    expect(benAgain.last('joined').playerId).toBe('p2');
    expect(benAgain.view().myPicks).toEqual([2]);
    expect(ana.last('state').room.players[1]?.presence).toBe('connected');

    advance(NET_CONFIG.reconnectGraceMs); // the cancelled grace timer must not close the room
    expect(ana.last('state').room.closed).toBe(false);
  });

  it('missing the 30 s window closes the room for the opponent', () => {
    const { ana, ben, code } = startMatch();
    const token = ben.last('joined').token;
    server.disconnect(ben);
    advance(NET_CONFIG.reconnectGraceMs);

    const room = ana.last('state').room;
    expect(room.closed).toBe(true);
    expect(room.players[1]?.presence).toBe('left');

    const benAgain = new FakeConn();
    say(benAgain, { type: 'resume', roomCode: code, token });
    expect(benAgain.last('error').code).toBe('room-closed');
  });

  it('a cut-off connection cannot reset its limits and keep creating rooms', () => {
    const conn = new FakeConn();
    for (let i = 0; i < NET_CONFIG.maxMessagesPerSecond + 1; i++) server.handle(conn, '{}');
    expect(conn.closed).toBe(true);
    const before = conn.sent.length;
    for (let i = 0; i < 30; i++) {
      advance(1500);
      say(conn, { type: 'create', name: 'Ana', difficulty: 'easy' });
    }
    expect(conn.sent.length).toBe(before);
  });

  it('a resume from a new connection closes the old one, which then cannot mark the seat reconnecting', () => {
    const { ana, ben, code } = startMatch();
    const token = ben.last('joined').token;
    const benAgain = new FakeConn();
    say(benAgain, { type: 'resume', roomCode: code, token });
    expect(ben.closed).toBe(true);
    server.disconnect(ben);
    expect(ana.last('state').room.players[1]?.presence).toBe('connected');
  });

  it('rejects a resume with a wrong token', () => {
    const { code } = startMatch();
    const imposter = new FakeConn();
    say(imposter, { type: 'resume', roomCode: code, token: 'nope' });
    expect(imposter.last('error').code).toBe('bad-token');
  });

  it('leaving closes the room at once and stops its timers', () => {
    const { ana, ben } = startMatch();
    say(ana, { type: 'leave' });
    const room = ben.last('state').room;
    expect(room.closed).toBe(true);
    expect(room.players[0]?.presence).toBe('left');

    expect(vi.getTimerCount()).toBe(1); // only the forget timer remains
    const count = ben.sent.length;
    advance(MEMORIZE_MS + SELECT_MS);
    expect(ben.sent).toHaveLength(count);
  });

  it('closes an idle room after 10 minutes and forgets it 10 minutes later', () => {
    const ana = new FakeConn();
    say(ana, { type: 'create', name: 'Ana', difficulty: 'medium' });
    const code = ana.last('joined').roomCode;

    advance(NET_CONFIG.roomIdleMs - 1);
    expect(ana.last('state').room.closed).toBe(false);
    advance(1);
    expect(ana.last('state').room.closed).toBe(true);

    advance(NET_CONFIG.roomIdleMs);
    const late = new FakeConn();
    say(late, { type: 'join', roomCode: code, name: 'Late' });
    expect(late.last('error').code).toBe('room-not-found');
  });
});
