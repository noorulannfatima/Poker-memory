// @vitest-environment node
import { afterEach, describe, expect, it } from 'vitest';
import { WebSocket } from 'ws';
import { NET_CONFIG, type ServerMessage } from '../src/net/protocol';
import { startServer, type RunningServer } from './wsServer';

let server: RunningServer | null = null;

afterEach(async () => {
  await server?.close();
  server = null;
});

function connect(port: number) {
  const socket = new WebSocket(`ws://localhost:${port}/ws`);
  const messages: ServerMessage[] = [];
  socket.on('message', (data) => messages.push(JSON.parse(data.toString()) as ServerMessage));
  const opened = new Promise<void>((resolve, reject) => {
    socket.once('open', () => resolve());
    socket.once('error', reject);
  });
  const closed = new Promise<number>((resolve) => socket.once('close', (code) => resolve(code)));
  /** Resolves with the first message (already received or still to come) that matches. */
  const waitFor = (matches: (message: ServerMessage) => boolean) =>
    new Promise<ServerMessage>((resolve) => {
      const found = messages.find(matches);
      if (found) return resolve(found);
      const onMessage = () => {
        const hit = messages.find(matches);
        if (!hit) return;
        socket.off('message', onMessage);
        resolve(hit);
      };
      socket.on('message', onMessage);
    });
  const send = (message: unknown) => socket.send(JSON.stringify(message));
  return { socket, opened, closed, waitFor, send };
}

describe('startServer', () => {
  it('lets two browsers create and join a room over WebSocket', async () => {
    server = await startServer({ port: 0 });
    const ana = connect(server.port);
    await ana.opened;
    ana.send({ type: 'create', name: 'Ana', difficulty: 'easy' });
    const joined = await ana.waitFor((m) => m.type === 'joined');
    if (joined.type !== 'joined') throw new Error('expected joined');

    const ben = connect(server.port);
    await ben.opened;
    ben.send({ type: 'join', roomCode: joined.roomCode, name: 'Ben' });
    const state = await ben.waitFor((m) => m.type === 'state' && m.view?.phase === 'memorizing');
    if (state.type !== 'state') throw new Error('expected state');
    expect(state.view?.grid).toHaveLength(9);
    await ana.waitFor((m) => m.type === 'state' && m.view !== null);

    ana.socket.close();
    ben.socket.close();
  });

  it('cuts off a client that sends an oversized message', async () => {
    server = await startServer({ port: 0 });
    const client = connect(server.port);
    await client.opened;
    client.socket.send('x'.repeat(NET_CONFIG.maxMessageBytes + 1));
    await expect(client.closed).resolves.toEqual(expect.any(Number));
  });
});
