export interface SocketHandlers {
  onOpen(): void;
  onMessage(data: string): void;
  onClose(): void;
}

/** The small part of a WebSocket the online hook uses, so tests can fake it. */
export interface SocketLike {
  send(data: string): void;
  close(): void;
}

export type SocketFactory = (url: string, handlers: SocketHandlers) => SocketLike;

/** A real browser WebSocket behind `SocketLike`. An error is always followed by close. */
export const browserSocket: SocketFactory = (url, handlers) => {
  const ws = new WebSocket(url);
  ws.addEventListener('open', () => handlers.onOpen());
  ws.addEventListener('message', (event: MessageEvent) => {
    if (typeof event.data === 'string') handlers.onMessage(event.data);
  });
  ws.addEventListener('close', () => handlers.onClose());
  return {
    send: (data) => {
      if (ws.readyState === WebSocket.OPEN) ws.send(data);
    },
    close: () => ws.close(),
  };
};
