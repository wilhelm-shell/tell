// One-line summary of a `signal.message` frame for the 240px-wide screen.
// Pure function so it can be unit-tested off-device.
//
//   "Alice: hello"            incoming direct message
//   "Alice [Family]: hello"   incoming group message
//   "me: hello"               sent from another of our devices (sync)
//   "Alice: (2 attachments)"  no text
export function formatLastMessage(msg, maxLen) {
  const cap = maxLen || 60;
  const who = msg.direction === 'out' ? 'me' : (msg.sourceName || msg.source || '?');
  const where = msg.group && msg.group.name ? ' [' + msg.group.name + ']' : '';
  let body = msg.text;
  if (!body) {
    const n = msg.attachments || 0;
    body = '(' + n + ' attachment' + (n === 1 ? '' : 's') + ')';
  }
  // Collapse newlines: the line is a summary, not the message view.
  body = body.replace(/\s+/g, ' ');
  let out = who + where + ': ' + body;
  if (out.length > cap) out = out.slice(0, cap - 1) + '…';
  return out;
}
