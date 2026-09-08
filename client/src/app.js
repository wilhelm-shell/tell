// App-level state that must outlive screens: the bridge connection and
// the message store. Screens read it, subscribe to changes, and render;
// they never own the socket. Without this, navigating to settings and
// back would drop the connection and every message received so far.
import { connect, toWsUrl } from './lib/ws.js';
import { getBridgeConfig, DEFAULTS } from './config.js';
import { createStore, parseKey } from './lib/store.js';

export const store = createStore({ cap: DEFAULTS.messageCacheCap });

// conn: 'idle' | 'no-config' | 'connecting' | 'connected' | 'disconnected' | 'error'
const state = { conn: 'idle', detail: '', signal: '—' };
const listeners = [];
let ws = null;

// Requests in flight, by id. The bridge answers with a `reply` frame that
// carries the same id (see server.js handleRequest).
const pending = {};
let nextRequestId = 1;

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
  } else if (msg.type === 'signal.backlog' && Array.isArray(msg.messages)) {
    // History replayed by the bridge right after auth; the store drops
    // anything it already has (reconnects replay the same backlog).
    store.addMany(msg.messages);
  } else if (msg.type === 'reply') {
    settle(msg.id, msg.ok ? null : new Error(msg.error || 'bridge error'), msg.result);
  }
}

export function disconnectBridge() {
  if (ws) { try { ws.close(); } catch (_) {} ws = null; }
  failAllPending('disconnected');
}

export async function connectBridge() {
  disconnectBridge();
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
    ws.onclose = function () {
      ws = null;
      failAllPending('disconnected');
      set({ conn: 'disconnected', detail: '', signal: '—' });
    };
    set({ conn: 'connected', detail: res.hello && res.hello.service ? res.hello.service : '' });
  } catch (err) {
    set({ conn: 'error', detail: err.message, signal: '—' });
  }
}

export function isConnected() { return state.conn === 'connected' || state.conn === 'connecting'; }

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

// Reply into a conversation from the store. The bridge broadcasts the
// resulting signal.message itself, so nothing is added to the store here.
export function sendMessage(conv, text) {
  const target = parseKey(conv.key);
  const fields = { text: text };
  if (target.group) { fields.group = target.group; fields.groupName = conv.title; }
  else fields.peer = target.peer;
  return request('signal.send', fields);
}
