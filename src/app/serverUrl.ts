/**
 * Where the online game server is. Set VITE_SERVER_URL (for example
 * wss://poker.example.com/ws) when the server is hosted separately.
 * Otherwise the page's own host is used, and the Vite dev server proxies
 * `/ws` to `npm run server`.
 */
export function serverUrl(): string {
  const configured: unknown = import.meta.env.VITE_SERVER_URL;
  if (typeof configured === 'string' && configured !== '') return configured;
  const scheme = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${scheme}//${window.location.host}/ws`;
}
