// The recipient directory for "new message": signal-cli's listContacts
// and listGroups reduced to what a picker on a 240px screen needs.
// Pure, so it is unit-tested against captured shapes.

function joinName(a, b) {
  return [a, b].filter((s) => typeof s === 'string' && s.trim()).join(' ').trim();
}

// Contact name, falling back from the address-book name to the profile
// name to the number. Never empty.
export function contactName(c) {
  return (typeof c.name === 'string' && c.name.trim())
    || joinName(c.givenName, c.familyName)
    || (c.profile && joinName(c.profile.givenName, c.profile.familyName))
    || (typeof c.nickName === 'string' && c.nickName.trim())
    || c.number;
}

// [{ kind: 'contact', id: number, name }, { kind: 'group', id, name }],
// sorted by name. Blocked, hidden, unregistered or number-less contacts
// and groups we are not (or no longer) a member of are left out.
export function mapDirectory(contacts, groups) {
  const out = [];
  const seen = new Set();
  for (const c of Array.isArray(contacts) ? contacts : []) {
    if (!c || typeof c.number !== 'string' || !c.number) continue;
    if (c.isBlocked || c.isHidden || c.unregistered) continue;
    if (seen.has(c.number)) continue;
    seen.add(c.number);
    out.push({ kind: 'contact', id: c.number, name: contactName(c) });
  }
  for (const g of Array.isArray(groups) ? groups : []) {
    if (!g || typeof g.id !== 'string' || !g.id) continue;
    if (!g.isMember || g.isBlocked) continue;
    out.push({ kind: 'group', id: g.id, name: (typeof g.name === 'string' && g.name.trim()) || 'group' });
  }
  out.sort((a, b) => {
    const x = a.name.toLowerCase();
    const y = b.name.toLowerCase();
    return x < y ? -1 : x > y ? 1 : 0;
  });
  return out;
}
