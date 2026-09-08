import { attachFocusRing } from '../lib/nav.js';
import { escapeHtml, messageBody, formatTime } from '../lib/format.js';
import * as app from '../app.js';

// Only the tail of a conversation is rendered; the store's global cap is
// 200 anyway, and the screen shows a handful of messages at once.
const MAX_MESSAGES = 50;

export function render(root, ctx) {
  const key = ctx.params && ctx.params.key;

  root.innerHTML =
    '<header class="titlebar" id="title">tell</header>' +
    '<main id="body">' +
      '<ul id="msgs" class="msgs"></ul>' +
    '</main>' +
    '<footer class="softkeys">' +
      '<span class="sk-left"></span>' +
      '<span class="sk-center"></span>' +
      '<span class="sk-right">back</span>' +
    '</footer>';

  const title = root.querySelector('#title');
  const msgs = root.querySelector('#msgs');
  // Messages are the focus stops: Up/Down walks them, and nav.js scrolls
  // the focused one into view. That is how a D-pad scrolls a long list.
  const ring = attachFocusRing(msgs);
  let shownCount = -1;

  function renderMessages() {
    const conv = app.store.get(key);
    if (!conv) {
      title.textContent = 'tell';
      msgs.innerHTML = '<li class="muted">conversation gone</li>';
      shownCount = 0;
      return;
    }
    title.textContent = conv.title;
    const shown = conv.messages.slice(-MAX_MESSAGES);

    // First render, or the focus was on the newest message: stay at the
    // bottom so new arrivals are seen. Otherwise keep the reading position.
    const prev = ring.currentIndex();
    const followTail = shownCount < 0 || prev === shownCount - 1;

    let html = '';
    for (let i = 0; i < shown.length; i++) {
      const m = shown[i];
      const who = m.direction === 'out' ? 'me' : (m.sourceName || m.source || '?');
      // Keep line breaks in the full view (CSS pre-wrap); only attachment
      // placeholders come from messageBody.
      const body = m.text ? m.text : messageBody(m);
      html +=
        '<li class="msg' + (m.direction === 'out' ? ' msg-out' : '') + '" data-focusable>' +
          '<div class="msg-head">' + escapeHtml(who) + ' · ' + escapeHtml(formatTime(m.timestamp)) + '</div>' +
          '<div class="msg-text">' + escapeHtml(body) + '</div>' +
        '</li>';
    }
    msgs.innerHTML = html;
    shownCount = shown.length;
    ring.focusAt(followTail ? shown.length - 1 : Math.min(prev, shown.length - 1));
  }

  const unsubStore = app.store.subscribe(renderMessages);

  function back() {
    ctx.navigate('conversations', { focusKey: key });
  }

  function onKey(e) {
    if (e.key === 'SoftRight' || e.key === 'Backspace') { back(); e.preventDefault(); return; }
    if (e.key === 'Enter') { e.preventDefault(); }
  }

  document.addEventListener('keydown', onKey);
  renderMessages();

  return {
    detach: function () {
      unsubStore();
      ring.detach();
      document.removeEventListener('keydown', onKey);
    },
  };
}
