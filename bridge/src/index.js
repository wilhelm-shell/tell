import { config } from './config.js';
import { buildServer } from './server.js';
import { SignalManager, STATUS } from './signal.js';
import { SignalRpcClient } from './signalRpc.js';
import { createBacklog } from './backlog.js';
import { fileStore } from './backlogFile.js';
import { createReadMarks, conversationKey } from './readMarks.js';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { buildSendParams, sentMessageFrame, buildReactionParams, reactionFrame } from './signalSend.js';
import { mapDirectory } from './signalContacts.js';

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

// Both persisted next to each other in the data volume when BRIDGE_PERSIST
// is on. fileStore's load() returns [] for a missing file; readMarks
// treats anything that is not an object as empty.
const backlogStore = config.persist ? fileStore(join(config.dataDir, 'backlog.json')) : null;
const backlog = createBacklog(config.backlogCap, backlogStore, {
  // `app` is assigned below; saves only happen after listen(), so it exists.
  onError: (e) => app.log.warn({ err: e.message }, 'backlog save failed'),
});
const readMarksStore = config.persist ? fileStore(join(config.dataDir, 'readmarks.json')) : null;
const readMarks = createReadMarks(readMarksStore, {
  onError: (e) => app.log.warn({ err: e.message }, 'readmarks save failed'),
});

// The daemon runs in multi-account mode, so every request needs the
// account. Discovered from the daemon itself on each connect rather than
// configured: one less thing in .env, and it cannot drift from reality.
let account = null;

// A mark moved: tell every client. Sources: the phone reading (below),
// our own sends (any device), Signal's read sync from the primary phone.
function markRead(key, timestamp) {
  if (readMarks.mark(key, timestamp)) {
    app.broadcast({ type: 'signal.read', key, timestamp });
  }
}

const handlers = {
  'signal.send': async (req) => {
    const params = buildSendParams(req, account);
    const result = await rpc.call('send', params);
    const frame = sentMessageFrame(req, account, result);
    backlog.push(frame);
    app.broadcast(frame);
    markRead(conversationKey(frame), frame.timestamp);
    return { timestamp: frame.timestamp };
  },
  'signal.react': async (req) => {
    const params = buildReactionParams(req, account);
    await rpc.call('sendReaction', params);
    // signal-cli does not echo our own reaction back on this socket, so
    // synthesise the frame every client (and the backlog) should see.
    const frame = reactionFrame(req, account);
    backlog.push(frame);
    app.broadcast(frame);
    return { ok: true };
  },
  // The phone opened a conversation: everything up to `timestamp` is read.
  'signal.markRead': async (req) => {
    if (typeof req.key !== 'string' || typeof req.timestamp !== 'number') throw new Error('key and timestamp required');
    markRead(req.key, req.timestamp);
    return { timestamp: readMarks.get(req.key) };
  },
  // Recipient directory for the "new message" picker. Fetched on demand,
  // not cached: ~100 entries, and the address book changes rarely.
  'signal.contacts': async () => {
    if (!account) throw new Error('no signal account linked');
    const [contacts, groups] = await Promise.all([
      rpc.call('listContacts', { account }),
      rpc.call('listGroups', { account }),
    ]);
    return { entries: mapDirectory(contacts, groups) };
  },
};

// signal-cli downloads attachments under its data dir; bare bridges use
// its default location. Scaled copies go next to the backlog.
const signalDataDir = config.signal.dataDir || join(homedir(), '.local', 'share', 'signal-cli');

const app = await buildServer({
  token: config.token,
  allowedOrigins: config.allowedOrigins,
  signal,
  backlog,
  readMarks,
  handlers,
  attachments: { dir: join(signalDataDir, 'attachments'), cacheDir: join(config.dataDir, 'thumbs') },
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
rpc.on('reaction', (r) => {
  app.log.info({ direction: r.direction, target: r.target.timestamp, remove: r.remove }, 'signal reaction');
  const frame = { type: 'signal.reaction', ...r };
  // Buffered too, so a reopen shows reactions on replayed messages.
  backlog.push(frame);
  app.broadcast(frame);
});
rpc.on('read', (reads) => {
  // Read on the primary phone: resolve each message to its conversation
  // through the backlog and move that mark.
  const changed = readMarks.applyReadSync(reads, backlog.list());
  app.log.info({ reads: reads.length, changed: changed.length }, 'signal read sync');
  for (const c of changed) app.broadcast({ type: 'signal.read', key: c.key, timestamp: c.timestamp });
});
rpc.on('message', (m) => {
  // Deliberately no sender and no text: plaintext and contacts stay out
  // of the log stream.
  app.log.info({ direction: m.direction, timestamp: m.timestamp, group: !!m.group }, 'signal message');
  const frame = { type: 'signal.message', ...m };
  backlog.push(frame);
  app.broadcast(frame);
  // Something we sent from another device: we had read everything before it.
  if (m.direction === 'out') markRead(conversationKey(frame), frame.timestamp);
});

try {
  app.log.info({ persist: !!backlogStore, cap: backlog.cap, loaded: backlog.loaded, readMarks: Object.keys(readMarks.all()).length }, 'backlog');
  await app.listen({ port: config.port, host: config.host });
  await signal.start();
} catch (err) {
  app.log.error(err);
  process.exit(1);
}
