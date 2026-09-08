import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, rmSync, existsSync, readdirSync, utimesSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import sharp from 'sharp';
import { buildServer } from '../src/server.js';
import { isValidId, pruneCache } from '../src/attachments.js';

const TOKEN = 'test-token-1234567890';

async function makeFixture() {
  const root = mkdtempSync(join(tmpdir(), 'tell-att-'));
  const dir = join(root, 'attachments');
  const cacheDir = join(root, 'thumbs');
  const { mkdirSync } = await import('node:fs');
  mkdirSync(dir);
  await sharp({ create: { width: 800, height: 600, channels: 3, background: { r: 200, g: 30, b: 30 } } })
    .png().toFile(join(dir, 'big.png'));
  writeFileSync(join(dir, 'notes.txt'), 'not an image');
  return { root, dir, cacheDir };
}

test('isValidId refuses path tricks', () => {
  assert.equal(isValidId('4uZIOe40YaxDiMS96f-G.jpg'), true);
  for (const bad of ['', '..', '.', 'a/b', 'a\\b', '../x', 'x'.repeat(129), null]) {
    assert.equal(isValidId(bad), false, String(bad));
  }
});

test('GET /attachments/:id returns a screen-sized JPEG, caches it, honours w/h', async () => {
  const f = await makeFixture();
  const app = await buildServer({ token: TOKEN, attachments: { dir: f.dir, cacheDir: f.cacheDir }, logger: false });
  try {
    const auth = { authorization: `Bearer ${TOKEN}` };
    const res = await app.inject({ method: 'GET', url: '/attachments/big.png', headers: auth });
    assert.equal(res.statusCode, 200);
    assert.equal(res.headers['content-type'], 'image/jpeg');
    const meta = await sharp(res.rawPayload).metadata();
    assert.equal(meta.width, 240);
    assert.equal(meta.height, 180, 'aspect kept, fits inside 240x320');
    assert.deepEqual(readdirSync(f.cacheDir), ['big.png-240x320.jpg']);

    const small = await app.inject({ method: 'GET', url: '/attachments/big.png?w=100&h=100', headers: auth });
    const m2 = await sharp(small.rawPayload).metadata();
    assert.equal(m2.width, 100);
    assert.equal(m2.height, 75);

    const huge = await app.inject({ method: 'GET', url: '/attachments/big.png?w=5000&h=5000', headers: auth });
    const m3 = await sharp(huge.rawPayload).metadata();
    assert.equal(m3.width, 480, 'clamped to MAX_EDGE');
  } finally {
    await app.close();
    rmSync(f.root, { recursive: true, force: true });
  }
});

test('GET /attachments: 401 without token, 404 missing, 415 non-image, 400 bad id', async () => {
  const f = await makeFixture();
  const app = await buildServer({ token: TOKEN, attachments: { dir: f.dir, cacheDir: f.cacheDir }, logger: false });
  try {
    const auth = { authorization: `Bearer ${TOKEN}` };
    assert.equal((await app.inject({ method: 'GET', url: '/attachments/big.png' })).statusCode, 401);
    assert.equal((await app.inject({ method: 'GET', url: '/attachments/nope.jpg', headers: auth })).statusCode, 404);
    assert.equal((await app.inject({ method: 'GET', url: '/attachments/notes.txt', headers: auth })).statusCode, 415);
    assert.equal((await app.inject({ method: 'GET', url: '/attachments/a%2Fb', headers: auth })).statusCode, 400, 'encoded slash reaches the param decoded');
    assert.equal(existsSync(f.cacheDir), false, 'nothing cached for failures');
  } finally {
    await app.close();
    rmSync(f.root, { recursive: true, force: true });
  }
});

test('pruneCache deletes oldest files until under the cap', async () => {
  const root = mkdtempSync(join(tmpdir(), 'tell-prune-'));
  try {
    const now = Date.now() / 1000;
    for (let i = 0; i < 4; i++) {
      const p = join(root, `f${i}`);
      writeFileSync(p, Buffer.alloc(100));
      utimesSync(p, now - (10 - i), now - (10 - i));   // f0 oldest
    }
    await pruneCache(root, 250);
    assert.deepEqual(readdirSync(root).sort(), ['f2', 'f3']);
    await pruneCache(join(root, 'missing'), 1);   // no throw
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
