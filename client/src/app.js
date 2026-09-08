// App-level state that must outlive screens: the bridge connection and
// the message store. Screens read it, subscribe to changes, and render;
// they never own the socket. Without this, navigating to settings and
// back would drop the connection and every message received so far.
import { connect, toWsUrl } from './lib/ws.js';
import { getBridgeConfig, DEFAULTS } from './config.js';
import { createStore, parseKey } from './lib/store.js';
import { loadLastRead, saveLastRead } from './lib/readState.js';
import { reconnectDelay } from './lib/backoff.js';

export const store = createStore({
  cap: DEFAULTS.messageCacheCap,
  lastRead: loadLastRead(),
  onLastRead: saveLastRead,
});

// conn: 'idle' | 'no-config' | 'connecting' | 'connected' | 'disconnected' | 'error'
const state = { conn: 'idle', detail: '', signal: '—' };
const listeners = [];
let ws = null;

// Requests in flight, by id. The bridge answers with a `reply` frame that
// carries the same id (see server.js handleRequest).
const pending = {};
let nextRequestId = 1;

// Automatic reconnect: only while the app is visible, with a capped
// backoff (see lib/backoff.js). A deliberate close never schedules one.
let retryTimer = null;
let retryAttempt = 0;

export function getState() { return state; }

export function subscribe(fn) {
  listeners.push(fn);
  return function () {
    const i = listeners.indexOf(fn);
    if (i !== -1) listeners.splice(i, 1);
  };
}

function set(patch) {
  for (const k in patch) state[k] = patch[k];
  for (let i = 0; i < listeners.length; i++) {
    try { listeners[i](state); } catch (_) {}
  }
}

function settle(id, err, result) {
  const p = pending[id];
  if (!p) return;
  delete pending[id];
  clearTimeout(p.timer);
  if (err) p.reject(err); else p.resolve(result);
}

function failAllPending(reason) {
  for (const id in pending) settle(id, new Error(reason));
}

function onServerEvent(msg) {
  if (!msg) return;
  if (msg.type === 'signal.status') {
    set({ signal: msg.status + (msg.message ? ' (' + msg.message + ')' : '') });
  } else if (msg.type === 'signal.message') {
    store.add(msg);
  } else if (msg.type === 'signal.reaction') {
    store.applyReaction(msg);
  } else if (msg.type === 'signal.backlog' && Array.isArray(msg.messages)) {
    // History replayed by the bridge right after auth; the store drops
    // anything it already has (reconnects replay the same backlog).
    // Messages first, then reactions, so every target already exists.
    const messages = [];
    const reactions = [];
    for (let i = 0; i < msg.messages.length; i++) {
      const f = msg.messages[i];
      if (f && f.type === 'signal.reaction') reactions.push(f); else messages.push(f);
    }
    store.addMany(messages);
    for (let i = 0; i < reactions.length; i++) store.applyReaction(reactions[i]);
  } else if (msg.type === 'reply') {
    settle(msg.id, msg.ok ? null : new Error(msg.error || 'bridge error'), msg.result);
  }
}

function isVisible() {
  // Feature-detected: if the Page Visibility API is missing, assume visible.
  return typeof document === 'undefined' || typeof document.hidden !== 'boolean' || !document.hidden;
}

function cancelRetry() {
  if (retryTimer !== null) { clearTimeout(retryTimer); retryTimer = null; }
}

function scheduleRetry() {
  cancelRetry();
  if (!isVisible()) return;
  const delay = reconnectDelay(retryAttempt++);
  retryTimer = setTimeout(function () {
    retryTimer = null;
    if (isVisible() && !isConnected()) connectBridge({ auto: true });
  }, delay);
}

export function disconnectBridge() {
  cancelRetry();
  if (ws) {
    // Our own close: detach the handler first so it is not mistaken for
    // a dropped connection and retried.
    ws.onclose = null;
    try { ws.close(); } catch (_) {}
    ws = null;
  }
  failAllPending('disconnected');
}

// opts.auto: called by the retry timer; a manual call resets the backoff.
export async function connectBridge(opts) {
  const auto = !!(opts && opts.auto);
  disconnectBridge();
  if (!auto) retryAttempt = 0;
  const cfg = getBridgeConfig();
  if (!cfg) { set({ conn: 'no-config', detail: '', signal: '—' }); return; }
  set({ conn: 'connecting', detail: '', signal: '—' });
  try {
    const res = await connect({
      url: toWsUrl(cfg.url),
      token: cfg.token,
      timeoutMs: DEFAULTS.requestTimeoutMs,
      onEvent: onServerEvent,
    });
    ws = res.ws;
    retryAttempt = 0;
    ws.onclose = function () {
      ws = null;
      failAllPending('disconnected');
      set({ conn: 'disconnected', detail: '', signal: '—' });
      scheduleRetry();
    };
    set({ conn: 'connected', detail: res.hello && res.hello.service ? res.hello.service : '' });
  } catch (err) {
    set({ conn: 'error', detail: err.message, signal: '—' });
    scheduleRetry();
  }
}

export function isConnected() { return state.conn === 'connected' || state.conn === 'connecting'; }

// The CLAUDE.md lifecycle rule: the app is killed or frozen in the
// background, so reconnect whenever it comes back to the foreground.
if (typeof document !== 'undefined' && typeof document.addEventListener === 'function') {
  document.addEventListener('visibilitychange', function () {
    if (isVisible()) {
      if (!isConnected()) connectBridge();
    } else {
      cancelRetry();
    }
  });
}

// Send a request frame and resolve with the bridge's reply result.
export function request(type, fields) {
  return new Promise(function (resolve, reject) {
    if (!ws || state.conn !== 'connected') { reject(new Error('not connected')); return; }
    const id = 'c' + nextRequestId++;
    const frame = { type: type, id: id };
    for (const k in fields) frame[k] = fields[k];
    const timer = setTimeout(function () { settle(id, new Error('timeout')); }, DEFAULTS.requestTimeoutMs);
    pending[id] = { resolve: resolve, reject: reject, timer: timer };
    try { ws.send(JSON.stringify(frame)); }
    catch (e) { settle(id, e); }
  });
}

// Recipient directory for the picker: [{ kind, id, name }], sorted.
export function loadContacts() {
  return request('signal.contacts', {}).then(function (res) {
    return res && Array.isArray(res.entries) ? res.entries : [];
  });
}

// Send into a conversation ({ key, title }); it need not exist in the
// store yet. The bridge broadcasts the resulting signal.message itself,
// which is what creates the conversation, so nothing is added here.
export function sendMessage(conv, text) {
  const target = parseKey(conv.key);
  const fields = { text: text };
  if (target.group) { fields.group = target.group; fields.groupName = conv.title; }
  else fields.peer = target.peer;
  return request('signal.send', fields);
}
