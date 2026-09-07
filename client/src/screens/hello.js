import { connect, toWsUrl } from '../lib/ws.js';
import { getBridgeConfig, DEFAULTS } from '../config.js';

export function render(root) {
  root.innerHTML =
    '<header class="titlebar">tell</header>' +
    '<main id="body"><p id="status">connecting…</p></main>' +
    '<footer class="softkeys">' +
      '<span class="sk-left"></span>' +
      '<span class="sk-center">retry</span>' +
      '<span class="sk-right">exit</span>' +
    '</footer>';

  const status = root.querySelector('#status');
  function setStatus(text) { status.textContent = text; }

  let currentWs = null;

  async function probe() {
    if (currentWs) { try { currentWs.close(); } catch (_) {} currentWs = null; }
    const cfg = getBridgeConfig();
    if (!cfg) {
      setStatus('no bridge config. See src/config.js.');
      return;
    }
    setStatus('connecting…');
    try {
      const res = await connect({
        url: toWsUrl(cfg.url),
        token: cfg.token,
        timeoutMs: DEFAULTS.requestTimeoutMs,
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
