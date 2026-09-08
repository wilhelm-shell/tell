import { test } from 'node:test';
import assert from 'node:assert/strict';
import net from 'node:net';
import { SignalRpcClient, envelopeToMessage, envelopeToReaction } from '../src/signalRpc.js';

// Shapes taken from the signal-cli 0.14.7 man page (signal-cli-jsonrpc.5)
// and its published JSON schemas.
const direct = {
  envelope: {
    source: '+33123456789', sourceNumber: '+33123456789', sourceUuid: 'uuid',
    sourceName: 'name', sourceDevice: 1, timestamp: 1631458508784,
    dataMessage: {
      timestamp: 1631458508784, message: 'foobar', expiresInSeconds: 0,
      viewOnce: false, mentions: [], attachments: [], contacts: [],
    },
  },
  account: '+41000000000',
};

test('envelopeToMessage: direct data message', () => {
  assert.deepEqual(envelopeToMessage(direct), {
    account: '+41000000000',
    direction: 'in',
    source: '+33123456789',
    sourceName: 'name',
    peer: '+33123456789',
    timestamp: 1631458508784,
    text: 'foobar',
    attachments: [],
    group: null,
  });
});

test('envelopeToMessage: group message carries group id and name', () => {
  const params = JSON.parse(JSON.stringify(direct));
  params.envelope.dataMessage.groupInfo = { groupId: 'abc=', groupName: 'Family', revision: 3, type: 'DELIVER' };
  const m = envelopeToMessage(params);
  assert.deepEqual(m.group, { id: 'abc=', name: 'Family' });
  assert.equal(m.peer, '+33123456789');
});

test('envelopeToMessage: sync sentMessage is an outgoing message to the destination', () => {
  const params = {
    envelope: {
      source: '+41000000000', sourceNumber: '+41000000000', sourceDevice: 2, timestamp: 1693064367769,
      syncMessage: {
        sentMessage: {
          destination: '+33123456789', destinationNumber: '+33123456789', destinationUuid: 'uuid',
          timestamp: 1693064367769, message: 'j', expiresInSeconds: 0, viewOnce: false,
        },
      },
    },
    account: '+41000000000',
  };
  const m = envelopeToMessage(params);
  assert.equal(m.direction, 'out');
  assert.equal(m.peer, '+33123456789');
  assert.equal(m.text, 'j');
});

test('envelopeToMessage: subscribeReceive wrapper shape is accepted', () => {
  const m = envelopeToMessage({ subscription: 0, result: direct });
  assert.equal(m.text, 'foobar');
});

test('envelopeToMessage: attachment-only message has null text and a count', () => {
  const params = JSON.parse(JSON.stringify(direct));
  params.envelope.dataMessage.message = '';
  params.envelope.dataMessage.attachments = [{ contentType: 'image/jpeg', id: 'abc.jpg', size: 5, width: 800, height: 600 }, { contentType: 'x' }];
  const m = envelopeToMessage(params);
  assert.equal(m.text, null);
  assert.deepEqual(m.attachments, [{ id: 'abc.jpg', contentType: 'image/jpeg', filename: null, size: 5, width: 800, height: 600 }]);
});

test('envelopeToMessage: receipts, typing, reactions and garbage are ignored', () => {
  const base = { source: '+33123456789', sourceNumber: '+33123456789', timestamp: 1 };
  assert.equal(envelopeToMessage({ envelope: { ...base, receiptMessage: { when: 1, isDelivery: true, timestamps: [1] } } }), null);
  assert.equal(envelopeToMessage({ envelope: { ...base, typingMessage: { action: 'STARTED', timestamp: 1 } } }), null);
  assert.equal(envelopeToMessage({ envelope: { ...base, dataMessage: { timestamp: 1, reaction: { emoji: 'x' }, attachments: [] } } }), null);
  assert.equal(envelopeToMessage({ envelope: { ...base } }), null);
  assert.equal(envelopeToMessage(null), null);
  assert.equal(envelopeToMessage('nope'), null);
  assert.equal(envelopeToMessage({}), null);
});

// --- socket client --------------------------------------------------------

function notification(params) {
  return JSON.stringify({ jsonrpc: '2.0', method: 'receive', params }) + '\n';
}

async function fakeDaemon() {
  const conns = [];
  const server = net.createServer((s) => conns.push(s));
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const waitConn = (n) => new Promise((resolve) => {
    const tick = () => (conns.length >= n ? resolve(conns[n - 1]) : setTimeout(tick, 5));
    tick();
  });
  return {
    server, conns, waitConn,
    port: server.address().port,
    close: () => new Promise((r) => { for (const c of conns) c.destroy(); server.close(r); }),
  };
}

function once(ee, evt, timeoutMs = 2000) {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(`no ${evt}`)), timeoutMs);
    ee.once(evt, (v) => { clearTimeout(t); resolve(v); });
  });
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

test('client: lines split across chunks are reassembled, non-receive frames ignored', async () => {
  const d = await fakeDaemon();
  const client = new SignalRpcClient({ host: '127.0.0.1', port: d.port });
  try {
    const got = [];
    client.on('message', (m) => got.push(m));
    client.start();
    await once(client, 'connected');
    const conn = await d.waitConn(1);

    const line = notification(direct);
    const cut = Math.floor(line.length / 2);
    conn.write(JSON.stringify({ jsonrpc: '2.0', id: 'x', result: [] }) + '\n');
    conn.write('this is not json\n');
    conn.write(line.slice(0, cut));
    await sleep(20);
    assert.equal(got.length, 0, 'half a line must not produce a message');
    conn.write(line.slice(cut) + notification(direct));
    await sleep(50);
    assert.equal(got.length, 2);
    assert.equal(got[0].text, 'foobar');
  } finally {
    client.stop();
    await d.close();
  }
});

