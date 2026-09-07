import { config } from './config.js';
import { buildServer } from './server.js';

const app = await buildServer({
  token: config.token,
  allowedOrigins: config.allowedOrigins,
});

try {
  await app.listen({ port: config.port, host: config.host });
} catch (err) {
  app.log.error(err);
  process.exit(1);
}
