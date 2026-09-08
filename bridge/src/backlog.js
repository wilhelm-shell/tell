// Bounded in-memory ring of the most recent WS frames, replayed to a
// client right after it authenticates. Exists because the phone kills the
// app in the background: without it every reopen starts with an empty
// list. cap <= 0 disables the buffer entirely (the CLAUDE.md "switch to
// disable persistence"), file included.
//
// Plaintext lives here by design (E2E terminates on the bridge), but it
// stays in this process's memory, the optional store's file, and is never
// logged.
//
// `store` (optional): { load(): frame[], save(frame[]): Promise }. Loaded
// once at start; saved after every push. Saves are serialised and
// coalesced: while one is in flight, further pushes only mark the buffer
// dirty and a single write follows, so a burst costs one extra write.
export function createBacklog(cap, store, opts) {
  const limit = Number.isFinite(cap) && cap > 0 ? Math.floor(cap) : 0;
  const onError = opts && typeof opts.onError === 'function' ? opts.onError : null;
  const items = [];
  let inFlight = null;
  let dirty = false;
  let loaded = 0;

  if (store && limit > 0) {
    const fromDisk = store.load();
    for (const f of fromDisk.slice(-limit)) items.push(f);
    loaded = items.length;
  }

  function persist() {
    if (!store || limit === 0) return;
    if (inFlight) { dirty = true; return; }
    inFlight = store.save(items.slice())
      .catch((e) => { if (onError) onError(e); })
      .then(() => {
        inFlight = null;
        if (dirty) { dirty = false; persist(); }
      });
  }

  return {
    push(frame) {
      if (limit === 0) return;
      items.push(frame);
      if (items.length > limit) items.shift();
      persist();
    },
    // Oldest first, so a client can apply them in order.
    list() { return items.slice(); },
    // Resolves once every pending write has hit the store (tests, shutdown).
    async flush() { while (inFlight) await inFlight; },
    get size() { return items.length; },
    get cap() { return limit; },
    get loaded() { return loaded; },
  };
}
