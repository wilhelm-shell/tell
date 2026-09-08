import { test } from 'node:test';
import assert from 'node:assert/strict';
import { formatLastMessage } from '../src/lib/format.js';

test('incoming direct message uses the sender name', () => {
  const s = formatLastMessage({ direction: 'in', sourceName: 'Alice', source: '+33123456789', text: 'hello', attachments: 0, group: null });
  assert.equal(s, 'Alice: hello');
});

test('falls back to the number when there is no name', () => {
  const s = formatLastMessage({ direction: 'in', sourceName: null, source: '+33123456789', text: 'hi', attachments: 0, group: null });
  assert.equal(s, '+33123456789: hi');
});

test('group name goes in brackets', () => {
  const s = formatLastMessage({ direction: 'in', sourceName: 'Alice', text: 'hi', attachments: 0, group: { id: 'x', name: 'Family' } });
  assert.equal(s, 'Alice [Family]: hi');
});

test('outgoing sync message is labelled me', () => {
  const s = formatLastMessage({ direction: 'out', sourceName: 'Me Myself', text: 'yo', attachments: 0, group: null });
  assert.equal(s, 'me: yo');
});

test('attachment-only message shows a count', () => {
  assert.equal(formatLastMessage({ direction: 'in', sourceName: 'A', text: null, attachments: 1, group: null }), 'A: (1 attachment)');
  assert.equal(formatLastMessage({ direction: 'in', sourceName: 'A', text: null, attachments: 3, group: null }), 'A: (3 attachments)');
});

test('long text is truncated with an ellipsis and newlines collapsed', () => {
  const s = formatLastMessage({ direction: 'in', sourceName: 'A', text: 'line one\nline two ' + 'x'.repeat(100), attachments: 0, group: null }, 20);
  assert.equal(s.length, 20);
  assert.equal(s, 'A: line one line tw…');
});
