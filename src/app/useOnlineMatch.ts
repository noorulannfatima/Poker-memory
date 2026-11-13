import { useCallback, useEffect, useMemo, useReducer, useRef } from 'react';
import type { Difficulty } from '../game/gameConfig';
import type { MatchView } from '../game/match';
import { NET_CONFIG, type ClientMessage, type ErrorCode, type RoomView, type ServerMessage } from '../net/protocol';
import type { MatchActions } from './matchActions';
import { clearSession, saveSession, type SavedSession } from './onlineSession';
import { browserSocket, type SocketFactory, type SocketLike } from './socket';

export type OnlineIntent =
  | { readonly type: 'create'; readonly name: string; readonly difficulty: Difficulty }
  | { readonly type: 'join'; readonly roomCode: string; readonly name: string }
  | { readonly type: 'resume'; readonly roomCode: string; readonly token: string };

export type OnlineFailure = ErrorCode | 'connection-lost' | 'unreachable';

export interface OnlineSession {
  readonly roomCode: string;
  readonly playerId: string;
  readonly token: string;
}

export interface OnlineState {
  readonly phase: 'connecting' | 'in-room' | 'reconnecting' | 'failed';
  readonly session: OnlineSession | null;
  readonly room: RoomView | null;
  /** The latest match view, with `endsAt` converted to this device's clock. */
  readonly view: MatchView | null;
  readonly failure: OnlineFailure | null;
}

type OnlineEvent =
  | { readonly type: 'joined'; readonly session: OnlineSession }
  | { readonly type: 'state'; readonly room: RoomView; readonly view: MatchView | null; readonly offset: number }
  | { readonly type: 'dropped' }
  | { readonly type: 'failed'; readonly failure: OnlineFailure };

const INITIAL: OnlineState = { phase: 'connecting', session: null, room: null, view: null, failure: null };

function onlineReducer(state: OnlineState, event: OnlineEvent): OnlineState {
  switch (event.type) {
    case 'joined':
      return { ...state, phase: 'in-room', session: event.session, failure: null };
    case 'state': {
      const { view, offset } = event;
      return {
        ...state,
        room: event.room,
        // The server's clock may differ from this device's: shift deadlines by the difference.
        view: view && view.endsAt !== null ? { ...view, endsAt: view.endsAt - offset } : view,
      };
    }
    case 'dropped':
      return state.phase === 'failed' ? state : { ...state, phase: 'reconnecting' };
    case 'failed':
      return { ...state, phase: 'failed', failure: event.failure };
  }
}

export interface UseOnlineMatchOptions {
  readonly url: string;
  readonly createSocket?: SocketFactory;
}

/**
 * One online match: connects, sends the intent (create, join or resume), and
 * keeps the latest room and match view from the server. When a joined
 * connection drops, it retries with growing delays (1 s, 2 s, 4 s…) for up to
 * 30 s and resumes with the saved token.
 */
export function useOnlineMatch(
  intent: OnlineIntent,
  { url, createSocket = browserSocket }: UseOnlineMatchOptions,
): { state: OnlineState; actions: MatchActions; leave: () => void } {
  const [state, dispatch] = useReducer(onlineReducer, INITIAL);
  const socketRef = useRef<SocketLike | null>(null);
  const stopRef = useRef<() => void>(() => {});

  useEffect(() => {
    let socket: SocketLike | null = null;
    let stopped = false;
    let resumeFrom: SavedSession | null =
      intent.type === 'resume' ? { roomCode: intent.roomCode, token: intent.token } : null;
    let droppedAt: number | null = null;
    let attempt = 0;
    let retry: ReturnType<typeof setTimeout> | null = null;

    const send = (message: ClientMessage) => socket?.send(JSON.stringify(message));

    const stop = () => {
      stopped = true;
      if (retry) clearTimeout(retry);
      retry = null;
      if (socketRef.current === socket) socketRef.current = null;
      socket?.close();
      socket = null;
    };

    const fail = (failure: OnlineFailure) => {
      clearSession();
      dispatch({ type: 'failed', failure });
      stop();
    };

    const onMessage = (data: string) => {
      if (stopped) return;
      let message: ServerMessage;
      try {
        message = JSON.parse(data) as ServerMessage;
      } catch {
        return;
      }
      switch (message.type) {
        case 'joined':
          droppedAt = null;
          attempt = 0;
          resumeFrom = { roomCode: message.roomCode, token: message.token };
          saveSession(resumeFrom);
          dispatch({
            type: 'joined',
            session: { roomCode: message.roomCode, playerId: message.playerId, token: message.token },
          });
          return;
        case 'state':
          dispatch({ type: 'state', room: message.room, view: message.view, offset: message.now - Date.now() });
          if (message.room.closed) {
            // The game is over: nothing to resume, so never reconnect.
            clearSession();
            resumeFrom = null;
            stopped = true;
          }
          return;
        case 'error':
          fail(message.code);
          return;
      }
    };

    const onClose = () => {
      if (stopped) return;
      if (socketRef.current === socket) socketRef.current = null;
      socket = null;
      // Before joining there is nothing to resume, and resending create/join could duplicate a room.
      if (!resumeFrom) {
        fail('unreachable');
        return;
      }
      const now = Date.now();
      droppedAt ??= now;
      const remaining = NET_CONFIG.reconnectGraceMs - (now - droppedAt);
      if (remaining <= 0) {
        fail('connection-lost');
        return;
      }
      dispatch({ type: 'dropped' });
      retry = setTimeout(connect, Math.min(1000 * 2 ** attempt, remaining));
      attempt += 1;
    };

    function connect() {
      retry = null;
      socket = createSocket(url, {
        onOpen: () => {
          if (resumeFrom) send({ type: 'resume', ...resumeFrom });
          else if (intent.type !== 'resume') send(intent);
        },
        onMessage,
        onClose,
      });
      socketRef.current = socket;
    }

    stopRef.current = stop;
    connect();
    return stop;
  }, [intent, url, createSocket]);

  const sendAction = useCallback((message: ClientMessage) => {
    socketRef.current?.send(JSON.stringify(message));
  }, []);

  const leave = useCallback(() => {
    sendAction({ type: 'leave' });
    clearSession();
    stopRef.current();
  }, [sendAction]);

  const actions = useMemo<MatchActions>(
    () => ({
      toggle: (position) => sendAction({ type: 'toggle', position }),
      submit: () => sendAction({ type: 'submit' }),
      nextRound: () => sendAction({ type: 'nextRound' }),
      // Online play is simultaneous: there are no handoffs.
      beginTurn: () => {},
    }),
    [sendAction],
  );

  return { state, actions, leave };
}
