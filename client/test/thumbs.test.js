import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createThumbCache } from '../src/lib/thumbs.js';

function harness(max) {
  const log = [];
  let inFlight = 0;
  let maxInFlight = 0;
  const cache = createThumbCache({
    max,
    fetch: (id) => {
      inFlight++;
      maxInFlight = Math.max(maxInFlight, inFlight);
      return new Promise((resolve, reject) => setTimeout(() => {
        inFlight--;
        if (id.indexOf('bad') === 0) reject(new Error('404'));
        else resolve({ blob: id });
      }, 5));
    },
    createUrl: (blob) => { log.push('create:' + blob.blob); return 'blob:' + blob.blob; },
    revokeUrl: (url) => { log.push('revoke:' + url.slice(5)); },
  });
  return { cache, log, maxInFlight: () => maxInFlight };
}

test('same id shares one fetch; fetches run sequentially', async () => {
  const h = harness(10);
  const [a, b, c] = await Promise.all([h.cache.get('x'), h.cache.get('x'), h.cache.get('y')]);
  assert.equal(a, 'blob:x');
  assert.equal(b, 'blob:x');
  assert.equal(c, 'blob:y');
  assert.deepEqual(h.log, ['create:x', 'create:y']);
  assert.equal(h.maxInFlight(), 1);
  assert.equal(await h.cache.get('x'), 'blob:x', 'cached');
  assert.equal(h.log.length, 2);
});

test('evicts the oldest past max and revokes its url', async () => {
  const h = harness(2);
  await h.cache.get('a');
  await h.cache.get('b');
  await h.cache.get('c');
  assert.equal(h.cache.size(), 2);
  assert.deepEqual(h.log, ['create:a', 'create:b', 'revoke:a', 'create:c']);
});

test('a failed fetch is forgotten so it can be retried; later fetches still run', async () => {
  const h = harness(10);
  await assert.rejects(h.cache.get('bad1'), /404/);
  assert.equal(h.cache.size(), 0);
  assert.equal(await h.cache.get('ok'), 'blob:ok');
  await assert.rejects(h.cache.get('bad1'), /404/, 'retried, still failing');
});
