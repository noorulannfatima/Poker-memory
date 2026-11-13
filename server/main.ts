import { startServer } from './wsServer';

const port = Number(process.env.PORT) || 8787;
const server = await startServer({ port, log: (message) => console.warn(message) });
console.log(`Memory Poker server listening on ws://localhost:${server.port}/ws`);
