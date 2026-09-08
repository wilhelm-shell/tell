// App-level state that must outlive screens: the bridge connection and
// the message store. Screens read it, subscribe to changes, and render;
// they never own the socket. Without this, navigating to settings and
// back would drop the connection and every message received so far.
import { connect, toWsUrl } from './lib/ws.js';
import { getBridgeConfig, DEFAULTS } from './config.js';
import { createStore } from './lib/store.js';

export const store = createStore({ cap: DEFAULTS.messageCacheCap });

// conn: 'idle' | 'no-config' | 'connecting' | 'connected' | 'disconnected' | 'error'
const state = { conn: 'idle', detail: '', signal: '—' };
const listeners = [];
let ws = null;

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
  }
}

export function disconnectBridge() {
  if (ws) { try { ws.close(); } catch (_) {} ws = null; }
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
      set({ conn: 'disconnected', detail: '', signal: '—' });
    };
    set({ conn: 'connected', detail: res.hello && res.hello.service ? res.hello.service : '' });
  } catch (err) {
    set({ conn: 'error', detail: err.message, signal: '—' });
  }
}

export function isConnected() { return state.conn === 'connected' || state.conn === 'connecting'; }
