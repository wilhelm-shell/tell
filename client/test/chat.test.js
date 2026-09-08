import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sameDay, formatDay, layoutMessages, summarizeReactions } from '../src/lib/chat.js';

const T = (y, mo, d, h, mi) => new Date(y, mo - 1, d, h, mi).getTime();
const NOW = T(2026, 9, 9, 20, 0);   // Wednesday

function msg(over) {
  return Object.assign({ direction: 'in', source: '+1', timestamp: NOW, text: 'x' }, over);
}

test('formatDay: today, yesterday, weekday this year, date with year otherwise', () => {
  assert.equal(formatDay(T(2026, 9, 9, 1, 0), NOW), 'Today');
  assert.equal(formatDay(T(2026, 9, 8, 23, 59), NOW), 'Yesterday');
  assert.equal(formatDay(T(2026, 9, 1, 12, 0), NOW), 'Tuesday 1.9.');
  assert.equal(formatDay(T(2025, 12, 31, 12, 0), NOW), '31.12.2025');
  assert.equal(sameDay(T(2026, 9, 9, 0, 0), T(2026, 9, 9, 23, 59)), true);
  assert.equal(sameDay(T(2026, 9, 9, 23, 59), T(2026, 9, 10, 0, 0)), false);
});

test('layoutMessages: day separators and runs by sender, direction, day and gap', () => {
  const msgs = [
    msg({ timestamp: T(2026, 9, 8, 10, 0) }),                       // yesterday, alone
    msg({ timestamp: T(2026, 9, 9, 9, 0) }),                        // today: run of 2 from +1
    msg({ timestamp: T(2026, 9, 9, 9, 3) }),
    msg({ timestamp: T(2026, 9, 9, 9, 4), direction: 'out', source: '+me' }),  // breaks the run
    msg({ timestamp: T(2026, 9, 9, 9, 5) }),                        // +1 again, new run
    msg({ timestamp: T(2026, 9, 9, 9, 30) }),                       // > 5 min: new run
    msg({ timestamp: T(2026, 9, 9, 9, 31), source: '+2' }),         // other sender
  ];
  const items = layoutMessages(msgs, { now: NOW });
  assert.deepEqual(items.map((it) => it.type === 'day' ? 'day:' + it.label : it.index + (it.first ? 'F' : '') + (it.last ? 'L' : '')),
    ['day:Yesterday', '0FL', 'day:Today', '1F', '2L', '3FL', '4FL', '5FL', '6FL']);
  assert.equal(layoutMessages([], { now: NOW }).length, 0);
});

test('summarizeReactions groups by emoji with counts and names', () => {
  assert.equal(summarizeReactions([]), null);
  assert.equal(summarizeReactions(undefined), null);
  const s = summarizeReactions([
    { emoji: '👍', byName: 'Alice' }, { emoji: '❤️', byName: 'Bob' }, { emoji: '👍', byName: 'me' },
  ]);
  assert.equal(s.counts, '👍 2 ❤️');
  assert.equal(s.names, '👍 Alice, me · ❤️ Bob');
});
