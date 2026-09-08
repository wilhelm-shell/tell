import * as app from '../app.js';

// Plays one video attachment (Signal "GIFs" are MP4 too). The file comes
// over XHR as a blob and plays from a blob URL, so the token stays in a
// header. Whether the device decodes a given file is verify-on-device:
// this screen reports the failure instead of hiding it.
//
// Keys: centre = play/pause, Left/Right = seek 5 s, Back returns.
const SEEK_S = 5;

function fmtDuration(s) {
  if (!isFinite(s) || s < 0) return '';
  const m = Math.floor(s / 60);
  const r = Math.floor(s % 60);
  return m + ':' + (r < 10 ? '0' : '') + r;
}

export function render(root, ctx) {
  const p = ctx.params || {};

  root.innerHTML =
    '<header class="titlebar" id="title"></header>' +
    '<main id="body" class="viewer">' +
      '<p id="status" class="empty">Loading video…</p>' +
      '<video id="v" preload="auto" hidden></video>' +
    '</main>' +
    '<footer class="softkeys">' +
      '<span class="sk-left" id="sk-left"></span>' +
      '<span class="sk-center" id="sk-center"></span>' +
      '<span class="sk-right">Back</span>' +
    '</footer>';

  const title = root.querySelector('#title');
  const status = root.querySelector('#status');
  const video = root.querySelector('#v');
  const skLeft = root.querySelector('#sk-left');
  const skCenter = root.querySelector('#sk-center');
  const baseTitle = p.title || 'Video';
  title.textContent = baseTitle;
  let objectUrl = null;
  let alive = true;

  function updateChrome() {
    skCenter.textContent = video.paused ? 'Play' : 'Pause';
    const d = fmtDuration(video.duration);
    const t = fmtDuration(video.currentTime);
    skLeft.textContent = d ? t + ' / ' + d : '';
  }

  function back(react) {
    ctx.navigate('conversation', { key: p.key, focusTimestamp: p.timestamp, react: !!react });
  }

  function onKey(e) {
    if (e.key === 'SoftRight' || e.key === 'Backspace') { back(false); e.preventDefault(); return; }
    if (e.key === 'SoftLeft') { back(true); e.preventDefault(); return; }
    if (video.hidden) return;
    if (e.key === 'Enter') {
      if (video.paused) { try { video.play(); } catch (_) {} } else { video.pause(); }
      e.preventDefault();
      return;
    }
    if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
      try { video.currentTime = Math.max(0, video.currentTime + (e.key === 'ArrowRight' ? SEEK_S : -SEEK_S)); } catch (_) {}
      e.preventDefault();
    }
  }
  document.addEventListener('keydown', onKey);

  function show() {
    if (!video.hidden) return;
    status.hidden = true;
    video.hidden = false;
    updateChrome();
  }
  video.addEventListener('loadedmetadata', show);
  video.addEventListener('canplay', show);
  video.addEventListener('play', updateChrome);
  video.addEventListener('pause', updateChrome);
  video.addEventListener('timeupdate', updateChrome);
  video.addEventListener('ended', updateChrome);
  video.addEventListener('error', function () {
    // MediaError codes: 3 = decode, 4 = format not supported.
    const code = video.error ? video.error.code : 0;
    status.hidden = false;
    video.hidden = true;
    status.textContent = code === 4
      ? 'This phone cannot play this video format.'
      : 'Could not play the video (error ' + code + ').';
  });

  app.fetchRawAttachment(p.id).then(function (blob) {
    if (!alive) return;
    objectUrl = URL.createObjectURL(blob);
    video.src = objectUrl;
    // Verified on device: assigning src alone never starts loading here;
    // an explicit load() (and play(), which forces it regardless of the
    // preload policy) does. Probe: loadedmetadata within ~130 ms.
    try { video.load(); } catch (_) {}
    try {
      const p = video.play();
      if (p && typeof p.catch === 'function') p.catch(function () {});
    } catch (_) {}
  }, function (err) {
    if (!alive) return;
    status.textContent = /413/.test(err.message)
      ? 'This video is too large to play on the phone.'
      : 'Could not load the video: ' + err.message;
  });

  return {
    detach: function () {
      alive = false;
      document.removeEventListener('keydown', onKey);
      try { video.pause(); } catch (_) {}
      video.removeAttribute('src');
      try { video.load(); } catch (_) {}
      if (objectUrl) { try { URL.revokeObjectURL(objectUrl); } catch (_) {} }
    },
  };
}
