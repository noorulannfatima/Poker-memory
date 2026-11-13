import { isDifficulty, type Difficulty } from '../game/gameConfig';
import type { MatchView, PlayerId } from '../game/match';

/**
 * The message format between the browser and the online game server (JSON over
 * WebSocket). Both sides import this file, so it must stay free of React,
 * DOM and Node APIs.
 */

export const NET_CONFIG = {
  /** A dropped player has this long to reconnect before the room closes. */
  reconnectGraceMs: 30_000,
  /** A room closes after this long without a message from either player. */
  roomIdleMs: 10 * 60_000,
  /** Largest accepted message from a browser, in bytes. */
  maxMessageBytes: 1024,
  /** Messages one connection may send per second before it is cut off. */
  maxMessagesPerSecond: 20,
  maxNameLength: 16,
  /** Rooms held at once, open or recently closed. */
  maxRooms: 1000,
  /** How many rooms one connection may create over its lifetime. */
  maxRoomsPerConnection: 5,
} as const;

export const ROOM_CODE_LENGTH = 4;
/** Letters only, without look-alikes (no I or O). */
export const ROOM_CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ';

export type ErrorCode = 'room-not-found' | 'room-full' | 'room-closed' | 'bad-token' | 'server-busy';

export type Presence = 'connected' | 'reconnecting' | 'left';

export interface RoomView {
  readonly code: string;
  readonly difficulty: Difficulty;
  readonly players: ReadonlyArray<{ readonly id: PlayerId; readonly name: string; readonly presence: Presence }>;
  /** True once a player left or missed the reconnect window, or the room went idle. */
  readonly closed: boolean;
}

export type ClientMessage =
  | { readonly type: 'create'; readonly name: string; readonly difficulty: Difficulty }
  | { readonly type: 'join'; readonly roomCode: string; readonly name: string }
  | { readonly type: 'resume'; readonly roomCode: string; readonly token: string }
  | { readonly type: 'toggle'; readonly position: number }
  | { readonly type: 'submit' }
  | { readonly type: 'nextRound' }
  | { readonly type: 'leave' };

export type ServerMessage =
  | { readonly type: 'joined'; readonly roomCode: string; readonly playerId: PlayerId; readonly token: string }
  | { readonly type: 'state'; readonly room: RoomView; readonly view: MatchView | null; readonly now: number }
  | { readonly type: 'error'; readonly code: ErrorCode; readonly message: string };

/** Trims a name and caps its length; blank or missing names become "Player". */
export function cleanName(value: unknown): string {
  const name = typeof value === 'string' ? value.trim().slice(0, NET_CONFIG.maxNameLength) : '';
  return name || 'Player';
}

/** Upper-cases what someone typed and keeps only the first 4 letters. */
export function normalizeRoomCode(value: string): string {
  return value.toUpperCase().replace(/[^A-Z]/g, '').slice(0, ROOM_CODE_LENGTH);
}

export function isRoomCode(value: string): boolean {
  return value.length === ROOM_CODE_LENGTH && [...value].every((letter) => ROOM_CODE_ALPHABET.includes(letter));
}

/** Validates one raw message from a browser. Returns null for anything malformed or unknown. */
export function parseClientMessage(raw: string): ClientMessage | null {
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    return null;
  }
  if (typeof data !== 'object' || data === null) return null;
  const message = data as Record<string, unknown>;
  switch (message.type) {
    case 'create':
      return isDifficulty(message.difficulty)
        ? { type: 'create', name: cleanName(message.name), difficulty: message.difficulty }
        : null;
    case 'join':
      return typeof message.roomCode === 'string'
        ? { type: 'join', roomCode: normalizeRoomCode(message.roomCode), name: cleanName(message.name) }
        : null;
    case 'resume':
      return typeof message.roomCode === 'string' && typeof message.token === 'string'
        ? { type: 'resume', roomCode: normalizeRoomCode(message.roomCode), token: message.token.slice(0, 64) }
        : null;
    case 'toggle':
      return typeof message.position === 'number' && Number.isInteger(message.position)
        ? { type: 'toggle', position: message.position }
        : null;
    case 'submit':
      return { type: 'submit' };
    case 'nextRound':
      return { type: 'nextRound' };
    case 'leave':
      return { type: 'leave' };
    default:
      return null;
  }
}
