import { attachFocusRing } from '../lib/nav.js';
import { getBridgeConfig, setBridgeConfig } from '../config.js';
import { loadTheme, saveTheme, applyTheme, nextTheme } from '../lib/theme.js';

function escapeAttr(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;');
}

function themeLabel(t) {
  return t === 'dark' ? 'Dark' : 'Light';
}

export function render(root, ctx) {
  const cfg = getBridgeConfig() || { url: '', token: '' };
  let theme = loadTheme();

  root.innerHTML =
    '<header class="titlebar">Settings</header>' +
    '<main id="body">' +
      '<div class="settings-field">' +
        '<label for="fld-url">bridge url</label>' +
        '<input id="fld-url" type="url" data-focusable value="' + escapeAttr(cfg.url) + '">' +
      '</div>' +
      '<div class="settings-field">' +
        '<label for="fld-token">token</label>' +
        '<input id="fld-token" type="password" data-focusable value="' + escapeAttr(cfg.token) + '">' +
      '</div>' +
      // Not an input: Left/Right flip it, it applies at once and is saved
      // on its own, so the centre key keeps meaning "save the bridge".
      '<div class="settings-field">' +
        '<label>theme</label>' +
        '<div id="fld-theme" class="choice" data-focusable></div>' +
      '</div>' +
      '<p class="hint">Bridge address and bearer token, as in bridge/.env. Centre saves. Left/Right change the theme.</p>' +
    '</main>' +
    '<footer class="softkeys">' +
      '<span class="sk-left"></span>' +
      '<span class="sk-center">Save</span>' +
      '<span class="sk-right">Back</span>' +
    '</footer>';

  const urlInput = root.querySelector('#fld-url');
  const tokenInput = root.querySelector('#fld-token');
  const themeField = root.querySelector('#fld-theme');
  const ring = attachFocusRing(root.querySelector('main'));

  function renderTheme() {
    themeField.textContent = '◂ ' + themeLabel(theme) + ' ▸';
  }
  renderTheme();

  function save() {
    const url = urlInput.value.trim();
    const token = tokenInput.value.trim();
    if (!url || !token) return;
    setBridgeConfig(url, token);
    ctx.navigate('conversations');
  }

  function onKey(e) {
    if ((e.key === 'ArrowLeft' || e.key === 'ArrowRight') && themeField.classList.contains('focused')) {
      theme = nextTheme(theme);   // two themes: either direction flips
      applyTheme(theme);
      saveTheme(theme);
      renderTheme();
      e.preventDefault();
      return;
    }
    if (e.key === 'Enter') { save(); e.preventDefault(); return; }
    if (e.key === 'SoftRight' || e.key === 'Backspace') {
      // Backspace inside a text field edits it; only an empty one goes back.
      const el = document.activeElement;
      if (e.key === 'Backspace' && el && el.tagName === 'INPUT' && el.value !== '') return;
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
