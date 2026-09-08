import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildSendParams, sentMessageFrame, buildReactionParams, reactionFrame } from '../src/signalSend.js';

const ME = '+41000000000';

test('buildSendParams: direct message -> recipient list + account', () => {
  assert.deepEqual(buildSendParams({ text: '  hi  ', peer: '+33123456789' }, ME),
    { account: ME, message: 'hi', recipient: ['+33123456789'] });
});

test('buildSendParams: group wins over peer', () => {
  assert.deepEqual(buildSendParams({ text: 'yo', group: 'abc=', peer: '+1' }, ME),
    { account: ME, message: 'yo', groupId: 'abc=' });
});

test('buildSendParams: rejects no account, empty text, no recipient', () => {
  assert.throws(() => buildSendParams({ text: 'x', peer: '+1' }, null), /no signal account/);
  assert.throws(() => buildSendParams({ text: '   ', peer: '+1' }, ME), /empty message/);
  assert.throws(() => buildSendParams({ text: 'x' }, ME), /no recipient/);
  assert.throws(() => buildSendParams({ text: 'x', peer: 42 }, ME), /no recipient/);
});

test('sentMessageFrame: looks like a synced outgoing message', () => {
  const f = sentMessageFrame({ text: 'hi ', peer: '+33123456789' }, ME, { timestamp: 1700000000000 });
  assert.deepEqual(f, {
    type: 'signal.message', account: ME, direction: 'out', source: ME, sourceName: null,
    peer: '+33123456789', timestamp: 1700000000000, text: 'hi', attachments: 0, group: null,
  });
  const g = sentMessageFrame({ text: 'yo', group: 'abc=', groupName: 'Family' }, ME, { timestamp: 5 });
  assert.equal(g.peer, null);
  assert.deepEqual(g.group, { id: 'abc=', name: 'Family' });
});

test('buildReactionParams: direct and group targets, removal flag', () => {
  assert.deepEqual(buildReactionParams({ emoji: '👍', targetAuthor: '+1', targetTimestamp: 5, peer: '+1' }, ME),
    { account: ME, emoji: '👍', targetAuthor: '+1', targetTimestamp: 5, remove: false, recipient: ['+1'] });
  assert.deepEqual(buildReactionParams({ emoji: ' ❤️ ', remove: true, targetAuthor: '+1', targetTimestamp: 5, group: 'g=' }, ME),
    { account: ME, emoji: '❤️', targetAuthor: '+1', targetTimestamp: 5, remove: true, groupId: 'g=' });
});

test('buildReactionParams: rejects missing pieces', () => {
  const ok = { emoji: '👍', targetAuthor: '+1', targetTimestamp: 5, peer: '+1' };
  assert.throws(() => buildReactionParams(ok, null), /no signal account/);
  assert.throws(() => buildReactionParams({ ...ok, emoji: '' }, ME), /empty reaction/);
  assert.throws(() => buildReactionParams({ ...ok, targetAuthor: null }, ME), /no target author/);
  assert.throws(() => buildReactionParams({ ...ok, targetTimestamp: '5' }, ME), /no target timestamp/);
  assert.throws(() => buildReactionParams({ ...ok, peer: undefined }, ME), /no recipient/);
});

test('reactionFrame: looks like a synced outgoing reaction', () => {
  assert.deepEqual(reactionFrame({ emoji: '👍', targetAuthor: '+1', targetTimestamp: 5, peer: '+1' }, ME), {
    type: 'signal.reaction', account: ME, direction: 'out', source: ME, sourceName: null,
    peer: '+1', group: null, emoji: '👍', remove: false, target: { author: '+1', timestamp: 5 },
  });
  const g = reactionFrame({ emoji: '👍', remove: true, targetAuthor: '+1', targetTimestamp: 5, group: 'g=', groupName: 'Fam' }, ME);
  assert.equal(g.peer, null);
  assert.deepEqual(g.group, { id: 'g=', name: 'Fam' });
  assert.equal(g.remove, true);
});
