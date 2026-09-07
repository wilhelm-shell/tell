import { test } from 'node:test';
import assert from 'node:assert/strict';
import { nextIndex } from '../src/lib/nav.js';

test('nextIndex clamps at zero when going up from top', () => {
  assert.equal(nextIndex(0, 5, -1), 0);
});

test('nextIndex clamps at last when going down from bottom', () => {
  assert.equal(nextIndex(4, 5, +1), 4);
});

test('nextIndex moves within range', () => {
  assert.equal(nextIndex(2, 5, +1), 3);
  assert.equal(nextIndex(2, 5, -1), 1);
});

test('nextIndex on empty list returns -1', () => {
  assert.equal(nextIndex(0, 0, +1), -1);
});

test('nextIndex passthrough with direction 0', () => {
  assert.equal(nextIndex(3, 5, 0), 3);
});
