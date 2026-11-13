import { describe, expect, it } from 'vitest';
import { NET_CONFIG, cleanName, isRoomCode, normalizeRoomCode, parseClientMessage } from './protocol';

const parse = (value: unknown) => parseClientMessage(JSON.stringify(value));

describe('parseClientMessage', () => {
  it('accepts every message type', () => {
    expect(parse({ type: 'create', name: 'Ana', difficulty: 'easy' })).toEqual({
      type: 'create',
      name: 'Ana',
      difficulty: 'easy',
    });
    expect(parse({ type: 'join', roomCode: 'kqpz', name: 'Ben' })).toEqual({ type: 'join', roomCode: 'KQPZ', name: 'Ben' });
    expect(parse({ type: 'resume', roomCode: 'KQPZ', token: 't' })).toEqual({ type: 'resume', roomCode: 'KQPZ', token: 't' });
    expect(parse({ type: 'toggle', position: 3 })).toEqual({ type: 'toggle', position: 3 });
    expect(parse({ type: 'submit' })).toEqual({ type: 'submit' });
    expect(parse({ type: 'nextRound' })).toEqual({ type: 'nextRound' });
    expect(parse({ type: 'leave' })).toEqual({ type: 'leave' });
  });

  it('rejects malformed and unknown messages', () => {
    expect(parseClientMessage('not json')).toBeNull();
    expect(parse(null)).toBeNull();
    expect(parse('submit')).toBeNull();
    expect(parse({ type: 'dance' })).toBeNull();
    expect(parse({ type: 'create', name: 'Ana', difficulty: 'impossible' })).toBeNull();
    expect(parse({ type: 'join', name: 'Ben' })).toBeNull();
    expect(parse({ type: 'resume', roomCode: 'KQPZ' })).toBeNull();
    expect(parse({ type: 'toggle', position: 1.5 })).toBeNull();
    expect(parse({ type: 'toggle', position: '3' })).toBeNull();
  });

  it('cleans player names', () => {
    expect(parse({ type: 'create', name: '  Ana  ', difficulty: 'easy' })).toMatchObject({ name: 'Ana' });
    expect(cleanName('   ')).toBe('Player');
    expect(cleanName(42)).toBe('Player');
    expect(cleanName('x'.repeat(40))).toHaveLength(NET_CONFIG.maxNameLength);
  });
});

describe('room codes', () => {
  it('normalizes what people type', () => {
    expect(normalizeRoomCode(' k-q p z9x')).toBe('KQPZ');
  });

  it('recognizes valid codes only', () => {
    expect(isRoomCode('KQPZ')).toBe(true);
    expect(isRoomCode('KQP')).toBe(false);
    expect(isRoomCode('KQPO')).toBe(false); // O is not in the alphabet
  });
});
