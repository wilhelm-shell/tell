import { attachFocusRing } from '../lib/nav.js';
import { formatPreview, formatTime, escapeHtml } from '../lib/format.js';
import * as app from '../app.js';

// Never put more rows in the DOM than this; the screen shows ~6 at once.
const MAX_ROWS = 30;
// data-key of the fixed first row that opens the recipient picker.
const NEW_KEY = '__new__';

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

// Dot colour class for the title bar. Mirrors statusWord; the word is
// always shown too.
function statusDot(s) {
  if (s.conn === 'connecting') return 'dot-warn';
  if (s.conn === 'error' || s.conn === 'disconnected') return 'dot-err';
  if (s.conn !== 'connected') return 'dot-off';
  const sig = s.signal;
  if (sig.indexOf('ready') === 0) return 'dot-ok';
  if (sig.indexOf('starting') === 0 || sig.indexOf('retrying') === 0) return 'dot-warn';
  if (sig.indexOf('disabled') === 0) return 'dot-off';
  return 'dot-err';
}

export function render(root, ctx) {
  root.innerHTML =
    '<header class="titlebar"><span class="dot" id="dot"></span><span id="title">Tell</span></header>' +
    '<main id="body">' +
      '<p id="status" class="empty"></p>' +
      '<ul id="list" class="rows"></ul>' +
    '</main>' +
    '<footer class="softkeys">' +
      '<span class="sk-left">Settings</span>' +
      '<span class="sk-center" id="sk-center"></span>' +
      '<span class="sk-right">Exit</span>' +
    '</footer>';

  const dot = root.querySelector('#dot');
  const title = root.querySelector('#title');
  const status = root.querySelector('#status');
  const list = root.querySelector('#list');
  const skCenter = root.querySelector('#sk-center');
  const ring = attachFocusRing(list);
  // Coming back from a conversation: land on the row we left, not row 0.
  let pendingFocusKey = ctx.params && ctx.params.focusKey ? ctx.params.focusKey : null;

  function renderStatus(s) {
    const unread = app.store.totalUnread();
    title.textContent = 'Tell' + (unread > 0 ? ' (' + unread + ')' : '') + ' · ' + statusWord(s);
    dot.className = 'dot ' + statusDot(s);
    if (s.conn === 'connected') {
      status.textContent = '';
      status.hidden = true;
    } else {
      status.hidden = false;
      status.textContent = s.conn === 'error' ? 'Could not reach the bridge: ' + s.detail + '. Press the centre key to retry.'
        : s.conn === 'no-config' ? 'No bridge configured yet. Open Settings with the left softkey.'
        : s.conn === 'disconnected' ? 'Connection lost. Press the centre key to retry.'
        : 'Connecting to the bridge…';
    }
    skCenter.textContent = app.isConnected() ? 'Open' : 'Retry';
  }

  function renderList() {
    const rows = app.store.list(MAX_ROWS);
    renderStatus(app.getState());   // the title bar carries the unread total
    // Remember which row is focused, then rebuild. The newest conversation
    // moves to the top, so the index may point at a different row after
    // a burst; acceptable for a list this short.
    let focused = ring.currentIndex();
    // Row 0 is always "new message", so a conversation at index i in the
    // store sits at DOM index i + 1.
    let html = '<li class="row row-new" data-focusable data-key="' + NEW_KEY + '">+ New message</li>';
    if (rows.length === 0) {
      html += '<li class="empty">No conversations yet. Incoming messages appear here.</li>';
    }
    for (let i = 0; i < rows.length; i++) {
      const r = rows[i];
      if (pendingFocusKey && r.key === pendingFocusKey) { focused = i + 1; pendingFocusKey = null; }
      html +=
        '<li class="row' + (r.unread > 0 ? ' unread' : '') + '" data-focusable data-key="' + escapeHtml(r.key) + '">' +
          '<div class="row-top">' +
            '<span class="row-title">' + escapeHtml(r.title) + '</span>' +
            (r.unread > 0 ? '<span class="row-unread">' + r.unread + '</span>' : '') +
            '<span class="row-time">' + escapeHtml(formatTime(r.last.timestamp)) + '</span>' +
          '</div>' +
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
        if (key === NEW_KEY) ctx.navigate('newMessage');
        else if (key) ctx.navigate('conversation', { key: key });
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
