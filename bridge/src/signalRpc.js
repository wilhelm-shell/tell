import net from 'node:net';
import { EventEmitter } from 'node:events';

const RECONNECT_DELAY_MS = 2000;
const REQUEST_TIMEOUT_MS = 30000;
// A single JSON-RPC line larger than this is not something we expect from
// signal-cli; drop the buffer rather than let it grow without bound.
const MAX_LINE_BYTES = 1 << 20;

// Reduce a signal-cli `receive` notification to the flat shape the client
// needs. Returns null for envelopes that carry no message for a human to
// read: delivery/read receipts, typing indicators, calls, stories,
// reactions, remote deletes, expiration-timer updates.
//
// With the default --receive-mode=on-start, signal-cli puts the envelope
// directly in `params`. An explicit subscribeReceive request would wrap it
// in `params.result`; accepted too, so a later change of receive mode
// does not silently break parsing.
export function envelopeToMessage(params) {
  if (!params || typeof params !== 'object') return null;
  const body = params.envelope
    ? params
    : (params.result && params.result.envelope ? params.result : null);
  if (!body) return null;
  const env = body.envelope;

  let data;
  let direction;
  let peer;
  if (env.dataMessage) {
    data = env.dataMessage;
    direction = 'in';
    peer = env.sourceNumber || env.source || env.sourceUuid || null;
  } else if (env.syncMessage && env.syncMessage.sentMessage) {
    // A message sent from one of our OTHER devices (e.g. the primary phone)
    // reaches us as a sync message. Without this a conversation would only
    // show the other side.
    data = env.syncMessage.sentMessage;
    direction = 'out';
    peer = data.destinationNumber || data.destination || data.destinationUuid || null;
  } else {
    return null;
  }

  const text = typeof data.message === 'string' && data.message.length > 0 ? data.message : null;
  // Metadata only; the bytes are served scaled by /attachments/:id.
  const attachments = [];
  for (const a of Array.isArray(data.attachments) ? data.attachments : []) {
    if (!a || typeof a.id !== 'string' || !a.id) continue;
    attachments.push({
      id: a.id,
      contentType: typeof a.contentType === 'string' ? a.contentType : null,
      filename: typeof a.filename === 'string' ? a.filename : null,
      size: typeof a.size === 'number' ? a.size : null,
      width: typeof a.width === 'number' ? a.width : null,
      height: typeof a.height === 'number' ? a.height : null,
    });
  }
  if (text === null && attachments.length === 0) return null;

  const group = data.groupInfo
    ? { id: data.groupInfo.groupId || null, name: data.groupInfo.groupName || null }
    : null;

  return {
    account: body.account || null,
    direction,
    source: env.sourceNumber || env.source || null,
    sourceName: env.sourceName || null,
    // Conversation partner: the sender for incoming, the destination for
    // outgoing. Null for outgoing group messages (the group is the key).
    peer,
    timestamp: data.timestamp || env.timestamp || null,
    text,
    attachments,
    group,
  };
}

// A reaction rides in a dataMessage (someone reacting to us) or in a sync
// sentMessage (we reacted from another device). Signal identifies the
// target message by author + sent timestamp, so that is what we forward.
// Returns null when the envelope carries no reaction.
export function envelopeToReaction(params) {
  if (!params || typeof params !== 'object') return null;
  const body = params.envelope
    ? params
    : (params.result && params.result.envelope ? params.result : null);
  if (!body) return null;
  const env = body.envelope;

  let data;
  let direction;
  let peer;
  if (env.dataMessage && env.dataMessage.reaction) {
    data = env.dataMessage;
    direction = 'in';
    peer = env.sourceNumber || env.source || env.sourceUuid || null;
  } else if (env.syncMessage && env.syncMessage.sentMessage && env.syncMessage.sentMessage.reaction) {
    data = env.syncMessage.sentMessage;
    direction = 'out';
    peer = data.destinationNumber || data.destination || data.destinationUuid || null;
  } else {
    return null;
  }
  const r = data.reaction;
  if (!r || typeof r.targetSentTimestamp !== 'number') return null;
  const group = data.groupInfo
    ? { id: data.groupInfo.groupId || null, name: data.groupInfo.groupName || null }
    : null;
  return {
    account: body.account || null,
    direction,
    source: env.sourceNumber || env.source || null,
    sourceName: env.sourceName || null,
    peer: group ? null : peer,
    group,
    emoji: typeof r.emoji === 'string' ? r.emoji : '',
    remove: r.isRemove === true,
    target: {
      author: r.targetAuthorNumber || r.targetAuthor || null,
      timestamp: r.targetSentTimestamp,
    },
  };
}

// Read sync from the primary phone: "these messages were read there",
// each named by sender + sent timestamp. Returns [] when there are none.
export function envelopeToReads(params) {
  if (!params || typeof params !== 'object') return [];
  const body = params.envelope
    ? params
    : (params.result && params.result.envelope ? params.result : null);
  if (!body) return [];
  const env = body.envelope;
  const list = env.syncMessage && Array.isArray(env.syncMessage.readMessages)
    ? env.syncMessage.readMessages
    : [];
  const out = [];
  for (const r of list) {
    if (!r || typeof r.timestamp !== 'number') continue;
    out.push({ sender: r.senderNumber || r.sender || null, timestamp: r.timestamp });
  }
  return out;
}

