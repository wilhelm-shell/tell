import { config } from './config.js';
import { buildServer } from './server.js';
import { SignalManager } from './signal.js';

const signal = new SignalManager({
  enabled: config.signal.enabled,
  bin: config.signal.bin,
  rpcHost: config.signal.rpcHost,
  rpcPort: config.signal.rpcPort,
  dataDir: config.signal.dataDir,
});

const app = await buildServer({
  token: config.token,
  allowedOrigins: config.allowedOrigins,
  signal,
});

signal.on('status', (evt) => {
  app.log.info({ signal: evt }, 'signal status');
});

try {
  await app.listen({ port: config.port, host: config.host });
  await signal.start();
} catch (err) {
  app.log.error(err);
  process.exit(1);
}
