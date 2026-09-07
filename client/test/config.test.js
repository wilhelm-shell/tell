import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeUrl } from '../src/config.js';

test('normalizeUrl passes http:// through', () => {
  assert.equal(normalizeUrl('http://192.168.1.10:8787'), 'http://192.168.1.10:8787');
});

test('normalizeUrl passes https:// through', () => {
  assert.equal(normalizeUrl('https://bridge.example.com'), 'https://bridge.example.com');
});

test('normalizeUrl prepends http:// when scheme missing', () => {
  assert.equal(normalizeUrl('192.168.1.10:8787'), 'http://192.168.1.10:8787');
});

test('normalizeUrl trims whitespace before scheme check', () => {
  assert.equal(normalizeUrl('  192.168.1.10:8787  '), 'http://192.168.1.10:8787');
});

test('normalizeUrl strips trailing slashes', () => {
  assert.equal(normalizeUrl('http://x//'), 'http://x');
});

test('normalizeUrl scheme check is case-insensitive', () => {
  assert.equal(normalizeUrl('HTTP://x'), 'HTTP://x');
});
