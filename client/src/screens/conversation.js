import { attachFocusRing } from '../lib/nav.js';
import { escapeHtml, messageBody, formatTime, firstImage, firstVideo } from '../lib/format.js';
import * as app from '../app.js';

// Only the tail of a conversation is rendered; the store's global cap is
// 200 anyway, and the screen shows a handful of messages at once.
const MAX_MESSAGES = 50;

// Signal's default quick reactions. Whether the phone's font draws them
// is verify-on-device; the store treats the emoji as an opaque string.
const REACTIONS = ['👍', '❤️', '😂', '😮', '😢', '🙏'];

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
    // Reaction picker: one row of emoji, Left/Right to choose, Enter sends.
    '<div id="react" class="react" hidden>' +
      '<div id="react-bar" class="react-bar"></div>' +
      '<p id="react-err" class="compose-err"></p>' +
    '</div>' +
    '<footer class="softkeys">' +
      '<span class="sk-left" id="sk-left">Reply</span>' +
      '<span class="sk-center" id="sk-center">React</span>' +
      '<span class="sk-right" id="sk-right">Back</span>' +
    '</footer>';

  const title = root.querySelector('#title');
  const msgs = root.querySelector('#msgs');
  const compose = root.querySelector('#compose');
  const input = root.querySelector('#reply');
  const composeErr = root.querySelector('#compose-err');
  const react = root.querySelector('#react');
  const reactBar = root.querySelector('#react-bar');
  const reactErr = root.querySelector('#react-err');
  const skLeft = root.querySelector('#sk-left');
  const skCenter = root.querySelector('#sk-center');
  const skRight = root.querySelector('#sk-right');

  // Messages are the focus stops: Up/Down walks them, and nav.js scrolls
  // the focused one into view. That is how a D-pad scrolls a long list.
  // The centre key does the primary action of the highlighted message:
  // Open for an image, React for anything else. The label follows focus.
  const ring = attachFocusRing(msgs, { onFocus: updateCenterLabel });
  let shownCount = -1;
  let shown = [];          // messages currently rendered, index = focus index
  let composing = false;
  let sending = false;
  let reacting = null;     // { message, index } while the picker is open
  let reactBusy = false;

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
    shown = conv.messages.slice(-MAX_MESSAGES);

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

  function setSoftkeys(left, right, center) {
    skLeft.textContent = left;
    skRight.textContent = right;
    skCenter.textContent = center == null ? '' : center;
  }

  // --- reactions ------------------------------------------------------------

  function myReaction(message) {
    const list = message.reactions || [];
    for (let i = 0; i < list.length; i++) if (list[i].byName === 'me') return list[i].emoji;
    return null;
  }

  function focusedMessage() {
    const i = ring.currentIndex();
    return i >= 0 && i < shown.length ? shown[i] : null;
  }

  function openable(m) {
    return !!(m && (firstImage(m) || firstVideo(m)));
  }

  function updateCenterLabel() {
    if (composing || reacting) return;
    skCenter.textContent = openable(focusedMessage()) ? 'Open' : 'React';
  }

  function pickerItems() {
    const items = [];
    for (let i = 0; i < REACTIONS.length; i++) items.push({ label: REACTIONS[i], emoji: REACTIONS[i] });
    return items;
  }

  function renderReactBar() {
    const mine = reacting ? myReaction(reacting.message) : null;
    let html = '';
    for (let i = 0; i < reacting.items.length; i++) {
      const it = reacting.items[i];
      const cls = 'react-item'
        + (i === reacting.index ? ' focused' : '')
        + (it.emoji === mine ? ' mine' : '');
      html += '<span class="' + cls + '">' + escapeHtml(it.label) + '</span>';
    }
    reactBar.innerHTML = html;
  }

  function startReact() {
    const message = focusedMessage();
    if (!message) return;
    const items = pickerItems();
    // Start on our current reaction, if any, so Enter toggles it off.
    const mine = myReaction(message);
    let at = 0;
    for (let i = 0; i < items.length; i++) if (mine && items[i].emoji === mine) at = i;
    reacting = { message: message, items: items, index: at };
    reactErr.textContent = '';
    react.hidden = false;
    ring.setEnabled(false);
    setSoftkeys('', 'Cancel', 'Send');
    renderReactBar();
  }

  function openMedia(message) {
    const image = firstImage(message);
    const video = image ? null : firstVideo(message);
    if (!image && !video) return;
    const conv = currentConv();
    ctx.navigate(image ? 'image' : 'video', {
      id: (image || video).id,
      key: key,
      title: conv ? conv.title : (image ? 'Image' : 'Video'),
      // So the viewer can bring us back to this exact message.
      timestamp: message.timestamp,
    });
  }

  // Focus the message with this timestamp, if it is on screen.
  function focusTimestamp(ts) {
    for (let i = 0; i < shown.length; i++) {
      if (shown[i].timestamp === ts) { ring.focusAt(i); return true; }
    }
    return false;
  }

  function stopReact() {
    reacting = null;
    reactBusy = false;
    react.hidden = true;
    reactErr.textContent = '';
    ring.setEnabled(true);
    setSoftkeys('Reply', 'Back', 'React');
    updateCenterLabel();
  }

  function sendReact() {
    if (!reacting || reactBusy) return;
    const item = reacting.items[reacting.index];
    const conv = currentConv();
    if (!conv) return;
    const emoji = item.emoji;
    // Picking the reaction we already have retracts it, as in Signal.
    const remove = myReaction(reacting.message) === emoji;
    reactBusy = true;
    setSoftkeys('', 'Cancel', 'Sending…');
    app.sendReaction(conv, reacting.message, emoji, remove).then(function () {
      stopReact();
    }, function (err) {
      reactBusy = false;
      reactErr.textContent = 'Not sent: ' + err.message;
      setSoftkeys('', 'Cancel', 'Send');
    });
  }

  function startCompose() {
    composing = true;
    composeErr.textContent = '';
    compose.hidden = false;
    ring.setEnabled(false);
    setSoftkeys('Send', 'Cancel', '');
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
    setSoftkeys('Reply', 'Back', 'React');
    updateCenterLabel();
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
    setSoftkeys('Sending…', 'Cancel', '');
    app.sendMessage(conv, text).then(function () {
      stopCompose();
    }, function (err) {
      // Keep the text so a retry is one key press.
      sending = false;
      input.disabled = false;
      composeErr.textContent = 'Not sent: ' + err.message;
      setSoftkeys('Send', 'Cancel', '');
      input.focus();
    });
  }

  const unsubStore = app.store.subscribe(renderMessages);

  function back() {
    ctx.navigate('conversations', { focusKey: key });
  }

  function onKey(e) {
    if (reacting) {
      if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
        const n = reacting.items.length;
        reacting.index = (reacting.index + (e.key === 'ArrowRight' ? 1 : n - 1)) % n;
        renderReactBar();
        e.preventDefault();
        return;
      }
      if (e.key === 'Enter') { sendReact(); e.preventDefault(); return; }
      if (e.key === 'SoftRight' || e.key === 'Backspace') { stopReact(); e.preventDefault(); return; }
      if (e.key === 'ArrowUp' || e.key === 'ArrowDown') { e.preventDefault(); }
      return;
    }
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
    if (e.key === 'Enter') {
      const m = focusedMessage();
      if (openable(m)) openMedia(m); else startReact();
      e.preventDefault();
    }
  }

  document.addEventListener('keydown', onKey);
  renderMessages();
  // Coming back from the viewer: land on the image, optionally with the
  // picker open (the viewer's React key).
  if (ctx.params && typeof ctx.params.focusTimestamp === 'number') {
    if (focusTimestamp(ctx.params.focusTimestamp) && ctx.params.react) startReact();
  }
  if (ctx.params && ctx.params.compose) startCompose();
  updateCenterLabel();

  return {
    detach: function () {
      unsubStore();
      ring.detach();
      document.removeEventListener('keydown', onKey);
    },
  };
}
