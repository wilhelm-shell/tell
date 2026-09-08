import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createBacklog } from '../src/backlog.js';

test('keeps the newest cap frames, oldest first', () => {
  const b = createBacklog(3);
  for (let i = 1; i <= 5; i++) b.push({ n: i });
  assert.deepEqual(b.list().map((f) => f.n), [3, 4, 5]);
  assert.equal(b.size, 3);
});

test('list() is a copy', () => {
  const b = createBacklog(3);
  b.push({ n: 1 });
  b.list().push({ n: 99 });
  assert.equal(b.size, 1);
});

test('cap 0 (or junk) disables buffering', () => {
  for (const cap of [0, -1, NaN, undefined]) {
    const b = createBacklog(cap);
    b.push({ n: 1 });
    assert.equal(b.size, 0, `cap=${cap}`);
    assert.equal(b.cap, 0);
  }
});

// --- persistence ------------------------------------------------------------

// A store whose save() only completes when the test says so, to observe
// coalescing.
function manualStore(initial) {
  const saves = [];
  const releases = [];
  return {
    saves,
    load: () => initial,
    save(frames) {
      saves.push(frames);
      return new Promise((resolve) => releases.push(resolve));
    },
    release() { const r = releases.shift(); if (r) r(); },
    get pending() { return releases.length; },
  };
}

test('loads from the store on start, newest cap only', () => {
  const store = manualStore([{ n: 1 }, { n: 2 }, { n: 3 }, { n: 4 }]);
  const b = createBacklog(3, store);
  assert.deepEqual(b.list().map((f) => f.n), [2, 3, 4]);
  assert.equal(b.loaded, 3);
  assert.equal(store.saves.length, 0, 'loading must not write');
});

test('saves after push; concurrent pushes coalesce into one follow-up write', async () => {
  const store = manualStore([]);
  const b = createBacklog(10, store);
  b.push({ n: 1 });
  assert.equal(store.saves.length, 1);
  b.push({ n: 2 });
  b.push({ n: 3 });
  assert.equal(store.saves.length, 1, 'no second write while one is in flight');
  store.release();
  await new Promise((r) => setImmediate(r));
  assert.equal(store.saves.length, 2, 'exactly one follow-up write for the burst');
  assert.deepEqual(store.saves[1].map((f) => f.n), [1, 2, 3]);
  store.release();
  await b.flush();
  assert.equal(store.pending, 0);
});

test('a failing save reports via onError and does not break later saves', async () => {
  const errors = [];
  let fail = true;
  const store = {
    load: () => [],
    save: async () => { if (fail) throw new Error('disk full'); },
  };
  const b = createBacklog(10, store, { onError: (e) => errors.push(e.message) });
  b.push({ n: 1 });
  await b.flush();
  assert.deepEqual(errors, ['disk full']);
  fail = false;
  b.push({ n: 2 });
  await b.flush();
  assert.equal(errors.length, 1);
  assert.equal(b.size, 2);
});

test('cap 0 never touches the store', () => {
  let loads = 0;
  const store = { load: () => { loads++; return [{ n: 1 }]; }, save: async () => { throw new Error('must not save'); } };
  const b = createBacklog(0, store);
  b.push({ n: 2 });
  assert.equal(loads, 0);
  assert.equal(b.size, 0);
});
