// Derive a bridge WS URL from its HTTP URL.
export function toWsUrl(httpUrl) {
  return httpUrl.replace(/^http:/, 'ws:').replace(/^https:/, 'wss:') + '/ws';
}

// Connect to the bridge, send first-frame auth, resolve on the hello reply.
// Rejects on timeout, malformed frame, or premature close.
//
// opts.onEvent(msg) receives every JSON frame received AFTER the hello.
// Take that callback instead of letting the caller install ws.onmessage
// themselves — otherwise a frame arriving between resolve and the caller's
// handler assignment would be lost.
export function connect(opts) {
  const url = opts.url;
  const token = opts.token;
  const timeoutMs = opts.timeoutMs || 5000;
  const onEvent = typeof opts.onEvent === 'function' ? opts.onEvent : null;

  return new Promise(function (resolve, reject) {
    let ws;
    try { ws = new WebSocket(url); }
    catch (e) { reject(e); return; }

    let handshakeDone = false;
    function finishHandshake(fn, arg) {
      if (handshakeDone) return;
      handshakeDone = true;
      clearTimeout(timer);
      fn(arg);
    }

    const timer = setTimeout(function () {
      try { ws.close(); } catch (_) {}
      finishHandshake(reject, new Error('ws timeout'));
    }, timeoutMs);

    ws.onopen = function () {
      try {
        ws.send(JSON.stringify({ type: 'auth', token: token }));
      } catch (e) {
        finishHandshake(reject, e);
      }
    };

    ws.onmessage = function (ev) {
      let msg;
      try { msg = JSON.parse(ev.data); }
      catch (_) {
        if (!handshakeDone) {
          try { ws.close(); } catch (_) {}
          finishHandshake(reject, new Error('bad json from bridge'));
        }
        return;
      }
      if (!handshakeDone) {
        if (msg && msg.type === 'hello') {
          finishHandshake(resolve, { ws: ws, hello: msg });
        } else if (msg && msg.type === 'error') {
          try { ws.close(); } catch (_) {}
          finishHandshake(reject, new Error(msg.reason || 'bridge error'));
        }
        return;
      }
      if (onEvent) onEvent(msg);
    };

    ws.onclose = function (ev) {
      finishHandshake(reject, new Error('closed: ' + ev.code));
    };

    ws.onerror = function () {
      finishHandshake(reject, new Error('ws error'));
    };
  });
}
