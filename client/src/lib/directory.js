// Recipient picker logic, pure so it is tested off-device.

// "+41 79 123 45 67", "0041...", "+41791234567" → "+41791234567"; null
// when the text is not a plausible international number.
export function normalizeNumber(text) {
  let s = String(text || '').replace(/[\s().-]/g, '');
  if (s.slice(0, 2) === '00') s = '+' + s.slice(2);
  if (!/^\+\d{6,15}$/.test(s)) return null;
  return s;
}

// Case-insensitive substring on the name, or digit substring on the id
// for contacts. Empty query matches everything.
export function filterDirectory(entries, query) {
  const q = String(query || '').trim().toLowerCase();
  const digits = q.replace(/[^\d]/g, '');
  const out = [];
  for (let i = 0; i < entries.length; i++) {
    const e = entries[i];
    if (!q
      || e.name.toLowerCase().indexOf(q) !== -1
      || (digits && e.kind === 'contact' && e.id.indexOf(digits) !== -1)) {
      out.push(e);
    }
  }
  return out;
}

// Rows for the picker, capped at `limit`, plus a synthetic "send to this
// number" row when the query is a number that no contact matched.
// `more` is how many matches were cut off, so the screen can say so
// instead of silently ending the list.
export function pickerRows(entries, query, limit) {
  const cap = limit || 50;
  const all = filterDirectory(entries, query);
  const rows = all.slice(0, cap);
  const number = normalizeNumber(query);
  if (number && !all.some((e) => e.kind === 'contact' && e.id === number)) {
    rows.unshift({ kind: 'number', id: number, name: number });
  }
  return { rows: rows, more: Math.max(0, all.length - cap) };
}
