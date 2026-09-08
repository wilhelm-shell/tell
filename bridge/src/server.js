import Fastify from 'fastify';
import cors from '@fastify/cors';
import websocket from '@fastify/websocket';
import { checkBearer, safeEqualString } from './auth.js';
import { registerAttachments } from './attachments.js';

const WS_AUTH_TIMEOUT_MS = 5000;

export async function buildServer({
  token,
  allowedOrigins = [],
  signal = null,
  backlog = null,
  handlers = {},
  attachments = null,
  logger = true,
} = {}) {
  const app = Fastify({ logger });

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
    if (req.url === '/ws') return;
    if (!checkBearer(req.headers.authorization, token)) {
      reply.code(401).send({ error: 'unauthorized' });
    }
  });

  app.get('/hello', async () => ({ ok: true, service: 'tell-bridge' }));

  // Scaled images from signal-cli's attachment store (bearer auth via the
  // hook above). Optional so tests without a data dir need not care.
  if (attachments) registerAttachments(app, attachments);

  const authedSockets = new Set();

  // Push one JSON frame to every authenticated client. Exposed on the app
  // so index.js can wire event sources (signal-cli, later Telegram) without
  // the server knowing about them.
  function broadcast(frame) {
    const payload = JSON.stringify(frame);
    for (const s of authedSockets) {
      try { s.send(payload); } catch (_) {}
    }
  }
  app.decorate('broadcast', broadcast);

  if (signal) {
    signal.on('status', (evt) => broadcast({ type: 'signal.status', ...evt }));
  }

  // Client -> bridge requests: any authed frame with an `id` and a `type`
  // that has a handler. The reply carries the same id so the client can
  // match it; frames without an id are fire-and-forget and ignored.
  async function handleRequest(socket, msg) {
    if (!msg || typeof msg !== 'object' || msg.id == null) return;
    const handler = handlers[msg.type];
    let reply;
    if (!handler) {
      reply = { type: 'reply', id: msg.id, ok: false, error: 'unknown request: ' + msg.type };
    } else {
      try {
        reply = { type: 'reply', id: msg.id, ok: true, result: await handler(msg) };
      } catch (e) {
        reply = { type: 'reply', id: msg.id, ok: false, error: e.message || 'error' };
      }
    }
    try { socket.send(JSON.stringify(reply)); } catch (_) {}
  }

  app.get('/ws', { websocket: true }, (socket) => {
    let authed = false;

    const timer = setTimeout(() => {
      if (!authed) socket.close(4001, 'auth timeout');
    }, WS_AUTH_TIMEOUT_MS);

    socket.on('message', (raw) => {
      let msg;
      try { msg = JSON.parse(raw.toString()); }
      catch (_) {
        if (!authed) socket.close(4002, 'bad json');
        return;
      }

      if (authed) {
        handleRequest(socket, msg);
        return;
      }

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
      authedSockets.add(socket);
      socket.send(JSON.stringify({ type: 'hello', service: 'tell-bridge' }));
      if (signal) {
        socket.send(JSON.stringify({ type: 'signal.status', status: signal.status }));
      }
      // Replay recent messages as ONE frame so the client can tell history
      // from live traffic and apply it in a single pass. Sent after the
      // status frame; live frames follow in order, so no gap and no overlap.
      if (backlog && backlog.size > 0) {
        socket.send(JSON.stringify({ type: 'signal.backlog', messages: backlog.list() }));
      }
    });

    socket.on('close', () => {
      clearTimeout(timer);
      authedSockets.delete(socket);
    });
  });

  return app;
}
