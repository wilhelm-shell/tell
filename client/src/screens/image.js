import * as app from '../app.js';

// Full-screen viewer for one image attachment. The bridge sends a copy
// already scaled to the screen; we fetch it with the bearer header and
// show it from a blob URL, so the token never appears in an <img src>.
export function render(root, ctx) {
  const p = ctx.params || {};

  root.innerHTML =
    '<header class="titlebar" id="title"></header>' +
    '<main id="body" class="viewer">' +
      '<p id="status" class="empty">Loading image…</p>' +
      '<img id="img" alt="" hidden>' +
    '</main>' +
    '<footer class="softkeys">' +
      '<span class="sk-left"></span>' +
      '<span class="sk-center">React</span>' +
      '<span class="sk-right">Back</span>' +
    '</footer>';

  root.querySelector('#title').textContent = p.title || 'Image';
  const status = root.querySelector('#status');
  const img = root.querySelector('#img');
  let objectUrl = null;
  let alive = true;

  // Back lands on the image message; React does the same with the
  // picker already open, so reacting to a picture is one key from here.
  function back(react) {
    ctx.navigate('conversation', { key: p.key, focusTimestamp: p.timestamp, react: !!react });
  }

  function onKey(e) {
    if (e.key === 'SoftRight' || e.key === 'Backspace') { back(false); e.preventDefault(); return; }
    if (e.key === 'Enter') { back(true); e.preventDefault(); }
  }
  document.addEventListener('keydown', onKey);

  // Ask for the visible area: the panel minus title and softkey bars.
  app.fetchAttachment(p.id, 240, 272).then(function (blob) {
    if (!alive) return;
    objectUrl = URL.createObjectURL(blob);
    img.onload = function () { status.hidden = true; img.hidden = false; };
    img.onerror = function () { status.textContent = 'Could not display this image.'; };
    img.src = objectUrl;
  }, function (err) {
    if (!alive) return;
    status.textContent = 'Could not load the image: ' + err.message;
  });

  return {
    detach: function () {
      alive = false;
      document.removeEventListener('keydown', onKey);
      img.src = '';
      if (objectUrl) { try { URL.revokeObjectURL(objectUrl); } catch (_) {} }
    },
  };
}
