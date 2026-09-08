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
