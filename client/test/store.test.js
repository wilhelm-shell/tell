import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createStore, conversationKey } from '../src/lib/store.js';

function incoming(peer, text, extra) {
  return Object.assign({ direction: 'in', source: peer, sourceName: null, peer: peer, text: text, attachments: 0, group: null, timestamp: 1 }, extra || {});
}
function outgoing(peer, text, extra) {
  return Object.assign({ direction: 'out', source: '+41000000000', sourceName: 'Me', peer: peer, text: text, attachments: 0, group: null, timestamp: 1 }, extra || {});
}
const family = { id: 'grp1=', name: 'Family' };

test('conversationKey: group beats peer, null when neither', () => {
  assert.equal(conversationKey(incoming('+1', 'x', { group: family })), 'g:grp1=');
  assert.equal(conversationKey(incoming('+1', 'x')), 'p:+1');
  assert.equal(conversationKey(outgoing(null, 'x')), null);
});

test('messages group by conversation, newest activity first', () => {
  const s = createStore({ cap: 100 });
  s.add(incoming('+1', 'a'));
  s.add(incoming('+2', 'b'));
  s.add(incoming('+1', 'c'));
  const rows = s.list();
  assert.deepEqual(rows.map((r) => r.key), ['p:+1', 'p:+2']);
  assert.equal(rows[0].last.text, 'c');
  assert.equal(rows[0].count, 2);
  assert.equal(s.size(), 3);
});

test('title: profile name from an incoming message survives later outgoing ones', () => {
  const s = createStore({ cap: 100 });
  s.add(outgoing('+1', 'hi'));
  assert.equal(s.list()[0].title, '+1');
  s.add(incoming('+1', 'yo', { sourceName: 'Alice' }));
  assert.equal(s.list()[0].title, 'Alice');
  s.add(outgoing('+1', 'again'));
  assert.equal(s.list()[0].title, 'Alice');
});

test('title: group name, falling back to "group"', () => {
  const s = createStore({ cap: 100 });
  s.add(incoming('+1', 'x', { group: family, sourceName: 'Alice' }));
  s.add(incoming('+1', 'y', { group: { id: 'grp2=', name: null } }));
  assert.deepEqual(s.list().map((r) => r.title), ['group', 'Family']);
});

test('cap: evicts the oldest message across conversations, drops emptied ones', () => {
  const s = createStore({ cap: 3 });
  s.add(incoming('+1', 'a'));
  s.add(incoming('+2', 'b'));
  s.add(incoming('+2', 'c'));
  s.add(incoming('+3', 'd'));
  assert.equal(s.size(), 3);
  assert.deepEqual(s.list().map((r) => r.key), ['p:+3', 'p:+2']);
  s.add(incoming('+3', 'e'));
  assert.equal(s.size(), 3);
  assert.deepEqual(s.list().map((r) => [r.key, r.count]), [['p:+3', 2], ['p:+2', 1]]);
  assert.equal(s.list()[1].last.text, 'c');
});

test('list(limit) caps rows; subscribe fires on add and can unsubscribe', () => {
  const s = createStore({ cap: 100 });
  let n = 0;
  const off = s.subscribe(() => { n++; });
  for (let i = 0; i < 5; i++) s.add(incoming('+' + i, 'x'));
  assert.equal(n, 5);
  assert.equal(s.list(2).length, 2);
  off();
  s.add(incoming('+9', 'x'));
  assert.equal(n, 5);
});

test('a message without peer or group is ignored', () => {
  const s = createStore({ cap: 100 });
  assert.equal(s.add(outgoing(null, 'x')), false);
  assert.equal(s.size(), 0);
});
