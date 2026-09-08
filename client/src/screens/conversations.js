import { attachFocusRing } from '../lib/nav.js';
import { formatPreview, escapeHtml } from '../lib/format.js';
import * as app from '../app.js';

// Never put more rows in the DOM than this; the screen shows ~6 at once.
const MAX_ROWS = 30;

function statusWord(s) {
  switch (s.conn) {
    case 'connected': return s.signal;
    case 'connecting': return 'connecting…';
    case 'no-config': return 'no config';
    case 'disconnected': return 'disconnected';
    case 'error': return 'error';
    default: return '—';
  }
}

export function render(root, ctx) {
  root.innerHTML =
    '<header class="titlebar" id="title">tell</header>' +
    '<main id="body">' +
      '<p id="status" class="muted"></p>' +
      '<ul id="list" class="rows"></ul>' +
    '</main>' +
    '<footer class="softkeys">' +
      '<span class="sk-left">settings</span>' +
      '<span class="sk-center" id="sk-center"></span>' +
      '<span class="sk-right">exit</span>' +
    '</footer>';

  const title = root.querySelector('#title');
  const status = root.querySelector('#status');
  const list = root.querySelector('#list');
  const skCenter = root.querySelector('#sk-center');
  const ring = attachFocusRing(list);
  // Coming back from a conversation: land on the row we left, not row 0.
  let pendingFocusKey = ctx.params && ctx.params.focusKey ? ctx.params.focusKey : null;

  function renderStatus(s) {
    title.textContent = 'tell · ' + statusWord(s);
    if (s.conn === 'connected') {
      status.textContent = '';
      status.hidden = true;
    } else {
      status.hidden = false;
      status.textContent = s.conn === 'error' ? 'error: ' + s.detail
        : s.conn === 'no-config' ? 'no bridge config.'
        : s.conn === 'disconnected' ? 'disconnected. press center to retry.'
        : 'connecting…';
    }
    skCenter.textContent = app.isConnected() ? 'open' : 'retry';
  }

  function renderList() {
    const rows = app.store.list(MAX_ROWS);
    if (rows.length === 0) {
      list.innerHTML = '<li class="muted">no messages yet</li>';
      return;
    }
    // Remember which row is focused, then rebuild. The newest conversation
    // moves to the top, so the index may point at a different row after
    // a burst; acceptable for a list this short.
    let focused = ring.currentIndex();
    let html = '';
    for (let i = 0; i < rows.length; i++) {
      const r = rows[i];
      if (pendingFocusKey && r.key === pendingFocusKey) { focused = i; pendingFocusKey = null; }
      html +=
        '<li class="row" data-focusable data-key="' + escapeHtml(r.key) + '">' +
          '<div class="row-title">' + escapeHtml(r.title) + '</div>' +
          '<div class="row-preview">' + escapeHtml(formatPreview(r.last)) + '</div>' +
        '</li>';
    }
    list.innerHTML = html;
    ring.focusAt(focused < 0 ? 0 : focused);
  }

  const unsubState = app.subscribe(renderStatus);
  const unsubStore = app.store.subscribe(renderList);

  function onKey(e) {
    if (e.key === 'Enter') {
      if (!app.isConnected()) {
        app.connectBridge();
      } else {
        const row = list.querySelector('.focused');
        const key = row ? row.getAttribute('data-key') : null;
        if (key) ctx.navigate('conversation', { key: key });
      }
      e.preventDefault();
      return;
    }
    if (e.key === 'SoftLeft') { ctx.navigate('settings'); e.preventDefault(); return; }
    if (e.key === 'SoftRight' || e.key === 'Backspace') {
      if (typeof window.close === 'function') window.close();
      e.preventDefault();
    }
  }

  document.addEventListener('keydown', onKey);
  renderStatus(app.getState());
  renderList();
  if (!app.isConnected()) app.connectBridge();

  return {
    detach: function () {
      unsubState();
      unsubStore();
      ring.detach();
      document.removeEventListener('keydown', onKey);
    },
  };
}
