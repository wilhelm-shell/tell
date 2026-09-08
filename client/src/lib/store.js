// In-memory conversation store. Pure JS, no DOM, so it is unit-tested
// off-device. One instance lives for the whole app (see app.js); screens
// subscribe and re-render.
//
// Memory rule (CLAUDE.md): a global cap on cached messages across ALL
// conversations. When full, the oldest message anywhere is evicted; a
// conversation whose last message is evicted disappears from the list.

// A conversation is a group, or a direct chat with one peer.
export function conversationKey(msg) {
  if (msg.group && msg.group.id) return 'g:' + msg.group.id;
  if (msg.peer) return 'p:' + msg.peer;
  return null;
}

// What to call the conversation, given one message from it. Incoming
// direct messages carry the contact's profile name; outgoing ones only
// carry the destination number (the bridge has no contact lookup yet).
function titleFor(msg) {
  if (msg.group) return msg.group.name || 'group';
  if (msg.direction === 'in') return msg.sourceName || msg.source || msg.peer;
  return msg.peer;
}

// A name from an incoming message beats a bare number from an outgoing
// one, and must not be overwritten by it later.
function titleIsName(msg) {
  return !!(msg.group ? msg.group.name : (msg.direction === 'in' && msg.sourceName));
}

export function createStore(opts) {
  const cap = (opts && opts.cap) || 200;
  const convs = [];          // newest activity first
  const listeners = [];
  let total = 0;
  let seq = 0;               // arrival order; wall-clock timestamps may be stale for sync messages

  function find(key) {
    for (let i = 0; i < convs.length; i++) if (convs[i].key === key) return i;
    return -1;
  }

  function notify() {
    for (let i = 0; i < listeners.length; i++) {
      try { listeners[i](); } catch (_) {}
    }
  }

  function evictOldest() {
    let victim = -1;
    let oldest = Infinity;
    for (let i = 0; i < convs.length; i++) {
      const first = convs[i].messages[0];
      if (first && first.seq < oldest) { oldest = first.seq; victim = i; }
    }
    if (victim === -1) return;
    convs[victim].messages.shift();
    total--;
    if (convs[victim].messages.length === 0) convs.splice(victim, 1);
  }

  function add(msg) {
    const key = conversationKey(msg);
    if (!key) return false;
    const entry = { seq: seq++, msg: msg };
    let idx = find(key);
    let conv;
    if (idx === -1) {
      conv = { key: key, title: titleFor(msg), hasName: titleIsName(msg), messages: [] };
    } else {
      conv = convs.splice(idx, 1)[0];
      if (!conv.hasName && titleIsName(msg)) {
        conv.title = titleFor(msg);
        conv.hasName = true;
      }
    }
    conv.messages.push(entry);
    convs.unshift(conv);
    total++;
    while (total > cap) evictOldest();
    notify();
    return true;
  }

  // Summaries for the list screen, newest activity first.
  function list(limit) {
    const n = typeof limit === 'number' ? Math.min(limit, convs.length) : convs.length;
    const out = [];
    for (let i = 0; i < n; i++) {
      const c = convs[i];
      out.push({ key: c.key, title: c.title, last: c.messages[c.messages.length - 1].msg, count: c.messages.length });
    }
    return out;
  }

  function subscribe(fn) {
    listeners.push(fn);
    return function unsubscribe() {
      const i = listeners.indexOf(fn);
      if (i !== -1) listeners.splice(i, 1);
    };
  }

  return { add: add, list: list, subscribe: subscribe, size: function () { return total; } };
}
