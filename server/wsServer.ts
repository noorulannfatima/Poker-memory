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
}

/** Serves online Memory Poker over WebSocket at `/ws`. */
export function startServer({ port, random, log }: StartServerOptions): Promise<RunningServer> {
  const rooms = new RoomServer({ random, log });
  const wss = new WebSocketServer({ port, path: '/ws', maxPayload: NET_CONFIG.maxMessageBytes });

  wss.on('connection', (socket) => {
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
      rooms.handle(conn, data.toString());
    });
    socket.on('close', () => rooms.disconnect(conn));
    // ws reports oversized frames as errors; drop the socket.
    socket.on('error', () => socket.terminate());
  });

  return new Promise((resolve, reject) => {
    wss.once('error', reject);
    wss.once('listening', () => {
      const { port: actualPort } = wss.address() as AddressInfo;
      resolve({
        port: actualPort,
        close: () =>
          new Promise<void>((done) => {
            rooms.shutdown();
            for (const client of wss.clients) client.terminate();
            wss.close(() => done());
          }),
      });
    });
  });
}
