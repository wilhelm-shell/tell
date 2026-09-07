import Fastify from 'fastify';
import cors from '@fastify/cors';
import websocket from '@fastify/websocket';
import { checkBearer, safeEqualString } from './auth.js';

const WS_AUTH_TIMEOUT_MS = 5000;

export async function buildServer({ token, allowedOrigins = [], logger = true } = {}) {
  const app = Fastify({ logger });

  // Register CORS before the auth hook: preflight OPTIONS carry no auth
  // header, so they must be answered by @fastify/cors and short-circuit
  // before onRequest rejects them as unauthorized.
  if (allowedOrigins.length > 0) {
    await app.register(cors, {
      origin: allowedOrigins,
      credentials: false,
      allowedHeaders: ['Authorization', 'Content-Type'],
      methods: ['GET', 'POST'],
    });
  }

  await app.register(websocket);

  app.addHook('onRequest', async (req, reply) => {
    if (req.method === 'OPTIONS') return;
    // Browser WebSocket can't set Authorization; /ws authenticates in-band
    // via the first frame after the socket opens.
    if (req.url === '/ws') return;
    if (!checkBearer(req.headers.authorization, token)) {
      reply.code(401).send({ error: 'unauthorized' });
    }
  });

  app.get('/hello', async () => ({ ok: true, service: 'tell-bridge' }));

  app.get('/ws', { websocket: true }, (socket) => {
    let authed = false;

    const timer = setTimeout(() => {
      if (!authed) socket.close(4001, 'auth timeout');
    }, WS_AUTH_TIMEOUT_MS);

    socket.on('message', (raw) => {
      if (authed) return; // post-auth messages are for a future slice
      let msg;
      try { msg = JSON.parse(raw.toString()); }
      catch (_) { socket.close(4002, 'bad json'); return; }

      if (!msg || msg.type !== 'auth' || typeof msg.token !== 'string') {
        socket.close(4003, 'auth expected');
        return;
      }
      if (!safeEqualString(msg.token, token)) {
        socket.close(4004, 'bad token');
        return;
      }
      authed = true;
      clearTimeout(timer);
      socket.send(JSON.stringify({ type: 'hello', service: 'tell-bridge' }));
    });

    socket.on('close', () => clearTimeout(timer));
  });

  return app;
}
