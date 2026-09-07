import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildServer } from '../src/server.js';

const TOKEN = 'test-token-1234567890';

test('GET /hello with valid token returns ok', async () => {
  const app = buildServer({ token: TOKEN, logger: false });
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
  const app = buildServer({ token: TOKEN, logger: false });
  const res = await app.inject({ method: 'GET', url: '/hello' });
  assert.equal(res.statusCode, 401);
  await app.close();
});

test('GET /hello with wrong token returns 401', async () => {
  const app = buildServer({ token: TOKEN, logger: false });
  const res = await app.inject({
    method: 'GET',
    url: '/hello',
    headers: { authorization: 'Bearer wrong' },
  });
  assert.equal(res.statusCode, 401);
  await app.close();
});

test('unknown route with valid token returns 404 (auth still applied)', async () => {
  const app = buildServer({ token: TOKEN, logger: false });
  const res = await app.inject({
    method: 'GET',
    url: '/does-not-exist',
    headers: { authorization: `Bearer ${TOKEN}` },
  });
  assert.equal(res.statusCode, 404);
  await app.close();
});
