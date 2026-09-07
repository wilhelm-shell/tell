import { test } from 'node:test';
import assert from 'node:assert/strict';
import { toWsUrl } from '../src/lib/ws.js';

test('toWsUrl http → ws with /ws suffix', () => {
  assert.equal(toWsUrl('http://127.0.0.1:8787'), 'ws://127.0.0.1:8787/ws');
});

test('toWsUrl https → wss', () => {
  assert.equal(toWsUrl('https://bridge.example.com'), 'wss://bridge.example.com/ws');
});

test('toWsUrl only replaces scheme prefix, not later occurrences', () => {
  assert.equal(toWsUrl('http://example.com/http-thing'), 'ws://example.com/http-thing/ws');
});
