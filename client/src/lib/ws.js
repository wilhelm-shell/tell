// Derive a bridge WS URL from its HTTP URL.
export function toWsUrl(httpUrl) {
  return httpUrl.replace(/^http:/, 'ws:').replace(/^https:/, 'wss:') + '/ws';
}

// Connect to the bridge, send first-frame auth, resolve on the hello reply.
// Rejects on timeout, malformed frame, or premature close.
export function connect(opts) {
  const url = opts.url;
  const token = opts.token;
  const timeoutMs = opts.timeoutMs || 5000;

  return new Promise(function (resolve, reject) {
    let ws;
    try { ws = new WebSocket(url); }
    catch (e) { reject(e); return; }

    let done = false;
    function finish(fn, arg) {
      if (done) return;
      done = true;
      clearTimeout(timer);
      fn(arg);
    }

    const timer = setTimeout(function () {
      try { ws.close(); } catch (_) {}
      finish(reject, new Error('ws timeout'));
    }, timeoutMs);

    ws.onopen = function () {
      try {
        ws.send(JSON.stringify({ type: 'auth', token: token }));
      } catch (e) {
        finish(reject, e);
      }
    };

    ws.onmessage = function (ev) {
      let msg;
      try { msg = JSON.parse(ev.data); }
      catch (_) {
        try { ws.close(); } catch (_) {}
        finish(reject, new Error('bad json from bridge'));
        return;
      }
      if (msg && msg.type === 'hello') {
        finish(resolve, { ws: ws, hello: msg });
      } else if (msg && msg.type === 'error') {
        try { ws.close(); } catch (_) {}
        finish(reject, new Error(msg.reason || 'bridge error'));
      }
    };

    ws.onclose = function (ev) {
      finish(reject, new Error('closed: ' + ev.code));
    };

    ws.onerror = function () {
      finish(reject, new Error('ws error'));
    };
  });
}
