import Fastify from 'fastify';
import { checkBearer } from './auth.js';

export function buildServer({ token, logger = true } = {}) {
  const app = Fastify({ logger });

  app.addHook('onRequest', async (req, reply) => {
    if (!checkBearer(req.headers.authorization, token)) {
      reply.code(401).send({ error: 'unauthorized' });
    }
  });

  app.get('/hello', async () => ({ ok: true, service: 'tell-bridge' }));

  return app;
}