// Persistent TCP client for the signal-cli daemon's JSON-RPC socket.
// The wire format is one JSON object per line. Two kinds of frames come
// back: notifications (a `method`, no `id`) that we turn into 'message'
// events, and responses to our own requests, matched to the caller by `id`.
//
// Events: 'connected', 'disconnected' ({reason}), 'message' (see
// envelopeToMessage). Reconnects on its own while started, since the
// daemon restarting is the normal case, not an error.
export class SignalRpcClient extends EventEmitter {
  constructor(opts = {}) {
    super();
    this.host = opts.host || '127.0.0.1';
    this.port = opts.port || 7583;
    this.connectFn = opts.connectFn || net.connect;
    this.setTimeoutFn = opts.setTimeoutFn || setTimeout;
    this.clearTimeoutFn = opts.clearTimeoutFn || clearTimeout;
    this.requestTimeoutMs = opts.requestTimeoutMs || REQUEST_TIMEOUT_MS;
    this._sock = null;
    this._connected = false;
    this._running = false;
    this._buf = '';
    this._pending = new Map();
    this._nextId = 1;
  }

  get connected() { return this._connected; }

  // Send a JSON-RPC request; resolves with `result`, rejects on an error
  // response, on timeout, or when the socket drops while waiting.
  call(method, params) {
    return new Promise((resolve, reject) => {
      if (!this._connected || !this._sock) {
        reject(new Error('signal-cli not connected'));
        return;
      }
      const id = 'q' + this._nextId++;
      const timer = this.setTimeoutFn(() => {
        this._pending.delete(id);
        reject(new Error(`signal-cli timeout (${method})`));
      }, this.requestTimeoutMs);
      this._pending.set(id, { resolve, reject, timer });
      try {
        this._sock.write(JSON.stringify({ jsonrpc: '2.0', method, params: params || {}, id }) + '\n');
      } catch (e) {
        this.clearTimeoutFn(timer);
        this._pending.delete(id);
        reject(e);
      }
    });
  }

  _rejectAllPending(reason) {
    for (const [id, p] of this._pending) {
      this.clearTimeoutFn(p.timer);
      this._pending.delete(id);
      p.reject(new Error(reason));
    }
  }

  start() {
    if (this._running) return;
    this._running = true;
    this._connect();
  }

  stop() {
    this._running = false;
    const s = this._sock;
    this._sock = null;
    this._connected = false;
    this._rejectAllPending('signal-cli client stopped');
    if (s) { try { s.destroy(); } catch (_) {} }
  }

  _connect() {
    if (!this._running) return;
    const sock = this.connectFn(this.port, this.host);
    this._sock = sock;
    this._buf = '';
    let lastError = null;
    sock.setEncoding('utf8');
    sock.on('connect', () => {
      if (this._sock !== sock) return;
      this._connected = true;
      this.emit('connected');
    });
    sock.on('data', (chunk) => {
      if (this._sock === sock) this._onData(chunk);
    });
    // 'error' is always followed by 'close' on a net.Socket, so the
    // reconnect decision lives in one place.
    sock.on('error', (err) => { lastError = err; });
    sock.on('close', () => {
      if (this._sock !== sock) return;
      this._sock = null;
      this._connected = false;
      this._rejectAllPending('signal-cli disconnected');
      this.emit('disconnected', { reason: lastError ? lastError.message : 'closed' });
      this._scheduleReconnect();
    });
  }

  _scheduleReconnect() {
    if (!this._running) return;
    this.setTimeoutFn(() => this._connect(), RECONNECT_DELAY_MS);
  }

  _onData(chunk) {
    this._buf += chunk;
    let nl;
    while ((nl = this._buf.indexOf('\n')) !== -1) {
      const line = this._buf.slice(0, nl).trim();
      this._buf = this._buf.slice(nl + 1);
      if (line) this._onLine(line);
    }
    if (this._buf.length > MAX_LINE_BYTES) this._buf = '';
  }

  _onLine(line) {
    let frame;
    try { frame = JSON.parse(line); } catch (_) { return; }
    if (!frame || typeof frame !== 'object') return;
    if (frame.method === 'receive') {
      const msg = envelopeToMessage(frame.params);
      if (msg) { this.emit('message', msg); return; }
      const reaction = envelopeToReaction(frame.params);
      if (reaction) { this.emit('reaction', reaction); return; }
      const reads = envelopeToReads(frame.params);
      if (reads.length > 0) this.emit('read', reads);
      return;
    }
    if (frame.id != null && this._pending.has(frame.id)) {
      const p = this._pending.get(frame.id);
      this._pending.delete(frame.id);
      this.clearTimeoutFn(p.timer);
      if (frame.error) {
        p.reject(new Error(frame.error.message || 'signal-cli error'));
      } else {
        p.resolve(frame.result);
      }
    }
  }
}
