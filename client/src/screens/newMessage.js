import { attachFocusRing } from '../lib/nav.js';
import { escapeHtml } from '../lib/format.js';
import { pickerRows } from '../lib/directory.js';
import * as app from '../app.js';

// Page size (CLAUDE.md: paginate above ~50). A focusable "more" row at
// the end shows the next page; filtering starts over at page one.
const PAGE = 50;

// Pick a recipient: a filter input on top (native T9), matching contacts
// and groups below. Up/Down moves between the input and the rows through
// the ordinary focus ring; the input is just another focusable element,
// as on the settings screen.
export function render(root, ctx) {
  root.innerHTML =
    '<header class="titlebar">New message</header>' +
    '<main id="body">' +
      '<div class="picker">' +
        '<input id="filter" type="text" data-focusable placeholder="Name or number">' +
      '</div>' +
      '<p id="status" class="empty">Loading contacts…</p>' +
      '<ul id="list" class="rows"></ul>' +
    '</main>' +
    '<footer class="softkeys">' +
      '<span class="sk-left"></span>' +
      '<span class="sk-center">Select</span>' +
      '<span class="sk-right">Back</span>' +
    '</footer>';

  const input = root.querySelector('#filter');
  const status = root.querySelector('#status');
  const list = root.querySelector('#list');
  const ring = attachFocusRing(root.querySelector('main'));

  let entries = [];
  let rows = [];
  let pages = 1;
  let alive = true;

  function renderRows() {
    const result = pickerRows(entries, input.value, PAGE * pages);
    rows = result.rows;
    if (rows.length === 0) {
      list.innerHTML = '';
      status.hidden = false;
      status.textContent = entries.length === 0
        ? 'No contacts yet.'
        : 'No match. Type a full number with country code to message someone new.';
      return;
    }
    status.hidden = true;
    let html = '';
    for (let i = 0; i < rows.length; i++) {
      const r = rows[i];
      const label = r.kind === 'number' ? 'Send to ' + r.name : r.name;
      const tag = r.kind === 'group' ? '<span class="dir-tag">group</span>' : '';
      html +=
        '<li class="row" data-focusable data-index="' + i + '">' +
          '<div class="row-top"><span class="row-title">' + escapeHtml(label) + '</span>' + tag + '</div>' +
        '</li>';
    }
    if (result.more > 0) {
      html += '<li class="row row-more" data-focusable data-more>…and ' + result.more + ' more. Press the centre key to show them.</li>';
    }
    list.innerHTML = html;
  }

  function showMore() {
    const firstNew = rows.length;   // the "more" row's own index
    pages++;
    renderRows();
    // Focus ring indexes count the input as element 0.
    ring.focusAt(firstNew + 1);
  }

  function onFilterChange() {
    pages = 1;
    renderRows();
  }

  function open(r) {
    const key = r.kind === 'group' ? 'g:' + r.id : 'p:' + r.id;
    ctx.navigate('conversation', { key: key, title: r.name, compose: true });
  }

  function select() {
    const focused = root.querySelector('main .focused');
    if (focused && focused.hasAttribute('data-more')) {
      showMore();
    } else if (focused && focused.hasAttribute('data-index')) {
      open(rows[Number(focused.getAttribute('data-index'))]);
    } else if (rows.length > 0) {
      // Enter while still in the input: take the first match.
      open(rows[0]);
    }
  }

  function onKey(e) {
    if (e.key === 'Enter') { select(); e.preventDefault(); return; }
    if (e.key === 'SoftRight') { ctx.navigate('conversations'); e.preventDefault(); return; }
    if (e.key === 'Backspace') {
      // Editing text in the input; only an empty input (or a row) goes back.
      if (document.activeElement === input && input.value !== '') return;
      ctx.navigate('conversations');
      e.preventDefault();
    }
  }

  input.addEventListener('input', onFilterChange);
  document.addEventListener('keydown', onKey);
  input.focus();

  app.loadContacts().then(function (list) {
    if (!alive) return;
    entries = list;
    renderRows();
  }, function (err) {
    if (!alive) return;
    status.textContent = 'Could not load contacts: ' + err.message + '. You can still type a full number.';
    renderRows();
  });

  return {
    detach: function () {
      alive = false;
      input.removeEventListener('input', onFilterChange);
      document.removeEventListener('keydown', onKey);
      ring.detach();
    },
  };
}
