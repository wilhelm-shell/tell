import Fastify from 'fastify';
import cors from '@fastify/cors';
import { checkBearer } from './auth.js';

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

  app.addHook('onRequest', async (req, reply) => {
    if (req.method === 'OPTIONS') return;
    if (!checkBearer(req.headers.authorization, token)) {
      reply.code(401).send({ error: 'unauthorized' });
    }
  });

  app.get('/hello', async () => ({ ok: true, service: 'tell-bridge' }));

  return app;
}
