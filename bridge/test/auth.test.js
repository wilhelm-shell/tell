import { test } from 'node:test';
import assert from 'node:assert/strict';
import { checkBearer } from '../src/auth.js';

test('accepts matching bearer token', () => {
  assert.equal(checkBearer('Bearer secret', 'secret'), true);
});

test('rejects wrong token of equal length', () => {
  assert.equal(checkBearer('Bearer wrong!', 'secret'), false);
});

test('rejects missing header', () => {
  assert.equal(checkBearer(undefined, 'secret'), false);
});

test('rejects header without Bearer prefix', () => {
  assert.equal(checkBearer('secret', 'secret'), false);
});

test('rejects different-length tokens', () => {
  assert.equal(checkBearer('Bearer short', 'much-longer-secret'), false);
});

test('rejects empty token after prefix', () => {
  assert.equal(checkBearer('Bearer ', 'secret'), false);
});
