// Persistence for the per-conversation read marks: one small JSON value
// in localStorage (at most ~100 keys, see store.js). Every access is
// guarded: on this platform localStorage can be missing, full, or throw.
const KEY = 'tell.lastRead';

export function loadLastRead() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch (_) {
    return {};
  }
}

export function saveLastRead(map) {
  try { localStorage.setItem(KEY, JSON.stringify(map)); } catch (_) {}
}
