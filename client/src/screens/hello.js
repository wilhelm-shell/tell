import { request } from '../lib/http.js';
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

  async function probe() {
    const cfg = getBridgeConfig();
    if (!cfg) {
      setStatus('no bridge config. See src/config.js.');
      return;
    }
    setStatus('connecting…');
    try {
      const res = await request({
        method: 'GET',
        url: cfg.url + '/hello',
        token: cfg.token,
        timeoutMs: DEFAULTS.requestTimeoutMs,
      });
      const service = res.body && res.body.service ? res.body.service : 'unknown';
      setStatus('connected: ' + service);
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
    detach: function () { document.removeEventListener('keydown', onKey); },
  };
}
