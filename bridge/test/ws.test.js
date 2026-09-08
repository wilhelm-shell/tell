import { test } from 'node:test';
import assert from 'node:assert/strict';
import WebSocket from 'ws';
import { buildServer } from '../src/server.js';
import { createBacklog } from '../src/backlog.js';

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

// hello and backlog are sent back to back, so collect from the start
// instead of attaching a listener per frame.
function collect(ws, n, timeoutMs = 2000) {
  const got = [];
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(`only ${got.length}/${n} frames`)), timeoutMs);
    ws.on('message', (raw) => {
      got.push(JSON.parse(raw.toString()));
      if (got.length === n) { clearTimeout(t); resolve(got); }
    });
  });
}

test('authed client receives the backlog as one frame after hello', async () => {
  const backlog = createBacklog(10);
  backlog.push({ type: 'signal.message', text: 'first' });
  backlog.push({ type: 'signal.message', text: 'second' });
  const app = await buildServer({ token: TOKEN, backlog, logger: false });
  await app.listen({ port: 0, host: '127.0.0.1' });
  const url = `ws://127.0.0.1:${app.server.address().port}/ws`;
  try {
    const ws = new WebSocket(url);
    await new Promise((r) => ws.once('open', r));
    const frames = collect(ws, 2);
    ws.send(JSON.stringify({ type: 'auth', token: TOKEN }));
    const [hello, frame] = await frames;
    assert.equal(hello.type, 'hello');
    assert.equal(frame.type, 'signal.backlog');
    assert.deepEqual(frame.messages.map((m) => m.text), ['first', 'second']);
    ws.close();
  } finally {
    await app.close();
  }
});

test('empty backlog sends no backlog frame', async () => {
  const app = await buildServer({ token: TOKEN, backlog: createBacklog(10), logger: false });
  await app.listen({ port: 0, host: '127.0.0.1' });
  const url = `ws://127.0.0.1:${app.server.address().port}/ws`;
  try {
    const ws = new WebSocket(url);
    await new Promise((r) => ws.once('open', r));
    const frames = collect(ws, 2, 300);
    ws.send(JSON.stringify({ type: 'auth', token: TOKEN }));
    await assert.rejects(frames, /only 1\/2 frames/);
    ws.close();
  } finally {
    await app.close();
  }
});

test('authed request gets a reply with the same id; failures and unknown types report ok:false', async () => {
  const handlers = {
    echo: async (msg) => ({ got: msg.text }),
    boom: async () => { throw new Error('kaput'); },
  };
  const app = await buildServer({ token: TOKEN, handlers, logger: false });
  await app.listen({ port: 0, host: '127.0.0.1' });
  const url = `ws://127.0.0.1:${app.server.address().port}/ws`;
  try {
    const ws = new WebSocket(url);
    await new Promise((r) => ws.once('open', r));
    const frames = collect(ws, 4);
    ws.send(JSON.stringify({ type: 'auth', token: TOKEN }));
    ws.send(JSON.stringify({ type: 'echo', id: 'a', text: 'hi' }));
    ws.send(JSON.stringify({ type: 'boom', id: 'b' }));
    ws.send(JSON.stringify({ type: 'nope', id: 'c' }));
    ws.send(JSON.stringify({ type: 'echo', text: 'no id, no reply' }));
    const got = await frames;
    assert.equal(got[0].type, 'hello');
    // Reply order is not guaranteed: the unknown-type reply needs no await.
    const byId = {};
    for (const f of got.slice(1)) byId[f.id] = f;
    const [a, b, c] = [byId.a, byId.b, byId.c];
    assert.deepEqual(a, { type: 'reply', id: 'a', ok: true, result: { got: 'hi' } });
    assert.deepEqual(b, { type: 'reply', id: 'b', ok: false, error: 'kaput' });
    assert.deepEqual(c, { type: 'reply', id: 'c', ok: false, error: 'unknown request: nope' });
    ws.close();
  } finally {
    await app.close();
  }
});

test('authed client receives the read marks before the backlog', async () => {
  const readMarks = { all: () => ({ 'p:+1': 42 }) };
  const backlog = createBacklog(10);
  backlog.push({ type: 'signal.message', text: 'x' });
  const app = await buildServer({ token: TOKEN, readMarks, backlog, logger: false });
  await app.listen({ port: 0, host: '127.0.0.1' });
  const url = `ws://127.0.0.1:${app.server.address().port}/ws`;
  try {
    const ws = new WebSocket(url);
    await new Promise((r) => ws.once('open', r));
    const frames = collect(ws, 3);
    ws.send(JSON.stringify({ type: 'auth', token: TOKEN }));
    const [hello, marks, bl] = await frames;
    assert.equal(hello.type, 'hello');
    assert.deepEqual(marks, { type: 'signal.readmarks', marks: { 'p:+1': 42 } });
    assert.equal(bl.type, 'signal.backlog');
    ws.close();
  } finally {
    await app.close();
  }
});