test('client: reconnects after the daemon drops the socket, not after stop()', async () => {
  const d = await fakeDaemon();
  const timers = [];
  const client = new SignalRpcClient({
    host: '127.0.0.1', port: d.port,
    setTimeoutFn: (fn, ms) => { timers.push(ms); fn(); },
  });
  try {
    client.start();
    await once(client, 'connected');
    const first = await d.waitConn(1);
    const reconnected = once(client, 'connected');
    first.destroy();
    await reconnected;
    assert.equal(d.conns.length, 2);
    assert.deepEqual(timers, [2000]);

    client.stop();
    await sleep(30);
    assert.equal(d.conns.length, 2, 'stop() must not reconnect');
    assert.equal(timers.length, 1);
  } finally {
    client.stop();
    await d.close();
  }
});

// --- requests -------------------------------------------------------------

function respondTo(conn, fn) {
  let buf = '';
  conn.setEncoding('utf8');
  conn.on('data', (d) => {
    buf += d;
    let i;
    while ((i = buf.indexOf('\n')) !== -1) {
      const req = JSON.parse(buf.slice(0, i));
      buf = buf.slice(i + 1);
      const res = fn(req);
      if (res) conn.write(JSON.stringify(res) + '\n');
    }
  });
}

test('call(): result and error responses are matched by id', async () => {
  const d = await fakeDaemon();
  const client = new SignalRpcClient({ host: '127.0.0.1', port: d.port });
  try {
    client.start();
    await once(client, 'connected');
    const conn = await d.waitConn(1);
    respondTo(conn, (req) => {
      assert.equal(req.jsonrpc, '2.0');
      if (req.method === 'listAccounts') return { jsonrpc: '2.0', result: [{ number: '+1' }], id: req.id };
      if (req.method === 'send') return { jsonrpc: '2.0', error: { code: -1, message: 'Unregistered user' }, id: req.id };
      return null;
    });
    const accounts = await client.call('listAccounts');
    assert.deepEqual(accounts, [{ number: '+1' }]);
    await assert.rejects(client.call('send', { message: 'x' }), /Unregistered user/);
  } finally {
    client.stop();
    await d.close();
  }
});

test('call(): times out, rejects when not connected, rejects pending on disconnect', async () => {
  const d = await fakeDaemon();
  const client = new SignalRpcClient({ host: '127.0.0.1', port: d.port, requestTimeoutMs: 50 });
  try {
    await assert.rejects(client.call('listAccounts'), /not connected/);
    client.start();
    await once(client, 'connected');
    const conn = await d.waitConn(1);
    await assert.rejects(client.call('listAccounts'), /timeout/);
    const hanging = client.call('send', {});
    conn.destroy();
    await assert.rejects(hanging, /disconnected/);
  } finally {
    client.stop();
    await d.close();
  }
});

// --- reactions --------------------------------------------------------------

test('envelopeToReaction: incoming reaction on our message', () => {
  const params = {
    envelope: {
      source: '+33123456789', sourceNumber: '+33123456789', sourceName: 'name', timestamp: 2000,
      dataMessage: {
        timestamp: 2000, message: null, attachments: [],
        reaction: { emoji: '👍', isRemove: false, targetAuthor: '+41000000000', targetAuthorNumber: '+41000000000', targetSentTimestamp: 1000 },
      },
    },
    account: '+41000000000',
  };
  assert.equal(envelopeToMessage(params), null, 'a reaction is not a message');
  assert.deepEqual(envelopeToReaction(params), {
    account: '+41000000000', direction: 'in', source: '+33123456789', sourceName: 'name',
    peer: '+33123456789', group: null, emoji: '👍', remove: false,
    target: { author: '+41000000000', timestamp: 1000 },
  });
});

test('envelopeToReaction: our own reaction synced from another device, in a group, removal', () => {
  const params = {
    envelope: {
      source: '+41000000000', sourceNumber: '+41000000000', timestamp: 3000,
      syncMessage: { sentMessage: {
        destination: null, timestamp: 3000, message: null,
        groupInfo: { groupId: 'g1=', groupName: 'Family' },
        reaction: { emoji: '❤️', isRemove: true, targetAuthorNumber: '+33123456789', targetSentTimestamp: 1500 },
      } },
    },
    account: '+41000000000',
  };
  const r = envelopeToReaction(params);
  assert.equal(r.direction, 'out');
  assert.equal(r.peer, null);
  assert.deepEqual(r.group, { id: 'g1=', name: 'Family' });
  assert.equal(r.remove, true);
  assert.deepEqual(r.target, { author: '+33123456789', timestamp: 1500 });
});

test('envelopeToReaction: plain messages and junk yield null', () => {
  assert.equal(envelopeToReaction(direct), null);
  assert.equal(envelopeToReaction({ envelope: { dataMessage: { reaction: { emoji: 'x' } } } }), null, 'no target timestamp');
  assert.equal(envelopeToReaction(null), null);
});

test('client: reaction notifications are emitted as reaction events', async () => {
  const d = await fakeDaemon();
  const client = new SignalRpcClient({ host: '127.0.0.1', port: d.port });
  try {
    const got = [];
    client.on('reaction', (r) => got.push(r));
    client.start();
    await once(client, 'connected');
    const conn = await d.waitConn(1);
    conn.write(notification({
      envelope: { sourceNumber: '+1', timestamp: 5, dataMessage: { timestamp: 5, attachments: [], reaction: { emoji: '👍', isRemove: false, targetAuthorNumber: '+2', targetSentTimestamp: 4 } } },
    }));
    await sleep(50);
    assert.equal(got.length, 1);
    assert.equal(got[0].emoji, '👍');
  } finally {
    client.stop();
    await d.close();
  }
});
