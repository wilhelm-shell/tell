// mozSystem XHR bypasses same-origin — needs the `systemXHR` permission.
// Silently ignored on desktop Firefox, so the same code works there too.

export function request(opts) {
  const {
    method = 'GET',
    url,
    token,
    timeoutMs = 10000,
  } = opts;

  return new Promise(function (resolve, reject) {
    let xhr;
    try {
      xhr = new XMLHttpRequest({ mozSystem: true });
    } catch (_) {
      xhr = new XMLHttpRequest();
    }

    let done = false;
    const timer = setTimeout(function () {
      if (done) return;
      done = true;
      try { xhr.abort(); } catch (_) {}
      reject(new Error('timeout'));
    }, timeoutMs);

    xhr.open(method, url, true);
    if (token) xhr.setRequestHeader('Authorization', 'Bearer ' + token);

    xhr.onload = function () {
      if (done) return;
      done = true;
      clearTimeout(timer);
      let body = xhr.responseText;
      const ct = xhr.getResponseHeader('Content-Type') || '';
      if (ct.indexOf('application/json') !== -1) {
        try { body = JSON.parse(body); } catch (_) { /* leave as text */ }
      }
      if (xhr.status >= 200 && xhr.status < 300) {
        resolve({ status: xhr.status, body: body });
      } else {
        reject(new Error('http ' + xhr.status));
      }
    };

    xhr.onerror = function () {
      if (done) return;
      done = true;
      clearTimeout(timer);
      reject(new Error('network error'));
    };

    xhr.send();
  });
}
