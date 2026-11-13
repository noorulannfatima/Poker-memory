import type { AddressInfo } from 'node:net';
import { WebSocket, WebSocketServer } from 'ws';
import type { RandomFn } from '../src/game/gameTypes';
import { NET_CONFIG } from '../src/net/protocol';
import { RoomServer, type Connection } from './rooms';

export interface RunningServer {
  readonly port: number;
  close(): Promise<void>;
}

export interface StartServerOptions {
  /** 0 picks a free port (tests). */
  readonly port: number;
  readonly random?: RandomFn;
  readonly log?: (message: string) => void;
  /** How often dead connections are detected, in ms. Defaults to 25 s. */
  readonly heartbeatMs?: number;
}

/** Serves online Memory Poker over WebSocket at `/ws`. */
export function startServer({ port, random, log, heartbeatMs = 25_000 }: StartServerOptions): Promise<RunningServer> {
  const rooms = new RoomServer({ random, log });
  const wss = new WebSocketServer({ port, path: '/ws', maxPayload: NET_CONFIG.maxMessageBytes });

  const alive = new WeakMap<WebSocket, boolean>();

  wss.on('connection', (socket) => {
    alive.set(socket, true);
    socket.on('pong', () => alive.set(socket, true));
    const conn: Connection = {
      send: (message) => {
        if (socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify(message));
      },
      close: () => socket.terminate(),
    };
    socket.on('message', (data, isBinary) => {
      if (isBinary) {
        conn.close();
        return;
      }
      if (socket.readyState !== WebSocket.OPEN) return;
      try {
        rooms.handle(conn, data.toString());
      } catch (error) {
        log?.(`Dropping a connection after an error: ${error instanceof Error ? error.message : String(error)}`);
        socket.terminate();
      }
    });
    socket.on('close', () => rooms.disconnect(conn));
    // ws reports oversized frames as errors; drop the socket.
    socket.on('error', () => socket.terminate());
  });

  const heartbeat = setInterval(() => {
    for (const client of wss.clients) {
      if (!alive.get(client)) {
        client.terminate();
        continue;
      }
      alive.set(client, false);
      client.ping();
    }
  }, heartbeatMs);

  return new Promise((resolve, reject) => {
    wss.once('error', (error) => {
      clearInterval(heartbeat);
      reject(error);
    });
    wss.once('listening', () => {
      wss.removeAllListeners('error');
      wss.on('error', (error) => log?.(`Server error: ${error.message}`));
      const { port: actualPort } = wss.address() as AddressInfo;
      resolve({
        port: actualPort,
        close: () =>
          new Promise<void>((done) => {
            clearInterval(heartbeat);
            rooms.shutdown();
            for (const client of wss.clients) client.terminate();
            wss.close(() => done());
          }),
      });
    });
  });
}
