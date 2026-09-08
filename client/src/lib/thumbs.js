// In-memory cache of thumbnail blob URLs, keyed by attachment id.
//
// Bounded (CLAUDE.md memory rule): past `max` entries the oldest URL is
// revoked, which frees the blob. Fetches run one at a time so a burst of
// bubbles does not open a dozen XHRs on a phone with one radio. Pure
// apart from the injected fetch/createUrl/revokeUrl, so it is tested.
export function createThumbCache(opts) {
  const max = opts.max || 30;
  const fetchBlob = opts.fetch;
  const createUrl = opts.createUrl;
  const revokeUrl = opts.revokeUrl;
  const entries = new Map();   // id -> { url, promise }; insertion order = age
  let queue = Promise.resolve();

  function enqueue(fn) {
    const p = queue.then(fn, fn);
    queue = p.then(noop, noop);
    return p;
  }

  function evict() {
    while (entries.size > max) {
      const oldest = entries.keys().next().value;
      const e = entries.get(oldest);
      entries.delete(oldest);
      if (e.url) { try { revokeUrl(e.url); } catch (_) {} }
    }
  }

  // Resolves with a blob URL for the thumbnail. Repeated calls for the
  // same id share one fetch; a failed fetch is forgotten so it can retry.
  function get(id) {
    const hit = entries.get(id);
    if (hit) return hit.promise;
    const entry = { url: null, promise: null };
    entry.promise = enqueue(function () { return fetchBlob(id); }).then(function (blob) {
      if (!entries.has(id)) { const u = createUrl(blob); try { revokeUrl(u); } catch (_) {} return null; }  // evicted meanwhile
      entry.url = createUrl(blob);
      return entry.url;
    }, function (err) {
      entries.delete(id);
      throw err;
    });
    entries.set(id, entry);
    evict();
    return entry.promise;
  }

  return { get: get, size: function () { return entries.size; } };
}

function noop() {}
