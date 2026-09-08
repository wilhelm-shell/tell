import { test } from 'node:test';
import assert from 'node:assert/strict';
import { formatLastMessage, formatPreview, escapeHtml, formatTime, messageBody, attachmentCount, firstImage, firstVideo } from '../src/lib/format.js';

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
  assert.equal(formatLastMessage({ direction: 'in', sourceName: 'A', text: null, attachments: 1, group: null }), 'A: (attachment)');
  assert.equal(formatLastMessage({ direction: 'in', sourceName: 'A', text: null, attachments: 3, group: null }), 'A: (3 attachments)');
});

test('long text is truncated with an ellipsis and newlines collapsed', () => {
  const s = formatLastMessage({ direction: 'in', sourceName: 'A', text: 'line one\nline two ' + 'x'.repeat(100), attachments: 0, group: null }, 20);
  assert.equal(s.length, 20);
  assert.equal(s, 'A: line one line tw…');
});

test('formatPreview omits the sender for incoming direct messages', () => {
  const s = formatPreview({ direction: 'in', sourceName: 'Alice', text: 'hello', attachments: 0, group: null });
  assert.equal(s, 'hello');
});

test('formatPreview prefixes me: and group senders', () => {
  assert.equal(formatPreview({ direction: 'out', text: 'yo', attachments: 0, group: null }), 'me: yo');
  assert.equal(formatPreview({ direction: 'in', sourceName: 'Bob', text: 'hi', attachments: 0, group: { id: 'g', name: 'Family' } }), 'Bob: hi');
});

test('escapeHtml neutralises markup', () => {
  assert.equal(escapeHtml('<b>&"x"'), '&lt;b&gt;&amp;&quot;x&quot;');
});

test('formatTime: HH:MM for today, DD.MM. HH:MM otherwise, empty for missing', () => {
  const now = new Date(2026, 8, 8, 20, 0).getTime();
  assert.equal(formatTime(new Date(2026, 8, 8, 14, 32).getTime(), now), '14:32');
  assert.equal(formatTime(new Date(2026, 8, 8, 9, 5).getTime(), now), '09:05');
  assert.equal(formatTime(new Date(2026, 8, 7, 23, 59).getTime(), now), '07.09. 23:59');
  assert.equal(formatTime(new Date(2025, 0, 1, 0, 0).getTime(), now), '01.01. 00:00');
  assert.equal(formatTime(null, now), '');
});

test('attachment helpers: arrays and legacy counts, labels by kind', () => {
  const img = { text: null, attachments: [{ id: 'a.jpg', contentType: 'image/jpeg' }] };
  assert.equal(attachmentCount(img), 1);
  assert.deepEqual(firstImage(img), { id: 'a.jpg', contentType: 'image/jpeg' });
  assert.equal(messageBody(img), '(image)');
  assert.equal(messageBody({ text: null, attachments: [{ id: 'v.mp4', contentType: 'video/mp4' }] }), '(video)');
  assert.equal(messageBody({ text: null, attachments: [{ id: 'a.jpg', contentType: 'image/jpeg' }, { id: 'b.png', contentType: 'image/png' }] }), '(2 images)');
  assert.equal(messageBody({ text: null, attachments: [{ id: 'a.jpg', contentType: 'image/jpeg' }, { id: 'v.mp4', contentType: 'video/mp4' }] }), '(2 attachments)');
  assert.equal(messageBody({ text: null, attachments: 3 }), '(3 attachments)', 'legacy count from an old backlog file');
  assert.equal(firstImage({ text: 'x', attachments: 2 }), null);
  assert.equal(messageBody({ text: 'hi', attachments: [{ id: 'a.jpg', contentType: 'image/jpeg' }] }), 'hi', 'text wins');
});

test('firstVideo finds the first video attachment', () => {
  assert.deepEqual(firstVideo({ attachments: [{ id: 'a.jpg', contentType: 'image/jpeg' }, { id: 'v.mp4', contentType: 'video/mp4' }] }), { id: 'v.mp4', contentType: 'video/mp4' });
  assert.equal(firstVideo({ attachments: [{ id: 'a.jpg', contentType: 'image/jpeg' }] }), null);
  assert.equal(firstVideo({ attachments: 1 }), null);
});
