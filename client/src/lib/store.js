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

// Inverse of conversationKey: { group } or { peer }.
export function parseKey(key) {
  if (typeof key !== 'string') return {};
  if (key.slice(0, 2) === 'g:') return { group: key.slice(2) };
  if (key.slice(0, 2) === 'p:') return { peer: key.slice(2) };
  return {};
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

// Read marks persisted per conversation: at most this many keys.
const LAST_READ_CAP = 100;

export function createStore(opts) {
  const cap = (opts && opts.cap) || 200;
  const convs = [];          // newest activity first
  const listeners = [];
  let total = 0;
  let seq = 0;               // arrival order; wall-clock timestamps may be stale for sync messages

  // Unread = incoming messages newer than the conversation's read mark.
  // A timestamp rather than a counter, so the backlog replayed after the
  // app was killed is counted correctly against a mark saved earlier.
  const lastRead = {};
  if (opts && opts.lastRead) {
    for (const k in opts.lastRead) {
      if (typeof opts.lastRead[k] === 'number') lastRead[k] = opts.lastRead[k];
    }
  }
  const onLastRead = opts && typeof opts.onLastRead === 'function' ? opts.onLastRead : null;

  function setLastRead(key, ts) {
    if (!(ts > (lastRead[key] || 0))) return false;
    lastRead[key] = ts;
    // Bound the persisted map: drop the oldest mark once over the cap.
    const keys = Object.keys(lastRead);
    if (keys.length > LAST_READ_CAP) {
      let oldestKey = null;
      let oldest = Infinity;
      for (let i = 0; i < keys.length; i++) {
        if (lastRead[keys[i]] < oldest) { oldest = lastRead[keys[i]]; oldestKey = keys[i]; }
      }
      if (oldestKey !== null) delete lastRead[oldestKey];
    }
    if (onLastRead) {
      const copy = {};
      for (const k in lastRead) copy[k] = lastRead[k];
      try { onLastRead(copy); } catch (_) {}
    }
    return true;
  }

  function unreadOf(conv) {
    const mark = lastRead[conv.key] || 0;
    let n = 0;
    for (let i = conv.messages.length - 1; i >= 0; i--) {
      const m = conv.messages[i].msg;
      if (!(m.timestamp > mark)) break;   // messages are in arrival order; older ones cannot be newer
      if (m.direction === 'in') n++;
    }
    return n;
  }

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

  // Signal identifies a message by sender + timestamp. The bridge replays
  // its backlog on every (re)connect, so the same message can arrive twice.
  function isDuplicate(conv, msg) {
    if (!msg.source || !msg.timestamp) return false;
    for (let i = conv.messages.length - 1; i >= 0; i--) {
      const m = conv.messages[i].msg;
      if (m.timestamp === msg.timestamp && m.source === msg.source) return true;
    }
    return false;
  }

  function insert(msg) {
    const key = conversationKey(msg);
    if (!key) return false;
    let idx = find(key);
    let conv;
    if (idx === -1) {
      conv = { key: key, title: titleFor(msg), hasName: titleIsName(msg), messages: [] };
    } else {
      conv = convs[idx];
      if (isDuplicate(conv, msg)) return false;
      convs.splice(idx, 1);
      if (!conv.hasName && titleIsName(msg)) {
        conv.title = titleFor(msg);
        conv.hasName = true;
      }
    }
    conv.messages.push({ seq: seq++, msg: msg });
    convs.unshift(conv);
    total++;
    while (total > cap) evictOldest();
    // Something we sent (from any device) means we had read everything
    // before it.
    if (msg.direction === 'out' && msg.timestamp) setLastRead(key, msg.timestamp);
    return true;
  }

  // The conversation is on screen: everything in it counts as read.
  function markRead(key) {
    const idx = find(key);
    if (idx === -1) return false;
    const msgs = convs[idx].messages;
    let newest = 0;
    for (let i = 0; i < msgs.length; i++) {
      const ts = msgs[i].msg.timestamp || 0;
      if (ts > newest) newest = ts;
    }
    if (!setLastRead(key, newest)) return false;
    notify();
    return true;
  }

  function totalUnread() {
    let n = 0;
    for (let i = 0; i < convs.length; i++) n += unreadOf(convs[i]);
    return n;
  }

  function add(msg) {
    const added = insert(msg);
    if (added) notify();
    return added;
  }

  // Backlog replay: many messages, one notification, so the list screen
  // re-renders once instead of once per message.
  function addMany(msgs) {
    let added = 0;
    for (let i = 0; i < msgs.length; i++) if (insert(msgs[i])) added++;
    if (added > 0) notify();
    return added;
  }

  // Summaries for the list screen, newest activity first.
  function list(limit) {
    const n = typeof limit === 'number' ? Math.min(limit, convs.length) : convs.length;
    const out = [];
    for (let i = 0; i < n; i++) {
      const c = convs[i];
      out.push({
        key: c.key,
        title: c.title,
        last: c.messages[c.messages.length - 1].msg,
        count: c.messages.length,
        unread: unreadOf(c),
      });
    }
    return out;
  }

  // One conversation with its messages oldest→newest, or null.
  function get(key) {
    const idx = find(key);
    if (idx === -1) return null;
    const c = convs[idx];
    const messages = [];
    for (let i = 0; i < c.messages.length; i++) messages.push(c.messages[i].msg);
    return { key: c.key, title: c.title, messages: messages };
  }

  function subscribe(fn) {
    listeners.push(fn);
    return function unsubscribe() {
      const i = listeners.indexOf(fn);
      if (i !== -1) listeners.splice(i, 1);
    };
  }

  return {
    add: add,
    addMany: addMany,
    list: list,
    get: get,
    markRead: markRead,
    totalUnread: totalUnread,
    subscribe: subscribe,
    size: function () { return total; },
  };
}
