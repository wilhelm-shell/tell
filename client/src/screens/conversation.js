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
    // Single-line input on purpose: on KaiOS the center key is Enter, and
    // in a <textarea> that inserts a newline instead of reaching us.
    '<div id="compose" class="compose" hidden>' +
      '<input id="reply" type="text" maxlength="2000">' +
      '<p id="compose-err" class="compose-err"></p>' +
    '</div>' +
    '<footer class="softkeys">' +
      '<span class="sk-left" id="sk-left">Reply</span>' +
      '<span class="sk-center"></span>' +
      '<span class="sk-right" id="sk-right">Back</span>' +
    '</footer>';

  const title = root.querySelector('#title');
  const msgs = root.querySelector('#msgs');
  const compose = root.querySelector('#compose');
  const input = root.querySelector('#reply');
  const composeErr = root.querySelector('#compose-err');
  const skLeft = root.querySelector('#sk-left');
  const skRight = root.querySelector('#sk-right');

  // Messages are the focus stops: Up/Down walks them, and nav.js scrolls
  // the focused one into view. That is how a D-pad scrolls a long list.
  const ring = attachFocusRing(msgs);
  let shownCount = -1;
  let composing = false;
  let sending = false;

  // A conversation opened from the picker has no messages yet; the title
  // comes from the picker until the first send creates it in the store.
  const paramTitle = ctx.params && ctx.params.title ? ctx.params.title : null;

  function currentConv() {
    return app.store.get(key) || (paramTitle ? { key: key, title: paramTitle, messages: [] } : null);
  }

  function renderMessages() {
    const conv = currentConv();
    if (!conv) {
      title.textContent = 'tell';
      msgs.innerHTML = '<li class="empty">This conversation is no longer in memory.</li>';
      shownCount = 0;
      return;
    }
    if (conv.messages.length === 0) {
      title.textContent = conv.title;
      msgs.innerHTML = '<li class="empty">No messages yet. Press Reply to write the first one.</li>';
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
      let reactions = '';
      if (m.reactions && m.reactions.length > 0) {
        const parts = [];
        for (let j = 0; j < m.reactions.length; j++) {
          parts.push(escapeHtml(m.reactions[j].emoji + ' ' + m.reactions[j].byName));
        }
        reactions = '<div class="msg-reactions">' + parts.join(' · ') + '</div>';
      }
      html +=
        '<li class="msg' + (m.direction === 'out' ? ' msg-out' : '') + '" data-focusable>' +
          '<div class="msg-head">' + escapeHtml(who) + ' · ' + escapeHtml(formatTime(m.timestamp)) + '</div>' +
          '<div class="msg-text">' + escapeHtml(body) + '</div>' +
          reactions +
        '</li>';
    }
    msgs.innerHTML = html;
    shownCount = shown.length;
    // List items are not focusable elements, so this never steals the
    // caret from the reply input while composing.
    ring.focusAt(followTail ? shown.length - 1 : Math.min(prev, shown.length - 1));
    // On screen means read. markRead notifies the store only when the
    // mark actually moved, so this does not loop back into renderMessages.
    app.store.markRead(key);
  }

  function setSoftkeys(left, right) {
    skLeft.textContent = left;
    skRight.textContent = right;
  }

  function startCompose() {
    composing = true;
    composeErr.textContent = '';
    compose.hidden = false;
    ring.setEnabled(false);
    setSoftkeys('Send', 'Cancel');
    input.focus();
  }

  function stopCompose() {
    composing = false;
    sending = false;
    input.disabled = false;
    input.value = '';
    composeErr.textContent = '';
    compose.hidden = true;
    input.blur();
    ring.setEnabled(true);
    ring.focusAt(Math.max(ring.currentIndex(), 0));
    setSoftkeys('Reply', 'Back');
  }

  function send() {
    if (sending) return;
    const text = input.value.trim();
    if (!text) return;
    const conv = currentConv();
    if (!conv) { composeErr.textContent = 'conversation gone'; return; }
    sending = true;
    input.disabled = true;
    composeErr.textContent = '';
    setSoftkeys('Sending…', 'Cancel');
    app.sendMessage(conv, text).then(function () {
      stopCompose();
    }, function (err) {
      // Keep the text so a retry is one key press.
      sending = false;
      input.disabled = false;
      composeErr.textContent = 'Not sent: ' + err.message;
      setSoftkeys('Send', 'Cancel');
      input.focus();
    });
  }

  const unsubStore = app.store.subscribe(renderMessages);

  function back() {
    ctx.navigate('conversations', { focusKey: key });
  }

  function onKey(e) {
    if (composing) {
      if (e.key === 'Enter' || e.key === 'SoftLeft') { send(); e.preventDefault(); return; }
      if (e.key === 'SoftRight') { stopCompose(); e.preventDefault(); return; }
      // Backspace edits the text; only on an empty field does it cancel,
      // which is the KaiOS convention.
      if (e.key === 'Backspace' && input.value === '') { stopCompose(); e.preventDefault(); }
      return;
    }
    if (e.key === 'SoftLeft') { startCompose(); e.preventDefault(); return; }
    if (e.key === 'SoftRight' || e.key === 'Backspace') { back(); e.preventDefault(); return; }
    if (e.key === 'Enter') { e.preventDefault(); }
  }

  document.addEventListener('keydown', onKey);
  renderMessages();
  if (ctx.params && ctx.params.compose) startCompose();

  return {
    detach: function () {
      unsubStore();
      ring.detach();
      document.removeEventListener('keydown', onKey);
    },
  };
}
