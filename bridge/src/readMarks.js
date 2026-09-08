// Read state, kept on the bridge so it survives reinstalling the phone
// app (a reinstall gets a new origin and empty localStorage) and is shared
// by every client. One number per conversation: the timestamp of the
// newest message known to be read. Same key scheme as the client store:
// 'g:<groupId>' or 'p:<peer>'.
//
// Marks move forward from three sources: the phone opening a conversation
// (signal.markRead request), anything we sent from any device, and
// Signal's own read sync from the primary phone (readMessages).

export function conversationKey(frame) {
  if (frame.group && frame.group.id) return 'g:' + frame.group.id;
  if (frame.peer) return 'p:' + frame.peer;
  return null;
}

// `store` (optional): { load(): object, save(object): Promise } — the same
// shape as backlogFile's fileStore, but the JSON is an object, not a list.
export function createReadMarks(store, opts) {
  const onError = opts && typeof opts.onError === 'function' ? opts.onError : null;
  const marks = {};
  let inFlight = null;
  let dirty = false;

  if (store) {
    const loaded = store.load();
    if (loaded && typeof loaded === 'object' && !Array.isArray(loaded)) {
      for (const k in loaded) if (typeof loaded[k] === 'number') marks[k] = loaded[k];
    }
  }

  function persist() {
    if (!store) return;
    if (inFlight) { dirty = true; return; }
    inFlight = store.save(Object.assign({}, marks))
      .catch((e) => { if (onError) onError(e); })
      .then(() => {
        inFlight = null;
        if (dirty) { dirty = false; persist(); }
      });
  }

  // Move a mark forward. Returns true when it changed.
  function mark(key, timestamp) {
    if (typeof key !== 'string' || !key || typeof timestamp !== 'number') return false;
    if (!(timestamp > (marks[key] || 0))) return false;
    marks[key] = timestamp;
    persist();
    return true;
  }

  // A Signal read sync names messages by sender + timestamp. Find the
  // conversation through the backlog; an older message falls back to a
  // direct chat with the sender, which is right one-to-one and harmless in
  // a group (a message that old is read anyway).
  function applyReadSync(reads, backlogFrames) {
    const changed = [];
    for (const r of reads) {
      if (!r || typeof r.timestamp !== 'number') continue;
      let key = null;
      for (let i = backlogFrames.length - 1; i >= 0; i--) {
        const f = backlogFrames[i];
        if (f.type === 'signal.message' && f.timestamp === r.timestamp && f.source === r.sender) {
          key = conversationKey(f);
          break;
        }
      }
      if (!key && r.sender) key = 'p:' + r.sender;
      if (key && mark(key, r.timestamp)) changed.push({ key, timestamp: r.timestamp });
    }
    return changed;
  }

  return {
    mark,
    applyReadSync,
    get(key) { return marks[key] || 0; },
    all() { return Object.assign({}, marks); },
    async flush() { while (inFlight) await inFlight; },
  };
}
