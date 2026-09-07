import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import net from 'node:net';
import { SignalManager, STATUS } from '../src/signal.js';

function fakeChild() {
  const ee = new EventEmitter();
  ee.kill = () => ee.emit('exit', null, 'SIGTERM');
  return ee;
}

function waitForStatus(mgr, target, timeoutMs = 2000) {
  return new Promise((resolve, reject) => {
    if (mgr.status === target) { resolve(); return; }
    const timer = setTimeout(() => {
      mgr.removeListener('status', onStatus);
      reject(new Error(`did not reach ${target}, stuck at ${mgr.status}`));
    }, timeoutMs);
    function onStatus(evt) {
      if (evt.status === target) {
        clearTimeout(timer);
        mgr.removeListener('status', onStatus);
        resolve();
      }
    }
    mgr.on('status', onStatus);
  });
}

async function pickPort() {
  return new Promise((resolve) => {
    const s = net.createServer();
    s.listen(0, '127.0.0.1', () => {
      const port = s.address().port;
      s.close(() => resolve(port));
    });
  });
}

test('disabled manager sets status disabled and never spawns', async () => {
  let spawnCalls = 0;
  const mgr = new SignalManager({ enabled: false, spawnFn: () => { spawnCalls++; return fakeChild(); } });
  await mgr.start();
  assert.equal(mgr.status, STATUS.DISABLED);
  assert.equal(spawnCalls, 0);
});

test('spawn success + reachable port → status transitions to ready', async () => {
  const port = await pickPort();
  const server = net.createServer((s) => s.end());
  await new Promise((r) => server.listen(port, '127.0.0.1', r));

  const child = fakeChild();
  const mgr = new SignalManager({
    enabled: true,
    rpcHost: '127.0.0.1',
    rpcPort: port,
    spawnFn: () => child,
  });

  try {
    await mgr.start();
    await waitForStatus(mgr, STATUS.READY);
    assert.equal(mgr.status, STATUS.READY);
  } finally {
    mgr.stop();
    await new Promise((r) => server.close(r));
  }
});

test('spawn ENOENT → status not-installed', async () => {
  const mgr = new SignalManager({
    enabled: true,
    spawnFn: () => {
      const err = new Error('spawn ENOENT');
      err.code = 'ENOENT';
      throw err;
    },
  });
  try {
    await mgr.start();
    assert.equal(mgr.status, STATUS.NOT_INSTALLED);
  } finally {
    mgr.stop();
  }
});

test('emitted event carries status field', async () => {
  const port = await pickPort();
  const server = net.createServer((s) => s.end());
  await new Promise((r) => server.listen(port, '127.0.0.1', r));

  const events = [];
  const mgr = new SignalManager({
    enabled: true,
    rpcHost: '127.0.0.1',
    rpcPort: port,
    spawnFn: () => fakeChild(),
  });
  mgr.on('status', (evt) => events.push(evt));

  try {
    await mgr.start();
    await waitForStatus(mgr, STATUS.READY);
    assert.ok(events.some((e) => e.status === STATUS.STARTING));
    assert.ok(events.some((e) => e.status === STATUS.READY));
  } finally {
    mgr.stop();
    await new Promise((r) => server.close(r));
  }
});
