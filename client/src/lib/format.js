// Text helpers for the 240px-wide screen. Pure functions, unit-tested
// off-device.

// The readable part of a message: its text, or a placeholder for
// attachment-only messages. Newlines collapsed: these are summaries.
export function messageBody(msg) {
  let body = msg.text;
  if (!body) {
    const n = msg.attachments || 0;
    body = '(' + n + ' attachment' + (n === 1 ? '' : 's') + ')';
  }
  return body.replace(/\s+/g, ' ');
}

function truncate(s, cap) {
  return s.length > cap ? s.slice(0, cap - 1) + '…' : s;
}

// One line with sender, for a context where the conversation is unknown:
//   "Alice: hello"            incoming direct message
//   "Alice [Family]: hello"   incoming group message
//   "me: hello"               sent from another of our devices (sync)
export function formatLastMessage(msg, maxLen) {
  const who = msg.direction === 'out' ? 'me' : (msg.sourceName || msg.source || '?');
  const where = msg.group && msg.group.name ? ' [' + msg.group.name + ']' : '';
  return truncate(who + where + ': ' + messageBody(msg), maxLen || 60);
}

// Preview line under a conversation title. The title already names the
// peer or group, so only add a sender prefix where it disambiguates:
// "me:" for outgoing, the sender for group messages.
export function formatPreview(msg, maxLen) {
  let who = '';
  if (msg.direction === 'out') who = 'me: ';
  else if (msg.group) who = (msg.sourceName || msg.source || '?') + ': ';
  return truncate(who + messageBody(msg), maxLen || 40);
}

function pad2(n) { return (n < 10 ? '0' : '') + n; }

// "14:32" for today, "08.09. 14:32" otherwise. Manual on purpose: Intl on
// this platform is not something to lean on. `now` is injectable for tests.
export function formatTime(ts, now) {
  if (!ts) return '';
  const d = new Date(ts);
  const n = new Date(now == null ? Date.now() : now);
  const hm = pad2(d.getHours()) + ':' + pad2(d.getMinutes());
  const sameDay = d.getFullYear() === n.getFullYear()
    && d.getMonth() === n.getMonth()
    && d.getDate() === n.getDate();
  return sameDay ? hm : pad2(d.getDate()) + '.' + pad2(d.getMonth() + 1) + '. ' + hm;
}

// For building innerHTML from untrusted text (message bodies, names).
export function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
