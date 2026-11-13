import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DIFFICULTIES } from '../game/gameConfig';
import { NET_CONFIG } from '../net/protocol';
import { BOTH_CONNECTED, JOINED, ROOM_CODE, fakeSockets, serverMatch, stateMessage } from '../test/online';
import { loadSession } from './onlineSession';
import { useOnlineMatch, type OnlineIntent } from './useOnlineMatch';

const URL = 'ws://test.local/ws';
const CREATE: OnlineIntent = { type: 'create', name: 'Ana', difficulty: 'medium' };

function setup(intent: OnlineIntent = CREATE) {
  const fake = fakeSockets();
  const hook = renderHook(() => useOnlineMatch(intent, { url: URL, createSocket: fake.factory }));
  return { fake, hook, state: () => hook.result.current.state };
}

/** Connect and join, as Ana. */
function joined(intent: OnlineIntent = CREATE) {
  const ctx = setup(intent);
  ctx.fake.latest().open();
  ctx.fake.latest().receive(JOINED);
  return ctx;
}

const advance = (ms: number) => act(() => vi.advanceTimersByTime(ms));

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('useOnlineMatch', () => {
  it('sends the intent once connected and remembers the room', () => {
    const { fake, state } = setup();
    expect(fake.latest().url).toBe(URL);
    expect(state().phase).toBe('connecting');

    fake.latest().open();
    expect(fake.latest().sent).toEqual([CREATE]);

    fake.latest().receive(JOINED);
    fake.latest().receive(stateMessage(null, [{ id: 'p1', name: 'Ana', presence: 'connected' }]));
    expect(state()).toMatchObject({
      phase: 'in-room',
      session: { roomCode: ROOM_CODE, playerId: 'p1', token: 'token-ana' },
      view: null,
    });
    expect(state().room?.code).toBe(ROOM_CODE);
    expect(loadSession()).toEqual({ roomCode: ROOM_CODE, token: 'token-ana' });
  });

  it('converts server deadlines to this device’s clock', () => {
    const { fake, state } = joined();
    const serverNow = Date.now() + 5000;
    fake.latest().receive(stateMessage(serverMatch([], serverNow), BOTH_CONNECTED, false, serverNow));
    expect(state().view?.endsAt).toBe(Date.now() + DIFFICULTIES.medium.memorizeSeconds * 1000);
  });

  it('sends player actions', () => {
    const { fake, hook } = joined();
    act(() => {
      hook.result.current.actions.toggle(3);
      hook.result.current.actions.submit();
      hook.result.current.actions.nextRound();
    });
    expect(fake.latest().sent.slice(1)).toEqual([{ type: 'toggle', position: 3 }, { type: 'submit' }, { type: 'nextRound' }]);
  });

  it('reconnects with growing delays and resumes with the saved token', () => {
    const { fake, state } = joined();
    fake.latest().drop();
    expect(state().phase).toBe('reconnecting');
    expect(fake.sockets).toHaveLength(1);

    advance(1000);
    expect(fake.sockets).toHaveLength(2);
    fake.latest().drop(); // that attempt failed too

    advance(1999);
    expect(fake.sockets).toHaveLength(2);
    advance(1);
    expect(fake.sockets).toHaveLength(3);

    fake.latest().open();
    expect(fake.latest().sent).toEqual([{ type: 'resume', roomCode: ROOM_CODE, token: 'token-ana' }]);
    fake.latest().receive(JOINED);
    expect(state().phase).toBe('in-room');
  });

  it('gives up after 30 s and reports the connection as lost', () => {
    const { fake, state } = joined();
    fake.latest().drop();
    for (let i = 0; i < 10 && state().phase !== 'failed'; i++) {
      advance(NET_CONFIG.reconnectGraceMs); // fires the pending retry
      fake.latest().drop();
    }
    expect(state()).toMatchObject({ phase: 'failed', failure: 'connection-lost' });
    expect(loadSession()).toBeNull();
  });

  it('a server error fails the intent and closes the socket', () => {
    const { fake, state } = setup({ type: 'join', roomCode: 'ABCD', name: 'Ben' });
    fake.latest().open();
    fake.latest().receive({ type: 'error', code: 'room-not-found', message: 'No room with that code.' });
    expect(state()).toMatchObject({ phase: 'failed', failure: 'room-not-found' });
    expect(fake.latest().closed).toBe(true);
  });

  it('does not retry when the server can’t be reached before joining', () => {
    const { fake, state } = setup();
    fake.latest().drop();
    expect(state()).toMatchObject({ phase: 'failed', failure: 'unreachable' });
    advance(5000);
    expect(fake.sockets).toHaveLength(1);
  });

  it('resumes a saved room when asked to', () => {
    const { fake } = setup({ type: 'resume', roomCode: ROOM_CODE, token: 'token-ana' });
    fake.latest().open();
    expect(fake.latest().sent).toEqual([{ type: 'resume', roomCode: ROOM_CODE, token: 'token-ana' }]);
  });

  it('leave tells the server, forgets the room and stops reconnecting', () => {
    const { fake, hook } = joined();
    act(() => hook.result.current.leave());
    expect(fake.latest().sent.at(-1)).toEqual({ type: 'leave' });
    expect(fake.latest().closed).toBe(true);
    expect(loadSession()).toBeNull();
    fake.latest().drop();
    advance(5000);
    expect(fake.sockets).toHaveLength(1);
  });

  it('stops reconnecting once the room has closed', () => {
    const { fake } = joined();
    fake.latest().receive(stateMessage(null, BOTH_CONNECTED, true));
    expect(loadSession()).toBeNull();
    fake.latest().drop();
    advance(5000);
    expect(fake.sockets).toHaveLength(1);
  });

  it('unmounting closes the socket and cancels a pending retry', () => {
    const { fake, hook } = joined();
    fake.latest().drop();
    hook.unmount();
    advance(5000);
    expect(fake.sockets).toHaveLength(1);
  });
});
