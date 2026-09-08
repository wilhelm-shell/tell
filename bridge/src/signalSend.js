// Outgoing Signal messages: from a client `signal.send` request to the
// signal-cli `send` JSON-RPC params, and from the daemon's answer to the
// `signal.message` frame everyone (and the backlog) should see.
//
// signal-cli only syncs our own sends to OTHER linked devices, so nothing
// would otherwise tell the phone that its message went out.

// Client request: { type: 'signal.send', id, text, peer? | group?, groupName? }
export function buildSendParams(req, account) {
  if (!account) throw new Error('no signal account linked');
  const text = typeof req.text === 'string' ? req.text.trim() : '';
  if (!text) throw new Error('empty message');
  const params = { account, message: text };
  if (typeof req.group === 'string' && req.group) {
    params.groupId = req.group;
  } else if (typeof req.peer === 'string' && req.peer) {
    params.recipient = [req.peer];
  } else {
    throw new Error('no recipient');
  }
  return params;
}

// Same shape as envelopeToMessage() produces for a sync sentMessage, so
// the client cannot tell the two apart (and dedups on source + timestamp).
export function sentMessageFrame(req, account, result) {
  const text = req.text.trim();
  const group = typeof req.group === 'string' && req.group
    ? { id: req.group, name: typeof req.groupName === 'string' ? req.groupName : null }
    : null;
  return {
    type: 'signal.message',
    account,
    direction: 'out',
    source: account,
    sourceName: null,
    peer: group ? null : req.peer,
    timestamp: result && result.timestamp ? result.timestamp : Date.now(),
    text,
    attachments: 0,
    group,
  };
}
