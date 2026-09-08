import { connect, toWsUrl } from '../lib/ws.js';
import { getBridgeConfig, DEFAULTS } from '../config.js';
import { formatLastMessage } from '../lib/format.js';

export function render(root, ctx) {
  root.innerHTML =
    '<header class="titlebar">tell</header>' +
    '<main id="body">' +
      '<p id="status">connecting…</p>' +
      '<p id="signal">signal: —</p>' +
      '<p id="last">last: —</p>' +
    '</main>' +
    '<footer class="softkeys">' +
      '<span class="sk-left">settings</span>' +
      '<span class="sk-center">retry</span>' +
      '<span class="sk-right">exit</span>' +
    '</footer>';

  const status = root.querySelector('#status');
  const signal = root.querySelector('#signal');
  const last = root.querySelector('#last');
  function setStatus(text) { status.textContent = text; }
  function setSignal(text) { signal.textContent = 'signal: ' + text; }
  function setLast(text) { last.textContent = 'last: ' + text; }

  let currentWs = null;

  function onServerEvent(msg) {
    if (msg && msg.type === 'signal.status') {
      setSignal(msg.status + (msg.message ? ' (' + msg.message + ')' : ''));
    } else if (msg && msg.type === 'signal.message') {
      // First pass: only the most recent message, one line. A real
      // conversation list is a later slice.
      setLast(formatLastMessage(msg));
    }
  }

  async function probe() {
    if (currentWs) { try { currentWs.close(); } catch (_) {} currentWs = null; }
    const cfg = getBridgeConfig();
    if (!cfg) {
      setStatus('no bridge config.');
      return;
    }
    setStatus('connecting…');
    setSignal('—');
    setLast('—');
    try {
      const res = await connect({
        url: toWsUrl(cfg.url),
        token: cfg.token,
        timeoutMs: DEFAULTS.requestTimeoutMs,
        onEvent: onServerEvent,
      });
      currentWs = res.ws;
      const service = res.hello && res.hello.service ? res.hello.service : 'unknown';
      setStatus('connected via ws: ' + service);
      currentWs.onclose = function () {
        setStatus('disconnected. press center to retry.');
        currentWs = null;
      };
    } catch (err) {
      setStatus('error: ' + err.message);
    }
  }

  function onKey(e) {
    if (e.key === 'Enter') { probe(); e.preventDefault(); return; }
    if (e.key === 'SoftLeft') { ctx.navigate('settings'); e.preventDefault(); return; }
    if (e.key === 'SoftRight' || e.key === 'Backspace') {
      if (typeof window.close === 'function') window.close();
      e.preventDefault();
    }
  }

  document.addEventListener('keydown', onKey);
  probe();

  return {
    detach: function () {
      document.removeEventListener('keydown', onKey);
      if (currentWs) { try { currentWs.close(); } catch (_) {} currentWs = null; }
    },
  };
}
