import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildServer } from '../src/server.js';

const TOKEN = 'test-token-1234567890';
const DEV_ORIGIN = 'http://localhost:8080';

test('GET /hello with valid token returns ok', async () => {
  const app = await buildServer({ token: TOKEN, logger: false });
  const res = await app.inject({
    method: 'GET',
    url: '/hello',
    headers: { authorization: `Bearer ${TOKEN}` },
  });
  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.json(), { ok: true, service: 'tell-bridge' });
  await app.close();
});

test('GET /hello without authorization returns 401', async () => {
  const app = await buildServer({ token: TOKEN, logger: false });
  const res = await app.inject({ method: 'GET', url: '/hello' });
  assert.equal(res.statusCode, 401);
  await app.close();
});

test('GET /hello with wrong token returns 401', async () => {
  const app = await buildServer({ token: TOKEN, logger: false });
  const res = await app.inject({
    method: 'GET',
    url: '/hello',
    headers: { authorization: 'Bearer nope' },
  });
  assert.equal(res.statusCode, 401);
  await app.close();
});

test('unknown route with valid token returns 404 (auth still applied)', async () => {
  const app = await buildServer({ token: TOKEN, logger: false });
  const res = await app.inject({
    method: 'GET',
    url: '/does-not-exist',
    headers: { authorization: `Bearer ${TOKEN}` },
  });
  assert.equal(res.statusCode, 404);
  await app.close();
});

test('CORS preflight from allowed origin succeeds without auth', async () => {
  const app = await buildServer({
    token: TOKEN,
    allowedOrigins: [DEV_ORIGIN],
    logger: false,
  });
  const res = await app.inject({
    method: 'OPTIONS',
    url: '/hello',
    headers: {
      origin: DEV_ORIGIN,
      'access-control-request-method': 'GET',
      'access-control-request-headers': 'authorization',
    },
  });
  assert.equal(res.statusCode, 204);
  assert.equal(res.headers['access-control-allow-origin'], DEV_ORIGIN);
  await app.close();
});

test('CORS actual request from allowed origin gets allow-origin header', async () => {
  const app = await buildServer({
    token: TOKEN,
    allowedOrigins: [DEV_ORIGIN],
    logger: false,
  });
  const res = await app.inject({
    method: 'GET',
    url: '/hello',
    headers: {
      authorization: `Bearer ${TOKEN}`,
      origin: DEV_ORIGIN,
    },
  });
  assert.equal(res.statusCode, 200);
  assert.equal(res.headers['access-control-allow-origin'], DEV_ORIGIN);
  await app.close();
});

test('CORS preflight from disallowed origin gets no allow-origin header', async () => {
  const app = await buildServer({
    token: TOKEN,
    allowedOrigins: [DEV_ORIGIN],
    logger: false,
  });
  const res = await app.inject({
    method: 'OPTIONS',
    url: '/hello',
    headers: {
      origin: 'http://evil.example',
      'access-control-request-method': 'GET',
    },
  });
  assert.equal(res.headers['access-control-allow-origin'], undefined);
  await app.close();
});

test('with no allowedOrigins, no CORS headers are added', async () => {
  const app = await buildServer({ token: TOKEN, logger: false });
  const res = await app.inject({
    method: 'GET',
    url: '/hello',
    headers: {
      authorization: `Bearer ${TOKEN}`,
      origin: DEV_ORIGIN,
    },
  });
  assert.equal(res.statusCode, 200);
  assert.equal(res.headers['access-control-allow-origin'], undefined);
  await app.close();
});
