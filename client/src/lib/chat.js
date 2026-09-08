// Chat layout logic for the conversation view, kept pure so it is tested
// off-device: day separators, and runs of consecutive messages from the
// same sender that share one name label and tighter spacing.

const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const RUN_GAP_MS = 5 * 60 * 1000;

export function sameDay(a, b) {
  const x = new Date(a);
  const y = new Date(b);
  return x.getFullYear() === y.getFullYear() && x.getMonth() === y.getMonth() && x.getDate() === y.getDate();
}

// "Today", "Yesterday", "Tuesday 8.9.", or "8.9.2025" in another year.
export function formatDay(ts, now) {
  const n = now == null ? Date.now() : now;
  if (sameDay(ts, n)) return 'Today';
  if (sameDay(ts, n - 24 * 60 * 60 * 1000)) return 'Yesterday';
  const d = new Date(ts);
  const dm = d.getDate() + '.' + (d.getMonth() + 1) + '.';
  if (d.getFullYear() !== new Date(n).getFullYear()) return dm + d.getFullYear();
  return WEEKDAYS[d.getDay()] + ' ' + dm;
}

// Items for rendering, in order:
//   { type: 'day', label }
//   { type: 'msg', msg, index, first, last }
// `index` is the position in `msgs`, which is also the focus index since
// day separators are not focus stops. `first`/`last` mark the edges of a
// run: same direction, same sender, same day, less than five minutes
// apart. The name label goes on `first`; the bubble tail on `last`.
export function layoutMessages(msgs, opts) {
  const now = opts && opts.now != null ? opts.now : Date.now();
  const gap = opts && opts.gapMs ? opts.gapMs : RUN_GAP_MS;
  const items = [];
  for (let i = 0; i < msgs.length; i++) {
    const m = msgs[i];
    const prev = i > 0 ? msgs[i - 1] : null;
    const next = i + 1 < msgs.length ? msgs[i + 1] : null;
    const ts = m.timestamp || 0;
    if (!prev || !sameDay(prev.timestamp || 0, ts)) {
      items.push({ type: 'day', label: formatDay(ts, now) });
    }
    items.push({
      type: 'msg',
      msg: m,
      index: i,
      first: !continues(prev, m, gap),
      last: !continues(m, next, gap),
    });
  }
  return items;
}

function continues(a, b, gap) {
  if (!a || !b) return false;
  if (a.direction !== b.direction || a.source !== b.source) return false;
  const ta = a.timestamp || 0;
  const tb = b.timestamp || 0;
  return sameDay(ta, tb) && Math.abs(tb - ta) < gap;
}

// "👍 2 ❤️ 1" and "👍 Alice, me · ❤️ Bob" for a message's reactions.
export function summarizeReactions(reactions) {
  const list = reactions || [];
  if (list.length === 0) return null;
  const order = [];
  const byEmoji = {};
  for (let i = 0; i < list.length; i++) {
    const r = list[i];
    if (!byEmoji[r.emoji]) { byEmoji[r.emoji] = []; order.push(r.emoji); }
    byEmoji[r.emoji].push(r.byName);
  }
  const counts = [];
  const names = [];
  for (let i = 0; i < order.length; i++) {
    const e = order[i];
    counts.push(byEmoji[e].length > 1 ? e + ' ' + byEmoji[e].length : e);
    names.push(e + ' ' + byEmoji[e].join(', '));
  }
  return { counts: counts.join(' '), names: names.join(' · ') };
}
