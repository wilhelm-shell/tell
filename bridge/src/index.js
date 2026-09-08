import { config } from './config.js';
import { buildServer } from './server.js';
import { SignalManager, STATUS } from './signal.js';
import { SignalRpcClient } from './signalRpc.js';
import { createBacklog } from './backlog.js';
import { buildSendParams, sentMessageFrame } from './signalSend.js';

const signal = new SignalManager({
  enabled: config.signal.enabled,
  bin: config.signal.bin,
  rpcHost: config.signal.rpcHost,
  rpcPort: config.signal.rpcPort,
  dataDir: config.signal.dataDir,
});

const rpc = new SignalRpcClient({
  host: config.signal.rpcHost,
  port: config.signal.rpcPort,
});

const backlog = createBacklog(config.backlogCap);

// The daemon runs in multi-account mode, so every request needs the
// account. Discovered from the daemon itself on each connect rather than
// configured: one less thing in .env, and it cannot drift from reality.
let account = null;

const handlers = {
  'signal.send': async (req) => {
    const params = buildSendParams(req, account);
    const result = await rpc.call('send', params);
    const frame = sentMessageFrame(req, account, result);
    backlog.push(frame);
    app.broadcast(frame);
    return { timestamp: frame.timestamp };
  },
};

const app = await buildServer({
  token: config.token,
  allowedOrigins: config.allowedOrigins,
  signal,
  backlog,
  handlers,
});

// The RPC socket only makes sense while the daemon is up, so it follows
// the process manager's status instead of running its own retry loop
// against a port nobody is listening on.
signal.on('status', (evt) => {
  app.log.info({ signal: evt }, 'signal status');
  if (evt.status === STATUS.READY) rpc.start();
  else rpc.stop();
});

rpc.on('connected', async () => {
  app.log.info('signal rpc connected');
  try {
    const accounts = await rpc.call('listAccounts');
    account = Array.isArray(accounts) && accounts.length === 1 ? accounts[0].number : null;
    app.log.info({ accounts: Array.isArray(accounts) ? accounts.length : 0, usable: !!account }, 'signal accounts');
  } catch (e) {
    account = null;
    app.log.warn({ err: e.message }, 'listAccounts failed');
  }
});
rpc.on('disconnected', (evt) => {
  account = null;
  app.log.info(evt, 'signal rpc disconnected');
});
rpc.on('message', (m) => {
  // Deliberately no sender and no text: plaintext and contacts stay out
  // of the log stream.
  app.log.info({ direction: m.direction, timestamp: m.timestamp, group: !!m.group }, 'signal message');
  const frame = { type: 'signal.message', ...m };
  backlog.push(frame);
  app.broadcast(frame);
});

try {
  await app.listen({ port: config.port, host: config.host });
  await signal.start();
} catch (err) {
  app.log.error(err);
  process.exit(1);
}
