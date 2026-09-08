// Bounded in-memory ring of the most recent WS frames, replayed to a
// client right after it authenticates. Exists because the phone kills the
// app in the background: without it every reopen starts with an empty
// list. cap <= 0 disables the buffer (the CLAUDE.md "switch to disable
// persistence"; disk persistence itself is a later slice).
//
// Plaintext lives here by design (E2E terminates on the bridge), but it
// stays in this process's memory and is never logged.
export function createBacklog(cap) {
  const limit = Number.isFinite(cap) && cap > 0 ? Math.floor(cap) : 0;
  const items = [];
  return {
    push(frame) {
      if (limit === 0) return;
      items.push(frame);
      if (items.length > limit) items.shift();
    },
    // Oldest first, so a client can apply them in order.
    list() { return items.slice(); },
    get size() { return items.length; },
    get cap() { return limit; },
  };
}
