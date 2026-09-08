import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createReadMarks, conversationKey } from '../src/readMarks.js';

test('conversationKey matches the client scheme', () => {
  assert.equal(conversationKey({ group: { id: 'g=' }, peer: '+1' }), 'g:g=');
  assert.equal(conversationKey({ group: null, peer: '+1' }), 'p:+1');
  assert.equal(conversationKey({ group: null, peer: null }), null);
});

test('mark only moves forward, rejects junk', () => {
  const rm = createReadMarks(null);
  assert.equal(rm.mark('p:+1', 100), true);
  assert.equal(rm.mark('p:+1', 50), false);
  assert.equal(rm.mark('p:+1', 100), false);
  assert.equal(rm.mark('p:+1', 101), true);
  assert.equal(rm.mark('', 5), false);
  assert.equal(rm.mark('p:+2', '5'), false);
  assert.deepEqual(rm.all(), { 'p:+1': 101 });
  assert.equal(rm.get('p:+9'), 0);
});

test('applyReadSync resolves conversations via the backlog, falls back to the sender', () => {
  const rm = createReadMarks(null);
  const backlog = [
    { type: 'signal.message', source: '+1', timestamp: 10, peer: '+1', group: null },
    { type: 'signal.message', source: '+1', timestamp: 20, peer: '+1', group: { id: 'g=' } },
    { type: 'signal.reaction', source: '+1', timestamp: 30 },
  ];
  const changed = rm.applyReadSync([
    { sender: '+1', timestamp: 20 },     // in a group → group key
    { sender: '+1', timestamp: 10 },     // direct
    { sender: '+2', timestamp: 99 },     // not in backlog → p:+2
    { sender: '+1', timestamp: 5 },      // older than the direct mark → no change
    { sender: null, timestamp: 1 },      // unresolvable
  ], backlog);
  assert.deepEqual(changed, [
    { key: 'g:g=', timestamp: 20 },
    { key: 'p:+1', timestamp: 10 },
    { key: 'p:+2', timestamp: 99 },
  ]);
});

test('loads from the store, saves after changes, coalesces', async () => {
  const saves = [];
  let release;
  const store = {
    load: () => ({ 'p:+1': 5, junk: 'x' }),
    save: (m) => { saves.push(m); return new Promise((r) => { release = r; }); },
  };
  const rm = createReadMarks(store);
  assert.deepEqual(rm.all(), { 'p:+1': 5 });
  assert.equal(saves.length, 0);
  rm.mark('p:+1', 6);
  rm.mark('p:+2', 7);
  assert.equal(saves.length, 1, 'second change waits for the first write');
  release();
  await new Promise((r) => setImmediate(r));
  assert.equal(saves.length, 2);
  assert.deepEqual(saves[1], { 'p:+1': 6, 'p:+2': 7 });
  release();
  await rm.flush();
});
