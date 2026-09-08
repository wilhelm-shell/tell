import { test } from 'node:test';
import assert from 'node:assert/strict';
import WebSocket from 'ws';
import { buildServer } from '../src/server.js';

const TOKEN = 'test-token-1234567890';

async function bootServer() {
  const app = await buildServer({ token: TOKEN, logger: false });
  await app.listen({ port: 0, host: '127.0.0.1' });
  const addr = app.server.address();
  return { app, url: `ws://127.0.0.1:${addr.port}/ws` };
}

function firstMessage(ws, timeoutMs = 2000) {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error('no message')), timeoutMs);
    ws.once('message', (raw) => { clearTimeout(t); resolve(JSON.parse(raw.toString())); });
    ws.once('error', (e) => { clearTimeout(t); reject(e); });
  });
}

function closeCode(ws, timeoutMs = 2000) {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error('did not close')), timeoutMs);
    ws.once('close', (code) => { clearTimeout(t); resolve(code); });
  });
}

test('ws with correct token receives hello frame', async () => {
  const { app, url } = await bootServer();
  try {
    const ws = new WebSocket(url);
    await new Promise((r) => ws.once('open', r));
    ws.send(JSON.stringify({ type: 'auth', token: TOKEN }));
    const msg = await firstMessage(ws);
    assert.equal(msg.type, 'hello');
    assert.equal(msg.service, 'tell-bridge');
    ws.close();
  } finally {
    await app.close();
  }
});

test('ws with wrong token gets closed with 4004', async () => {
  const { app, url } = await bootServer();
  try {
    const ws = new WebSocket(url);
    await new Promise((r) => ws.once('open', r));
    ws.send(JSON.stringify({ type: 'auth', token: 'nope-nope-nope' }));
    const code = await closeCode(ws);
    assert.equal(code, 4004);
  } finally {
    await app.close();
  }
});

test('ws with bad json gets closed with 4002', async () => {
  const { app, url } = await bootServer();
  try {
    const ws = new WebSocket(url);
    await new Promise((r) => ws.once('open', r));
    ws.send('not json at all');
    const code = await closeCode(ws);
    assert.equal(code, 4002);
  } finally {
    await app.close();
  }
});

test('ws with wrong-shape frame gets closed with 4003', async () => {
  const { app, url } = await bootServer();
  try {
    const ws = new WebSocket(url);
    await new Promise((r) => ws.once('open', r));
    ws.send(JSON.stringify({ hello: 'world' }));
    const code = await closeCode(ws);
    assert.equal(code, 4003);
  } finally {
    await app.close();
  }
});

test('app.broadcast reaches authed clients only', async () => {
  const { app, url } = await bootServer();
  try {
    const authed = new WebSocket(url);
    await new Promise((r) => authed.once('open', r));
    authed.send(JSON.stringify({ type: 'auth', token: TOKEN }));
    await firstMessage(authed);

    const stranger = new WebSocket(url);
    await new Promise((r) => stranger.once('open', r));
    let strangerGot = 0;
    stranger.on('message', () => { strangerGot++; });

    const next = firstMessage(authed);
    app.broadcast({ type: 'signal.message', text: 'hi' });
    const msg = await next;
    assert.deepEqual(msg, { type: 'signal.message', text: 'hi' });
    await new Promise((r) => setTimeout(r, 30));
    assert.equal(strangerGot, 0);
    authed.close();
    stranger.close();
  } finally {
    await app.close();
  }
});
