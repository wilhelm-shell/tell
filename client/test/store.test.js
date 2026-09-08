import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createStore, conversationKey, parseKey } from '../src/lib/store.js';

// Distinct timestamps per message: the store treats same source + timestamp as a duplicate.
let nextTs = 1000;
function incoming(peer, text, extra) {
  return Object.assign({ direction: 'in', source: peer, sourceName: null, peer: peer, text: text, attachments: 0, group: null, timestamp: nextTs++ }, extra || {});
}
function outgoing(peer, text, extra) {
  return Object.assign({ direction: 'out', source: '+41000000000', sourceName: 'Me', peer: peer, text: text, attachments: 0, group: null, timestamp: nextTs++ }, extra || {});
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

test('get(key) returns title and messages oldest first, null when unknown', () => {
  const s = createStore({ cap: 100 });
  s.add(incoming('+1', 'a', { sourceName: 'Alice' }));
  s.add(outgoing('+1', 'b'));
  s.add(incoming('+2', 'zzz'));
  const c = s.get('p:+1');
  assert.equal(c.title, 'Alice');
  assert.deepEqual(c.messages.map((m) => m.text), ['a', 'b']);
  assert.equal(s.get('p:+404'), null);
});

test('duplicate (same source + timestamp) is dropped, e.g. backlog replayed on reconnect', () => {
  const s = createStore({ cap: 100 });
  const m = incoming('+1', 'a', { timestamp: 1000 });
  assert.equal(s.add(m), true);
  assert.equal(s.add(Object.assign({}, m)), false);
  assert.equal(s.add(incoming('+1', 'a', { timestamp: 1001 })), true);
  assert.equal(s.size(), 2);
});

test('addMany adds in order, skips duplicates, notifies once', () => {
  const s = createStore({ cap: 100 });
  let n = 0;
  s.subscribe(() => { n++; });
  s.add(incoming('+1', 'a', { timestamp: 1 }));
  const added = s.addMany([
    incoming('+1', 'a', { timestamp: 1 }),
    incoming('+1', 'b', { timestamp: 2 }),
    incoming('+2', 'c', { timestamp: 3 }),
  ]);
  assert.equal(added, 2);
  assert.equal(n, 2);
  assert.deepEqual(s.get('p:+1').messages.map((m) => m.text), ['a', 'b']);
  assert.equal(s.addMany([]), 0);
  assert.equal(n, 2);
});

test('parseKey inverts conversationKey', () => {
  assert.deepEqual(parseKey('g:abc='), { group: 'abc=' });
  assert.deepEqual(parseKey('p:+41'), { peer: '+41' });
  assert.deepEqual(parseKey('junk'), {});
  assert.deepEqual(parseKey(null), {});
});

// --- unread / read marks ----------------------------------------------------

test('unread counts incoming messages newer than the read mark', () => {
  const s = createStore({ cap: 100 });
  s.add(incoming('+1', 'a', { timestamp: 10 }));
  s.add(incoming('+1', 'b', { timestamp: 20 }));
  s.add(incoming('+2', 'c', { timestamp: 30 }));
  assert.deepEqual(s.list().map((r) => [r.key, r.unread]), [['p:+2', 1], ['p:+1', 2]]);
  assert.equal(s.totalUnread(), 3);
  assert.equal(s.markRead('p:+1'), true);
  assert.deepEqual(s.list().map((r) => r.unread), [1, 0]);
  assert.equal(s.markRead('p:+1'), false, 'nothing newer: no change, no notify');
  assert.equal(s.markRead('p:+404'), false);
  s.add(incoming('+1', 'd', { timestamp: 25 }));
  assert.equal(s.list()[0].unread, 1);
});

test('an outgoing message marks everything before it as read', () => {
  const s = createStore({ cap: 100 });
  s.add(incoming('+1', 'a', { timestamp: 10 }));
  s.add(outgoing('+1', 'reply', { timestamp: 15 }));
  s.add(incoming('+1', 'b', { timestamp: 20 }));
  assert.equal(s.list()[0].unread, 1);
});

test('read marks come from opts.lastRead and go out via onLastRead', () => {
  const saved = [];
  const s = createStore({ cap: 100, lastRead: { 'p:+1': 15, junk: 'x' }, onLastRead: (m) => saved.push(m) });
  s.add(incoming('+1', 'old', { timestamp: 10 }));
  s.add(incoming('+1', 'new', { timestamp: 20 }));
  assert.equal(s.list()[0].unread, 1);
  s.markRead('p:+1');
  assert.deepEqual(saved, [{ 'p:+1': 20 }]);
  s.add(incoming('+1', 'newer', { timestamp: 30 }));
  assert.equal(s.list()[0].unread, 1);
});

test('persisted read marks are capped, oldest dropped', () => {
  let last = null;
  const s = createStore({ cap: 1000, onLastRead: (m) => { last = m; } });
  for (let i = 1; i <= 101; i++) {
    s.add(incoming('+' + i, 'x', { timestamp: i }));
    s.markRead('p:+' + i);
  }
  assert.equal(Object.keys(last).length, 100);
  assert.equal(last['p:+1'], undefined);
  assert.equal(last['p:+101'], 101);
});
