import { test } from 'node:test';
import assert from 'node:assert/strict';
import { reconnectDelay } from '../src/lib/backoff.js';

test('reconnectDelay grows then caps at 30s', () => {
  assert.deepEqual([0, 1, 2, 3, 4, 50].map(reconnectDelay), [2000, 5000, 10000, 30000, 30000, 30000]);
});

test('reconnectDelay tolerates junk attempts', () => {
  assert.equal(reconnectDelay(-3), 2000);
  assert.equal(reconnectDelay(undefined), 2000);
});
