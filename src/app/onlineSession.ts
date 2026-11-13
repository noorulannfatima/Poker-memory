const KEY = 'memory-poker:online';

export interface SavedSession {
  readonly roomCode: string;
  readonly token: string;
}

/** The online room this tab is in, so a reload can resume it. Storage may be unavailable. */
export function loadSession(): SavedSession | null {
  try {
    const raw = sessionStorage.getItem(KEY);
    if (!raw) return null;
    const value: unknown = JSON.parse(raw);
    if (typeof value !== 'object' || value === null) return null;
    const { roomCode, token } = value as Record<string, unknown>;
    return typeof roomCode === 'string' && typeof token === 'string' ? { roomCode, token } : null;
  } catch {
    return null;
  }
}

export function saveSession(session: SavedSession): void {
  try {
    sessionStorage.setItem(KEY, JSON.stringify(session));
  } catch {
    // A reload just won't resume the room.
  }
}

export function clearSession(): void {
  try {
    sessionStorage.removeItem(KEY);
  } catch {
    // Nothing to clear.
  }
}
