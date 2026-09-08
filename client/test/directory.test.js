import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeNumber, filterDirectory, pickerRows } from '../src/lib/directory.js';

const dir = [
  { kind: 'contact', id: '+41791234567', name: 'Alice Ammann' },
  { kind: 'contact', id: '+33612345678', name: 'Bob' },
  { kind: 'group', id: 'g1=', name: 'Family' },
];

test('normalizeNumber accepts +, 00, spaces and punctuation; rejects junk', () => {
  assert.equal(normalizeNumber('+41 79 123 45 67'), '+41791234567');
  assert.equal(normalizeNumber('0041791234567'), '+41791234567');
  assert.equal(normalizeNumber('+41-79.123(45)67'), '+41791234567');
  assert.equal(normalizeNumber('079 123 45 67'), null, 'no country code');
  assert.equal(normalizeNumber('+41'), null, 'too short');
  assert.equal(normalizeNumber('alice'), null);
  assert.equal(normalizeNumber(''), null);
});

test('filterDirectory: empty query lists all; name substring; digits match contact ids', () => {
  assert.equal(filterDirectory(dir, '').length, 3);
  assert.deepEqual(filterDirectory(dir, 'AMM').map((e) => e.name), ['Alice Ammann']);
  assert.deepEqual(filterDirectory(dir, '336').map((e) => e.name), ['Bob']);
  assert.deepEqual(filterDirectory(dir, 'fam').map((e) => e.kind), ['group']);
});

test('pickerRows adds a number row only when no contact has that number', () => {
  const known = pickerRows(dir, '+41 79 123 45 67');
  assert.deepEqual(known.rows.map((e) => e.kind), ['contact']);
  const fresh = pickerRows(dir, '+41 79 999 99 99');
  assert.deepEqual(fresh.rows[0], { kind: 'number', id: '+41799999999', name: '+41799999999' });
  assert.equal(pickerRows(dir, 'zzz').rows.length, 0);
});

test('pickerRows caps rows and reports how many more matched', () => {
  const capped = pickerRows(dir, '', 2);
  assert.equal(capped.rows.length, 2);
  assert.equal(capped.more, 1);
  assert.equal(pickerRows(dir, '', 50).more, 0);
  // The number row does not count against the cap.
  const withNumber = pickerRows(dir, '+41 79 999 99 99', 1);
  assert.equal(withNumber.rows.length, 1);
  assert.equal(withNumber.more, 0);
});
