import { attachFocusRing } from '../lib/nav.js';
import { getBridgeConfig, setBridgeConfig } from '../config.js';

function escapeAttr(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;');
}

export function render(root, ctx) {
  const cfg = getBridgeConfig() || { url: '', token: '' };
  root.innerHTML =
    '<header class="titlebar">settings</header>' +
    '<main id="body">' +
      '<div class="settings-field">' +
        '<label for="fld-url">bridge url</label>' +
        '<input id="fld-url" type="url" data-focusable value="' + escapeAttr(cfg.url) + '">' +
      '</div>' +
      '<div class="settings-field">' +
        '<label for="fld-token">token</label>' +
        '<input id="fld-token" type="password" data-focusable value="' + escapeAttr(cfg.token) + '">' +
      '</div>' +
    '</main>' +
    '<footer class="softkeys">' +
      '<span class="sk-left"></span>' +
      '<span class="sk-center">save</span>' +
      '<span class="sk-right">back</span>' +
    '</footer>';

  const urlInput = root.querySelector('#fld-url');
  const tokenInput = root.querySelector('#fld-token');
  const ring = attachFocusRing(root.querySelector('main'));

  function save() {
    const url = urlInput.value.trim();
    const token = tokenInput.value.trim();
    if (!url || !token) return;
    setBridgeConfig(url, token);
    ctx.navigate('conversations');
  }

  function onKey(e) {
    if (e.key === 'Enter') { save(); e.preventDefault(); return; }
    if (e.key === 'SoftRight' || e.key === 'Backspace') {
      // If a config already exists, go back to the list. Otherwise exit
      // the app so the user is never trapped on a mandatory-save screen.
      if (getBridgeConfig()) {
        ctx.navigate('conversations');
      } else if (typeof window.close === 'function') {
        window.close();
      }
      e.preventDefault();
    }
  }

  document.addEventListener('keydown', onKey);

  return {
    detach: function () {
      ring.detach();
      document.removeEventListener('keydown', onKey);
    },
  };
}
